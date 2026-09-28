//! Smoke test for the `serve` binary: bind on port 0, read the port from the
//! first stdout line, then speak raw HTTP/1.1 to it over `tokio::net::TcpStream`.
//! No HTTP client crate: the wire format *is* the contract under test.

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

/// Kills the server even when an assertion panics.
struct Server(Child, u16);
impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn start_server(scenario: &str) -> Server {
    let mut child = Command::new(env!("CARGO_BIN_EXE_serve"))
        .args(["--scenario", scenario, "--port", "0", "--interval-ms", "40", "--budget", "500", "--tasks", "6", "--seed", "11"])
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("serve binary spawns");
    let mut first = String::new();
    BufReader::new(child.stdout.take().expect("piped stdout")).read_line(&mut first).expect("first stdout line");
    // "listening on http://127.0.0.1:PORT"
    let port: u16 = first.trim().rsplit(':').next().and_then(|p| p.parse().ok()).unwrap_or_else(|| panic!("no port in {first:?}"));
    Server(child, port)
}

/// One request; the server answers with `Connection: close`, so read to EOF.
async fn call(port: u16, method: &str, path: &str) -> (String, String) {
    let mut s = TcpStream::connect(("127.0.0.1", port)).await.expect("connect");
    s.write_all(format!("{method} {path} HTTP/1.1\r\nHost: localhost\r\nOrigin: http://example.test\r\n\r\n").as_bytes()).await.unwrap();
    let mut raw = Vec::new();
    timeout(Duration::from_secs(5), s.read_to_end(&mut raw)).await.expect("response within 5s").unwrap();
    let text = String::from_utf8_lossy(&raw).into_owned();
    let (head, body) = text.split_once("\r\n\r\n").expect("head/body split");
    (head.to_string(), body.to_string())
}

#[tokio::test]
async fn serve_speaks_state_events_and_commands() {
    let server = start_server("house");
    let port = server.1;

    // GET /state → the StateView, with CORS.
    let (head, body) = call(port, "GET", "/state").await;
    assert!(head.starts_with("HTTP/1.1 200 OK"), "{head}");
    assert!(head.contains("Access-Control-Allow-Origin: *"), "{head}");
    assert!(head.contains("Content-Type: application/json"), "{head}");
    let state: serde_json::Value = serde_json::from_str(&body).expect("state is JSON");
    assert!(state["tick"].is_u64(), "state.tick: {}", state["tick"]);
    assert!(state["nodes"].is_array() && !state["nodes"].as_array().unwrap().is_empty());
    assert!(state["held"].is_array());
    assert_eq!(state["active_scale"], "House");
    assert_eq!(state["executor"], "tokio-multi-thread");

    // GET /events → hello, then a tick frame carrying {report, events}.
    let mut sse = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    sse.write_all(b"GET /events HTTP/1.1\r\nHost: localhost\r\nAccept: text/event-stream\r\n\r\n").await.unwrap();
    let mut buf = Vec::new();
    let mut chunk = [0u8; 4096];
    let tick_frame = timeout(Duration::from_secs(10), async {
        loop {
            let n = sse.read(&mut chunk).await.unwrap();
            assert!(n > 0, "server closed the event stream early");
            buf.extend_from_slice(&chunk[..n]);
            let text = String::from_utf8_lossy(&buf);
            if let Some(start) = text.find("event: tick\ndata: ") {
                let rest = &text[start + "event: tick\ndata: ".len()..];
                if let Some(end) = rest.find("\n\n") {
                    break rest[..end].to_string();
                }
            }
        }
    })
    .await
    .expect("a tick event within 10s");
    let text = String::from_utf8_lossy(&buf);
    assert!(text.starts_with("HTTP/1.1 200 OK"), "{text}");
    assert!(text.contains("Content-Type: text/event-stream"));
    assert!(text.contains("event: hello\ndata: context-engine "), "hello frame missing: {text}");
    let tick: serde_json::Value = serde_json::from_str(&tick_frame).expect("tick data is JSON");
    assert!(tick["report"]["tick"].as_u64().unwrap() >= 1);
    assert!(tick["report"]["root"].is_string() || tick["report"]["root"].is_object() || tick["report"]["root"].is_array());
    assert!(tick["events"].is_array(), "events: {}", tick["events"]);
    drop(sse); // a client hangs up: the server must not care

    // POST /pause → {"ok":true}, and the tick counter stops moving.
    let (head, body) = call(port, "POST", "/pause").await;
    assert!(head.starts_with("HTTP/1.1 200 OK"), "{head}");
    assert_eq!(serde_json::from_str::<serde_json::Value>(&body).unwrap(), serde_json::json!({"ok": true}));
    let t1 = serde_json::from_str::<serde_json::Value>(&call(port, "GET", "/state").await.1).unwrap()["tick"].as_u64().unwrap();
    tokio::time::sleep(Duration::from_millis(200)).await;
    let t2 = serde_json::from_str::<serde_json::Value>(&call(port, "GET", "/state").await.1).unwrap()["tick"].as_u64().unwrap();
    assert_eq!(t1, t2, "paused engine must not tick");

    // The camera and the purse, and the error shapes.
    let (head, body) = call(port, "POST", "/zoom/2").await;
    assert!(head.starts_with("HTTP/1.1 200 OK"), "{head} {body}");
    let zoomed: serde_json::Value = serde_json::from_str(&call(port, "GET", "/state").await.1).unwrap();
    assert_eq!(zoomed["active_scale"], "Street");
    let node_id = zoomed["nodes"][0]["id"].as_u64().unwrap();
    let (head, _) = call(port, "POST", &format!("/top-up/{node_id}/25.5")).await;
    assert!(head.starts_with("HTTP/1.1 200 OK"), "{head}");
    let (head, _) = call(port, "POST", "/zoom/9").await;
    assert!(head.starts_with("HTTP/1.1 400"), "{head}");
    let (head, body) = call(port, "POST", "/top-up/424242/1").await;
    assert!(head.starts_with("HTTP/1.1 404"), "{head}");
    assert_eq!(serde_json::from_str::<serde_json::Value>(&body).unwrap()["ok"], false);
    let (head, _) = call(port, "GET", "/nope").await;
    assert!(head.starts_with("HTTP/1.1 404"), "{head}");

    // OPTIONS preflight, then resume.
    let (head, _) = call(port, "OPTIONS", "/authorize/1").await;
    assert!(head.starts_with("HTTP/1.1 204"), "{head}");
    assert!(head.contains("Access-Control-Allow-Methods: GET, POST, OPTIONS"), "{head}");
    let (head, _) = call(port, "POST", "/resume").await;
    assert!(head.starts_with("HTTP/1.1 200 OK"), "{head}");
}
