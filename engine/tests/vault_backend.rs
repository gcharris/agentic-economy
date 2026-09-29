//! The Vault backend against a loopback mock server. No live call is made,
//! and the key used here is a fixed test string, not a credential.
#![cfg(feature = "vault")]

use context_engine::agents::llm::InferenceBackend;
use context_engine::agents::vault::{
    KeySource, VaultBackend, VaultConfig, CIRCUIT_OPEN, DEFAULT_SYSTEM_PROMPT,
};
use context_engine::executor::block_on;
use context_engine::resources::ModelTier;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::Duration;

/// A fixed test string standing in for the Director key. Not a credential.
const FAKE_KEY: &str = "not-a-real-key-vault-backend-test-0123456789";

const HELLO: &str = r#"{"content": "hello from the vault", "execution": {"provider": "gemini", "model": "gemini-3.8-flash", "request_id": "r1"}}"#;

// ── the mock server ──

struct Captured {
    method: String,
    path: String,
    headers: Vec<(String, String)>,
    body: String,
}

impl Captured {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

struct MockServer {
    url: String,
    requests: mpsc::Receiver<Captured>,
    hits: Arc<AtomicUsize>,
}

impl MockServer {
    fn next_request(&self) -> Captured {
        self.requests
            .recv_timeout(Duration::from_secs(5))
            .expect("the mock server saw a request")
    }

    fn hits(&self) -> usize {
        self.hits.load(Ordering::SeqCst)
    }
}

/// Answers the scripted (status, body) pairs in order, one request per
/// connection, then keeps answering 200 with a sentinel so an unexpected
/// extra call is visible both in `hits` and in the content it returns.
fn mock_server(script: Vec<(u16, String)>) -> MockServer {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind loopback");
    let port = listener.local_addr().unwrap().port();
    let (tx, rx) = mpsc::channel();
    let hits = Arc::new(AtomicUsize::new(0));
    let counter = hits.clone();
    thread::spawn(move || {
        let mut script = script.into_iter();
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { break };
            counter.fetch_add(1, Ordering::SeqCst);
            let captured = read_request(&mut stream);
            let (status, body) = script
                .next()
                .unwrap_or((200, r#"{"content": "UNEXPECTED EXTRA CALL"}"#.to_string()));
            write_response(&mut stream, status, &body);
            let _ = tx.send(captured);
        }
    });
    MockServer {
        url: format!("http://127.0.0.1:{port}"),
        requests: rx,
        hits,
    }
}

fn read_request(stream: &mut TcpStream) -> Captured {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).unwrap();
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let path = parts.next().unwrap_or_default().to_string();
    let mut headers = Vec::new();
    let mut content_length = 0usize;
    loop {
        let mut h = String::new();
        reader.read_line(&mut h).unwrap();
        let h = h.trim_end_matches(['\r', '\n']);
        if h.is_empty() {
            break;
        }
        if let Some((k, v)) = h.split_once(':') {
            let (k, v) = (k.trim().to_string(), v.trim().to_string());
            if k.eq_ignore_ascii_case("content-length") {
                content_length = v.parse().unwrap_or(0);
            }
            headers.push((k, v));
        }
    }
    let mut body = vec![0u8; content_length];
    reader.read_exact(&mut body).unwrap();
    Captured {
        method,
        path,
        headers,
        body: String::from_utf8(body).unwrap(),
    }
}

fn write_response(stream: &mut TcpStream, status: u16, body: &str) {
    let reason = match status {
        200 => "OK",
        302 => "Found",
        401 => "Unauthorized",
        403 => "Forbidden",
        429 => "Too Many Requests",
        500 => "Internal Server Error",
        502 => "Bad Gateway",
        503 => "Service Unavailable",
        _ => "Status",
    };
    let extra = if status == 302 {
        "Location: http://127.0.0.1:9/elsewhere\r\n"
    } else {
        ""
    };
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{extra}Connection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(head.as_bytes());
    let _ = stream.write_all(body.as_bytes());
    let _ = stream.flush();
}

// ── the backend under test ──

/// Writes the fake key (with a trailing newline, to prove trimming) to a
/// unique temp file; the backend reads it once at construction.
fn key_file(tag: &str) -> PathBuf {
    let path = std::env::temp_dir().join(format!(
        "context-engine-vault-test-{}-{tag}.key",
        std::process::id()
    ));
    std::fs::write(&path, format!("{FAKE_KEY}\n")).unwrap();
    path
}

fn config(url: &str, tag: &str) -> VaultConfig {
    VaultConfig {
        url: url.to_string(),
        key_source: KeySource::File(key_file(tag)),
        retry_pause: Duration::from_millis(10),
        timeout: Duration::from_secs(5),
        ..VaultConfig::default()
    }
}

fn backend(cfg: VaultConfig) -> VaultBackend {
    let path = match &cfg.key_source {
        KeySource::File(p) => Some(p.clone()),
        KeySource::Env(_) => None,
    };
    let b = VaultBackend::new(cfg).expect("backend builds");
    if let Some(p) = path {
        let _ = std::fs::remove_file(p);
    }
    b
}

fn status_body(status: u16, code: &str) -> (u16, String) {
    (
        status,
        format!(r#"{{"detail": {{"code": "{code}", "message": "echo {FAKE_KEY}"}}}}"#),
    )
}

// ── (1) the happy path: path, header, body, content ──

#[tokio::test]
async fn posts_the_review_body_with_the_key_header_and_returns_content() {
    let server = mock_server(vec![(200, HELLO.to_string())]);
    let b = backend(config(&server.url, "happy"));
    assert_eq!(b.endpoint(), format!("{}/api/v1/llm/review", server.url));

    let out = b
        .complete(ModelTier::FastQuantized, "Say hi".to_string())
        .await
        .expect("content");
    assert_eq!(out, "hello from the vault");

    let req = server.next_request();
    assert_eq!(req.method, "POST");
    assert_eq!(req.path, "/api/v1/llm/review");
    assert_eq!(req.header("x-director-key"), Some(FAKE_KEY));
    assert_eq!(req.header("content-type"), Some("application/json"));
    assert!(req.header("x-review-token").is_none());

    let body: serde_json::Value = serde_json::from_str(&req.body).unwrap();
    assert_eq!(body["tenant"], "001_master");
    assert_eq!(body["provider"], "gemini");
    assert_eq!(body["model"], "gemini-3.8-flash");
    assert_eq!(body["system_prompt"], DEFAULT_SYSTEM_PROMPT);
    assert_eq!(body["user_prompt"], "Say hi");
    assert!(
        body.get("temperature").is_some() && body["temperature"].is_null(),
        "temperature is sent explicitly as null"
    );
    assert_eq!(body["max_tokens"], 3072);
    assert_eq!(body.as_object().unwrap().len(), 7, "no extra fields");
    assert_eq!(server.hits(), 1);
    assert_eq!(b.consecutive_failures(), 0);
}

#[tokio::test]
async fn each_tier_routes_to_its_own_provider_and_model() {
    let server = mock_server(vec![
        (200, HELLO.to_string()),
        (200, HELLO.to_string()),
        (200, HELLO.to_string()),
    ]);
    let b = backend(config(&server.url, "tiers"));
    for tier in ModelTier::ALL {
        b.complete(tier, format!("on {}", tier.label()))
            .await
            .unwrap();
    }
    let expect = [
        ("gemini", "gemini-3.8-flash"),
        ("deepseek", "deepseek-v4-pro"),
        ("gemini", "gemini-3.1-pro-preview"),
    ];
    for (provider, model) in expect {
        let req = server.next_request();
        let body: serde_json::Value = serde_json::from_str(&req.body).unwrap();
        assert_eq!(body["provider"], provider);
        assert_eq!(body["model"], model);
    }
}

#[tokio::test]
async fn a_result_envelope_is_unwrapped_and_the_url_may_end_in_a_slash() {
    let server = mock_server(vec![(
        200,
        r#"{"verdict":"ok","result":{"verdict":"ok"},"execution":{"provider":"gemini"}}"#
            .to_string(),
    )]);
    let b = backend(config(&format!("{}/", server.url), "slash"));
    let out = b
        .complete(ModelTier::BalancedStaff, "judge".to_string())
        .await
        .unwrap();
    assert_eq!(out, r#"{"verdict":"ok"}"#);
    assert_eq!(server.next_request().path, "/api/v1/llm/review");
}

// ── (2) one retry on a 5xx ──

#[tokio::test]
async fn a_500_is_retried_once_and_the_200_is_returned() {
    let server = mock_server(vec![
        status_body(500, "llm_review_execution_failed"),
        (200, HELLO.to_string()),
    ]);
    let b = backend(config(&server.url, "retry"));
    let out = b
        .complete(ModelTier::FastQuantized, "again".to_string())
        .await
        .unwrap();
    assert_eq!(out, "hello from the vault");
    assert_eq!(server.hits(), 2, "exactly one retry");
    assert_eq!(b.consecutive_failures(), 0, "a success closes the count");
    let first = server.next_request();
    let second = server.next_request();
    assert_eq!(
        first.body, second.body,
        "the retry is the same call, same model"
    );
}

#[tokio::test]
async fn retries_are_bounded_and_the_error_names_status_and_code() {
    let server = mock_server(vec![
        status_body(503, "llm_review_provider_unavailable"),
        status_body(503, "llm_review_provider_unavailable"),
        status_body(503, "llm_review_provider_unavailable"),
        status_body(503, "llm_review_provider_unavailable"),
    ]);
    let b = backend(config(&server.url, "bounded"));
    let err = b
        .complete(ModelTier::FastQuantized, "again".to_string())
        .await
        .unwrap_err();
    assert_eq!(server.hits(), 3, "1 attempt + 2 retries");
    assert!(err.contains("503"), "{err}");
    assert!(err.contains("llm_review_provider_unavailable"), "{err}");
    assert!(err.contains("after 3 attempts"), "{err}");
    assert!(!err.contains(FAKE_KEY));
    assert_eq!(b.consecutive_failures(), 3);
}

// ── (3) a 401 is final and never echoes the key ──

#[tokio::test]
async fn a_401_is_not_retried_and_the_error_does_not_contain_the_key() {
    let server = mock_server(vec![status_body(401, "llm_review_provider_unauthorized")]);
    let b = backend(config(&server.url, "unauth"));
    let err = b
        .complete(ModelTier::FastQuantized, "who".to_string())
        .await
        .unwrap_err();
    assert_eq!(server.hits(), 1, "a 4xx is never retried");
    assert!(err.contains("401"), "{err}");
    assert!(err.contains("llm_review_provider_unauthorized"), "{err}");
    assert!(!err.contains(FAKE_KEY), "the error must not echo the key");
    assert!(!err.contains("echo"), "the error must not carry the body");
    assert!(!format!("{b:?}").contains(FAKE_KEY));
}

#[tokio::test]
async fn a_429_is_a_4xx_and_is_not_retried_either() {
    let server = mock_server(vec![status_body(429, "rate_limited")]);
    let b = backend(config(&server.url, "429"));
    let err = b
        .complete(ModelTier::FastQuantized, "burst".to_string())
        .await
        .unwrap_err();
    assert_eq!(server.hits(), 1);
    assert!(err.contains("429") && err.contains("rate_limited"), "{err}");
}

#[tokio::test]
async fn a_redirect_is_not_followed_so_the_key_goes_nowhere_else() {
    let server = mock_server(vec![(302, String::new())]);
    let b = backend(config(&server.url, "redirect"));
    let err = b
        .complete(ModelTier::FastQuantized, "go".to_string())
        .await
        .unwrap_err();
    assert_eq!(server.hits(), 1);
    assert!(
        err.contains("302") && err.contains("redirect not followed"),
        "{err}"
    );
}

#[tokio::test]
async fn a_200_with_empty_content_is_a_failure_and_not_retried() {
    let server = mock_server(vec![(
        200,
        r#"{"content": "", "execution": {"provider": "zhipu", "model": "glm-5.3-flash", "request_id": "r2"}}"#.to_string(),
    )]);
    let b = backend(config(&server.url, "empty"));
    let err = b
        .complete(ModelTier::FastQuantized, "think".to_string())
        .await
        .unwrap_err();
    assert_eq!(server.hits(), 1);
    assert!(err.contains("empty content"), "{err}");
    assert!(
        err.contains("zhipu/glm-5.3-flash") && err.contains("r2"),
        "{err}"
    );
    assert_eq!(b.consecutive_failures(), 1);
}

// ── (4) five 500s open the breaker; the sixth call never reaches the server ──

#[tokio::test]
async fn five_consecutive_500s_open_the_breaker_and_the_sixth_call_stays_home() {
    let server = mock_server(vec![
        status_body(500, "boom"),
        status_body(500, "boom"),
        status_body(500, "boom"),
        status_body(500, "boom"),
        status_body(500, "boom"),
        (200, HELLO.to_string()),
    ]);
    let cfg = VaultConfig {
        retries: 0,
        breaker_threshold: 5,
        breaker_cooldown: Duration::from_millis(300),
        ..config(&server.url, "breaker")
    };
    let b = backend(cfg);
    for i in 1..=5 {
        let err = b
            .complete(ModelTier::FastQuantized, format!("call {i}"))
            .await
            .unwrap_err();
        assert!(err.contains("500"), "{err}");
        assert_eq!(server.hits(), i);
    }
    assert!(b.circuit_open());

    let err = b
        .complete(ModelTier::FastQuantized, "call 6".to_string())
        .await
        .unwrap_err();
    assert_eq!(err, CIRCUIT_OPEN);
    assert_eq!(server.hits(), 5, "the sixth call did not reach the server");

    // After the cooldown one probe is admitted; it succeeds and the breaker closes.
    tokio::time::sleep(Duration::from_millis(350)).await;
    assert!(!b.circuit_open());
    let out = b
        .complete(ModelTier::FastQuantized, "call 7".to_string())
        .await
        .unwrap();
    assert_eq!(out, "hello from the vault");
    assert_eq!(server.hits(), 6);
    assert_eq!(b.consecutive_failures(), 0);
}

#[tokio::test]
async fn the_breaker_also_cuts_a_retry_loop_short() {
    // threshold 2, retries 5: the second failed attempt opens the breaker and
    // the loop stops there instead of making five more attempts.
    let server = mock_server(vec![status_body(500, "boom"), status_body(500, "boom")]);
    let cfg = VaultConfig {
        retries: 5,
        breaker_threshold: 2,
        ..config(&server.url, "breaker-retry")
    };
    let b = backend(cfg);
    let err = b
        .complete(ModelTier::FastQuantized, "x".to_string())
        .await
        .unwrap_err();
    assert_eq!(err, CIRCUIT_OPEN);
    assert_eq!(server.hits(), 2);
}

// ── (5) Debug redacts ──

#[test]
fn debug_prints_redacted_and_never_the_key() {
    let b = backend(config("http://127.0.0.1:9", "debug"));
    let dbg = format!("{b:?}");
    assert!(dbg.contains("<redacted>"), "{dbg}");
    assert!(!dbg.contains(FAKE_KEY), "{dbg}");
    assert!(dbg.contains("001_master"), "{dbg}");
    let alt = format!("{b:#?}");
    assert!(alt.contains("<redacted>") && !alt.contains(FAKE_KEY));
    let cfg_dbg = format!("{:?}", b.config());
    assert!(!cfg_dbg.contains(FAKE_KEY), "the config never held the key");
}

#[test]
fn the_key_may_come_from_an_env_var_and_debug_shows_only_its_name() {
    let name = format!("CONTEXT_ENGINE_VAULT_TEST_KEY_{}", std::process::id());
    std::env::set_var(&name, FAKE_KEY);
    let cfg = VaultConfig {
        url: "http://127.0.0.1:9".to_string(),
        key_source: KeySource::Env(name.clone()),
        ..VaultConfig::default()
    };
    let b = VaultBackend::new(cfg).unwrap();
    std::env::remove_var(&name);
    let dbg = format!("{b:?}");
    assert!(dbg.contains(&name) && dbg.contains("<redacted>") && !dbg.contains(FAKE_KEY));
}

#[test]
fn construction_fails_plainly_without_a_key() {
    let missing = VaultConfig {
        key_source: KeySource::File(PathBuf::from("/nonexistent/ces-director-key")),
        ..VaultConfig::default()
    };
    let err = VaultBackend::new(missing).unwrap_err();
    assert!(err.contains("unreadable"), "{err}");

    let empty_path = key_file("empty");
    std::fs::write(&empty_path, "  \n").unwrap();
    let empty = VaultConfig {
        key_source: KeySource::File(empty_path.clone()),
        ..VaultConfig::default()
    };
    assert_eq!(VaultBackend::new(empty).unwrap_err(), "vault key is empty");
    let _ = std::fs::remove_file(empty_path);

    let unset = VaultConfig {
        key_source: KeySource::Env("CONTEXT_ENGINE_VAULT_NO_SUCH_VAR".to_string()),
        ..VaultConfig::default()
    };
    assert!(VaultBackend::new(unset).unwrap_err().contains("unset"));
}

// ── without a Tokio runtime the call runs inline ──

#[test]
fn works_under_the_sequential_executor_without_a_runtime() {
    let server = mock_server(vec![(200, HELLO.to_string())]);
    let b = backend(config(&server.url, "inline"));
    let out = block_on(b.complete(ModelTier::FrontierDeep, "deep".to_string())).unwrap();
    assert_eq!(out, "hello from the vault");
    let body: serde_json::Value = serde_json::from_str(&server.next_request().body).unwrap();
    assert_eq!(body["model"], "gemini-3.1-pro-preview");
}

#[tokio::test]
async fn a_connection_refusal_is_a_transport_error_with_bounded_retries() {
    // Nothing listens on this port; ureq's connect is refused each time.
    let cfg = VaultConfig {
        retries: 1,
        ..config("http://127.0.0.1:9", "refused")
    };
    let b = backend(cfg);
    let err = b
        .complete(ModelTier::FastQuantized, "anyone".to_string())
        .await
        .unwrap_err();
    assert!(err.contains("transport error"), "{err}");
    assert!(err.contains("after 2 attempts"), "{err}");
    assert!(!err.contains(FAKE_KEY));
}
