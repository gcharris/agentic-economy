//! `serve`: the context engine behind a dependency-free HTTP/1.1 + SSE wall.
//!
//! ```text
//! cargo run --release --bin serve -- --scenario house --budget 800 --tasks 15 --seed 7 --interval-ms 700 --port 8787
//! cargo run --release --bin serve -- --scenario street --port 0     # port 0: pick a free port, print it
//! cargo run --release --bin serve -- --scenario city --streets 6 --houses 8   # Stage 3, sized (default 2 × 3)
//! cargo run --release --bin serve -- --scenario city --pack-depth 2           # pack the houses at the City (default 3 for the city)
//! cargo run --release --bin serve -- --scenario country|world   # Stages 4, 5 (fixed shapes; see wasm_abi.rs)
//! PORT=8080 serve --bind 0.0.0.0                                       # a hosted run: the port from the environment, all interfaces (no TLS, no auth: put a front door in front)
//! ```
//!
//! The engine lives in **one Tokio task** that owns `&mut Engine`. Nothing else
//! ever touches it: HTTP handlers send [`Cmd`]s down an mpsc channel and await a
//! oneshot reply; each tick is serialised once and fanned out to every SSE
//! subscriber through a broadcast channel. The wall clock drives only the
//! interval between ticks; the engine itself stays seeded and deterministic.
//!
//! ## Endpoints (all answers carry `Access-Control-Allow-Origin: *`)
//!
//! | method | path | answer |
//! |---|---|---|
//! | `GET` | `/state` | `application/json`: the engine's `state_json()` (a `StateView`) |
//! | `GET` | `/events` | `text/event-stream`: `event: hello` (engine version text) on connect, then one `event: tick` per engine tick with `data: {"report": TickReport, "events": [EngineEvent…]}` |
//! | `POST` | `/authorize/<envelope_id>` | `{"ok":true}` — the click at the Door (`envelope_id` is the decimal `u64` from `state.held[].envelope`); `404` if no Door holds that envelope |
//! | `POST` | `/reject/<envelope_id>` | `{"ok":true}` — the envelope is destroyed, its compute sunk; `404` if no Door holds that envelope |
//! | `POST` | `/top-up/<node_id>/<credits>` | `{"ok":true}` — money in the purse (`node_id` decimal `u64`, credits `f64`) |
//! | `POST` | `/zoom/<1-5>` | `{"ok":true}` — the camera: House=1 … World=5; packs/unpacks accordingly |
//! | `POST` | `/pause`, `/resume` | `{"ok":true}` — stop/restart the tick interval (state and commands still answer) |
//! | `OPTIONS` | any | `204` with CORS preflight headers |
//!
//! Unknown paths answer `404 {"ok":false,"error":…}`; malformed ids answer `400`; a
//! decision on an envelope nobody holds answers `404 {"ok":false,"error":"no envelope held with that id"}`
//! (audit ledger #33: `Engine::authorize` / `Engine::reject` return whether the id was held).
//! Request bodies are ignored; only the request line and headers are read.

use context_engine::prelude::*;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc, oneshot};

// ────────────────────────────────── arguments ─────────────────────────────

struct Args {
    scenario: String,
    budget: f64,
    tasks: usize,
    seed: u64,
    interval_ms: u64,
    port: u16,
    bind: String,
    /// `--scenario city` only: streets × houses per street (default 2 × 3, as the wasm's scenario 3).
    streets: usize,
    houses: usize,
    /// Levels below the camera at which children pack (EngineConfig::pack_depth); None: 3 for the city, else 2.
    pack_depth: Option<u8>,
}

fn parse_args() -> Args {
    let mut a = Args {
        scenario: "house".into(),
        budget: 800.0,
        tasks: 15,
        seed: 7,
        interval_ms: 700,
        // A hosted run (Cloud Run injects PORT) needs the port from the environment; local runs keep 8787.
        port: std::env::var("PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(8787),
        bind: "127.0.0.1".into(),
        streets: 2,
        houses: 3,
        pack_depth: None,
    };
    let mut it = std::env::args().skip(1);
    while let Some(k) = it.next() {
        match k.as_str() {
            "--scenario" => a.scenario = it.next().unwrap_or(a.scenario),
            "--budget" => a.budget = it.next().and_then(|v| v.parse().ok()).unwrap_or(a.budget),
            "--tasks" => a.tasks = it.next().and_then(|v| v.parse().ok()).unwrap_or(a.tasks),
            "--seed" => a.seed = it.next().and_then(|v| v.parse().ok()).unwrap_or(a.seed),
            "--interval-ms" => {
                a.interval_ms = it
                    .next()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(a.interval_ms)
            }
            "--port" => a.port = it.next().and_then(|v| v.parse().ok()).unwrap_or(a.port),
            "--bind" => a.bind = it.next().unwrap_or(a.bind),
            "--streets" => {
                a.streets = it
                    .next()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(a.streets)
                    .max(1)
            }
            "--pack-depth" => {
                a.pack_depth = it.next().and_then(|v| v.parse().ok()).or(a.pack_depth)
            }
            "--houses" => {
                a.houses = it
                    .next()
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(a.houses)
                    .max(1)
            }
            _ => {}
        }
    }
    a
}

// ─────────────────────────────── the engine task ──────────────────────────

/// What a handler may ask the engine task to do. Every command is answered
/// with a JSON body once it has been applied, so a `GET /state` issued after
/// the reply already reflects it.
#[derive(Debug)]
enum Cmd {
    State,
    Authorize(EnvelopeId),
    Reject(EnvelopeId),
    TopUp(NodeId, f64),
    Zoom(Stage),
    Pause,
    Resume,
}

struct Request {
    cmd: Cmd,
    reply: oneshot::Sender<String>,
}

/// Shared, read-only handles the HTTP side needs.
struct Hub {
    commands: mpsc::Sender<Request>,
    ticks: broadcast::Sender<Arc<str>>,
    hello: String,
}

const OK: &str = r#"{"ok":true}"#;
/// Ledger #33: a Door decision on an id no Door holds. `handle` turns any
/// non-`ok` body into a `404`.
const NO_ENVELOPE: &str = r#"{"ok":false,"error":"no envelope held with that id"}"#;

fn apply(engine: &mut Engine, cmd: Cmd, paused: &mut bool) -> String {
    match cmd {
        Cmd::State => engine.state_json(),
        Cmd::Authorize(id) => {
            if engine.authorize(id) {
                OK.into()
            } else {
                NO_ENVELOPE.into()
            }
        }
        Cmd::Reject(id) => {
            if engine.reject(id) {
                OK.into()
            } else {
                NO_ENVELOPE.into()
            }
        }
        Cmd::TopUp(node, credits) => {
            if engine.node(node).is_none() {
                return format!(r#"{{"ok":false,"error":"unknown node {}"}}"#, node.0);
            }
            engine.top_up(node, credits);
            OK.into()
        }
        Cmd::Zoom(stage) => {
            engine.set_active_scale(stage);
            OK.into()
        }
        Cmd::Pause => {
            *paused = true;
            OK.into()
        }
        Cmd::Resume => {
            *paused = false;
            OK.into()
        }
    }
}

/// The only place `&mut Engine` exists. Runs until every command sender is gone.
async fn engine_task(
    mut engine: Engine,
    interval_ms: u64,
    mut rx: mpsc::Receiver<Request>,
    ticks: broadcast::Sender<Arc<str>>,
) {
    let mut paused = false;
    let mut clock = tokio::time::interval(Duration::from_millis(interval_ms.max(1)));
    clock.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            req = rx.recv() => match req {
                Some(Request { cmd, reply }) => { let _ = reply.send(apply(&mut engine, cmd, &mut paused)); }
                None => break,
            },
            _ = clock.tick(), if !paused => {
                let report = engine.tick().await;
                let events = engine.drain_events();
                let payload = serde_json::json!({ "report": report, "events": events }).to_string();
                let _ = ticks.send(Arc::from(payload)); // no subscribers is not an error
            }
        }
    }
}

// ───────────────────────────────── the HTTP wall ──────────────────────────

const CORS: &str = "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\n";

fn http(status: &str, content_type: &str, body: &str) -> Vec<u8> {
    format!("HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\n{CORS}Cache-Control: no-store\r\nConnection: close\r\n\r\n{body}", body.len()).into_bytes()
}

fn json(status: &str, body: &str) -> Vec<u8> {
    http(status, "application/json", body)
}

fn error(status: &str, msg: &str) -> Vec<u8> {
    json(
        status,
        &format!(r#"{{"ok":false,"error":"{}"}}"#, msg.replace('"', "'")),
    )
}

/// Read the request line and headers (up to the blank line). Bodies are ignored.
async fn read_head(stream: &mut TcpStream) -> Option<(String, String)> {
    let mut buf = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    while !buf.windows(4).any(|w| w == b"\r\n\r\n") {
        if buf.len() > 16 * 1024 {
            return None;
        }
        match stream.read(&mut chunk).await {
            Ok(0) | Err(_) => return None,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
        }
    }
    let head = String::from_utf8_lossy(&buf);
    let mut line = head.lines().next()?.split_whitespace();
    let method = line.next()?.to_string();
    let path = line.next()?.split('?').next()?.to_string();
    Some((method, path))
}

/// Map a `POST` path to a command, or to an error response.
fn route_post(path: &str) -> Result<Cmd, Vec<u8>> {
    let seg: Vec<&str> = path.trim_matches('/').split('/').collect();
    let bad = |what: &str| error("400 Bad Request", &format!("malformed {what}"));
    match seg.as_slice() {
        ["pause"] => Ok(Cmd::Pause),
        ["resume"] => Ok(Cmd::Resume),
        ["authorize", id] => id
            .parse()
            .map(|v| Cmd::Authorize(EnvelopeId(v)))
            .map_err(|_| bad("envelope id")),
        ["reject", id] => id
            .parse()
            .map(|v| Cmd::Reject(EnvelopeId(v)))
            .map_err(|_| bad("envelope id")),
        ["top-up", id, credits] => {
            let node = id.parse().map(NodeId).map_err(|_| bad("node id"))?;
            let credits: f64 = credits.parse().map_err(|_| bad("credits"))?;
            if !credits.is_finite() || credits < 0.0 {
                return Err(bad("credits"));
            }
            Ok(Cmd::TopUp(node, credits))
        }
        ["zoom", level] => level
            .parse::<u8>()
            .ok()
            .and_then(Stage::from_level)
            .map(Cmd::Zoom)
            .ok_or_else(|| bad("zoom level (1-5)")),
        _ => Err(error("404 Not Found", &format!("no route for POST {path}"))),
    }
}

async fn ask(hub: &Hub, cmd: Cmd) -> Option<String> {
    let (tx, rx) = oneshot::channel();
    hub.commands.send(Request { cmd, reply: tx }).await.ok()?;
    rx.await.ok()
}

/// One connection, start to finish. Every early return is a clean close.
async fn handle(hub: Arc<Hub>, mut stream: TcpStream) {
    let Some((method, path)) = read_head(&mut stream).await else {
        return;
    };
    let answer: Vec<u8> = match (method.as_str(), path.as_str()) {
        ("OPTIONS", _) => format!("HTTP/1.1 204 No Content\r\n{CORS}Access-Control-Max-Age: 86400\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").into_bytes(),
        ("GET", "/state") => match ask(&hub, Cmd::State).await {
            Some(body) => json("200 OK", &body),
            None => error("503 Service Unavailable", "engine gone"),
        },
        ("GET", "/events") => return stream_events(hub, stream).await,
        ("GET", _) => error("404 Not Found", &format!("no route for GET {path}")),
        ("POST", _) => match route_post(&path) {
            Ok(cmd) => match ask(&hub, cmd).await {
                Some(body) if body.starts_with(r#"{"ok":true"#) => json("200 OK", &body),
                Some(body) => json("404 Not Found", &body),
                None => error("503 Service Unavailable", "engine gone"),
            },
            Err(resp) => resp,
        },
        _ => error("405 Method Not Allowed", "use GET, POST or OPTIONS"),
    };
    let _ = stream.write_all(&answer).await;
    let _ = stream.shutdown().await;
}

/// `GET /events`: subscribe before the first write so no tick is missed, say
/// hello, then relay ticks until the client hangs up or we fall too far behind.
async fn stream_events(hub: Arc<Hub>, stream: TcpStream) {
    let mut rx = hub.ticks.subscribe();
    let (mut rd, mut wr) = stream.into_split();
    let head = format!("HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\n{CORS}Connection: keep-alive\r\n\r\nretry: 1000\r\nevent: hello\ndata: {}\n\n", hub.hello);
    if wr.write_all(head.as_bytes()).await.is_err() {
        return;
    }
    let mut sink = [0u8; 256];
    loop {
        tokio::select! {
            // The client's half of the socket: EOF or error means they left.
            n = rd.read(&mut sink) => if matches!(n, Ok(0) | Err(_)) { break },
            msg = rx.recv() => match msg {
                Ok(payload) => {
                    let frame = format!("event: tick\ndata: {payload}\n\n");
                    if wr.write_all(frame.as_bytes()).await.is_err() { break; }
                }
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    let note = format!("event: lagged\ndata: {{\"skipped\":{skipped}}}\n\n");
                    if wr.write_all(note.as_bytes()).await.is_err() { break; }
                }
                Err(broadcast::error::RecvError::Closed) => break,
            },
        }
    }
    let _ = wr.shutdown().await;
}

// ───────────────────────────────────── main ───────────────────────────────

#[tokio::main]
async fn main() {
    let a = parse_args();
    let config = EngineConfig {
        seed: a.seed,
        // As the wasm: the city keeps its houses live at the City unless told otherwise (AUDIT-LEDGER #30).
        pack_depth: a
            .pack_depth
            .unwrap_or(if a.scenario == "city" { 3 } else { 2 }),
        ..Default::default()
    };
    let mut engine = match a.scenario.as_str() {
        "street" => street(config, 6, a.budget, a.tasks),
        "city" => city(config, a.streets, a.houses, a.budget, a.tasks),
        "country" => forged_country(config, 5, 2, 2, 200.0, 10_000.0).0,
        "world" => world(config, 3, 2),
        _ => house(config, a.budget, a.tasks),
    };
    engine.set_executor(Box::new(TokioExecutor));
    let hello = format!(
        "context-engine {} (native, {} executor, scenario {}, seed {})",
        env!("CARGO_PKG_VERSION"),
        engine.executor_name(),
        a.scenario,
        a.seed
    );

    let listener = match TcpListener::bind((a.bind.as_str(), a.port)).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("serve: cannot bind port {}: {e}", a.port);
            std::process::exit(2);
        }
    };
    let addr = listener.local_addr().expect("bound socket has an address");
    // First line of stdout is machine-readable: tests and launchers read the port here.
    println!("listening on http://{addr}");
    println!("{hello} · tick every {} ms · GET /state · GET /events · POST /authorize|/reject|/top-up|/zoom|/pause|/resume", a.interval_ms);

    let (cmd_tx, cmd_rx) = mpsc::channel::<Request>(256);
    let (tick_tx, _) = broadcast::channel::<Arc<str>>(64);
    tokio::spawn(engine_task(engine, a.interval_ms, cmd_rx, tick_tx.clone()));
    let hub = Arc::new(Hub {
        commands: cmd_tx,
        ticks: tick_tx,
        hello,
    });

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                let _ = stream.set_nodelay(true);
                tokio::spawn(handle(hub.clone(), stream));
            }
            Err(e) => eprintln!("serve: accept failed: {e}"),
        }
    }
}
