//! The estate Vault route as an [`InferenceBackend`]: one endpoint, one
//! header, every provider the Vault holds a key for. No provider credential
//! ever reaches this process. The Director key on disk authorises the call
//! and the engine resolves the provider key from the named tenant's vault.
//!
//! Reference: `context-engine-studio/knowledge/reference/dev-docs/`
//! `calling-vault-models-from-an-agent.md` (the route, the body, the
//! envelope, and the spend-control rules this module enforces).
//!
//! ## How a host constructs it
//!
//! ```no_run
//! use context_engine::agents::llm::LlmSeat;
//! use context_engine::agents::vault::{VaultBackend, VaultConfig};
//! use context_engine::resources::ModelTier;
//! use std::sync::Arc;
//!
//! let backend = Arc::new(VaultBackend::new(VaultConfig::default())?);
//! let scout = LlmSeat::new("Scout", ModelTier::FastQuantized, 0.8, backend);
//! # Ok::<(), String>(())
//! ```
//!
//! [`VaultConfig::default`] reads `~/.ces-director-key`, calls the production
//! engine as tenant `001_master`, and routes the three tiers to
//! `gemini/gemini-3.8-flash`, `deepseek/deepseek-v4-pro` and
//! `gemini/gemini-3.1-pro-preview`. Override any field before `new`. The
//! backend is `Clone` (an `Arc` inside) and one instance may be shared by
//! every seat in the engine: the breaker and the concurrency gate are shared
//! with it, which is what you want.
//!
//! ## Spend controls (the doc's rules, enforced here)
//!
//! * **Budget reserved before submission.** [`LlmSeat`] refuses to call any
//!   backend when the purse cannot cover the estimated burn of the call
//!   (prompt tokens plus [`LlmSeat::max_tokens_estimate`]). That rule lives
//!   in the seat so it holds for every backend, not only this one.
//! * **No silent fallback.** A call goes to exactly the provider and model
//!   the tier maps to. A failure is an `Err`; it is never retried on another
//!   seat, dearer or cheaper.
//! * **Bounded retries.** At most `retries` extra attempts, only on a 5xx or
//!   a transport error, with a widening pause (`retry_pause` × 1, × 3, × 9…).
//!   A 4xx, including 429, is never retried; a 3xx is never followed, so the
//!   key is never sent to a host the response named.
//! * **Circuit breaker.** After `breaker_threshold` consecutive failed
//!   attempts the backend opens for `breaker_cooldown` and answers
//!   `Err("vault circuit open")` without calling. When the cooldown has
//!   passed one probe call is let through; if it fails the breaker opens
//!   again at once.
//! * **Concurrency.** At most `max_in_flight` calls at a time (the route
//!   returns 429 above about three parallel calls).
//!
//! ## The key
//!
//! Read once, at construction, into a private field whose `Debug` prints
//! `<redacted>`. It is never logged and never part of an error string:
//! every `Err` this module returns is scrubbed for it, and a non-2xx answer
//! is reported as its status and the body's typed `detail.code`, never the
//! body itself, which may echo request headers.
//!
//! [`LlmSeat`]: crate::agents::llm::LlmSeat
//! [`LlmSeat::max_tokens_estimate`]: crate::agents::llm::LlmSeat::max_tokens_estimate

#[cfg(target_arch = "wasm32")]
compile_error!(
    "the `vault` feature is native-only: build the browser engine with --no-default-features"
);

use crate::agents::llm::{BackendFuture, InferenceBackend};
use crate::resources::ModelTier;
use serde::Serialize;
use std::fmt;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// The production engine behind the estate Vault.
pub const DEFAULT_URL: &str = "https://ces-backend-331630083873.us-central1.run.app";
/// The tenant whose vault holds the provider keys.
pub const DEFAULT_TENANT: &str = "001_master";
/// The one route: `POST {url}/api/v1/llm/review`.
pub const REVIEW_PATH: &str = "/api/v1/llm/review";
/// The system prompt sent with every call; the seat's own text is the user prompt.
pub const DEFAULT_SYSTEM_PROMPT: &str = "You are a seat at the oak table of a sovereign house in \
     The Agentic Economy. Reply with your work, plainly and briefly.";
/// The `Err` an open breaker answers with, without calling.
pub const CIRCUIT_OPEN: &str = "vault circuit open";
/// Largest response body read before the rest is discarded.
const MAX_RESPONSE_BYTES: u64 = 4 * 1024 * 1024;
/// Longest pause between two attempts, however many retries are configured.
const MAX_RETRY_PAUSE: Duration = Duration::from_secs(30);

/// Where the Director key is read from. Never the key itself.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum KeySource {
    /// A file holding the key on one line (default `~/.ces-director-key`).
    File(PathBuf),
    /// An environment variable holding the key.
    Env(String),
}

impl Default for KeySource {
    fn default() -> Self {
        KeySource::File(default_key_path())
    }
}

/// `~/.ces-director-key`, or `.ces-director-key` in the working directory
/// when `HOME` is unset.
pub fn default_key_path() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default()
        .join(".ces-director-key")
}

/// One Vault seat: the provider and model names the route understands.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModelRoute {
    pub provider: String,
    pub model: String,
}

impl ModelRoute {
    pub fn new(provider: impl Into<String>, model: impl Into<String>) -> Self {
        ModelRoute {
            provider: provider.into(),
            model: model.into(),
        }
    }
}

/// Which Vault seat answers for each [`ModelTier`].
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TierModels {
    pub fast_quantized: ModelRoute,
    pub balanced_staff: ModelRoute,
    pub frontier_deep: ModelRoute,
}

impl Default for TierModels {
    fn default() -> Self {
        TierModels {
            fast_quantized: ModelRoute::new("gemini", "gemini-3.8-flash"),
            balanced_staff: ModelRoute::new("deepseek", "deepseek-v4-pro"),
            frontier_deep: ModelRoute::new("gemini", "gemini-3.1-pro-preview"),
        }
    }
}

impl TierModels {
    pub fn route(&self, tier: ModelTier) -> &ModelRoute {
        match tier {
            ModelTier::FastQuantized => &self.fast_quantized,
            ModelTier::BalancedStaff => &self.balanced_staff,
            ModelTier::FrontierDeep => &self.frontier_deep,
        }
    }
}

/// Everything a host decides about the route. Holds no secret: the key is
/// read from `key_source` by [`VaultBackend::new`].
#[derive(Clone, Debug)]
pub struct VaultConfig {
    /// The engine, without the route path (default [`DEFAULT_URL`]).
    pub url: String,
    /// The tenant whose vault resolves the provider key (default [`DEFAULT_TENANT`]).
    pub tenant: String,
    /// Where the Director key is read from (default `~/.ces-director-key`).
    pub key_source: KeySource,
    /// The seat each tier buys.
    pub models: TierModels,
    /// Sent with every call as `system_prompt`; the seat's text is `user_prompt`.
    pub system_prompt: String,
    /// The completion allowance asked of the route (default 3072; the route caps at 8192).
    pub max_tokens: u32,
    /// Extra attempts after a 5xx or transport error (default 2). Never for a 4xx.
    pub retries: u32,
    /// Pause before the first retry (default 0.5 s); each further pause is three times longer.
    pub retry_pause: Duration,
    /// Whole-call timeout for one attempt (default 60 s).
    pub timeout: Duration,
    /// Consecutive failed attempts that open the breaker (default 5; 0 disables it).
    pub breaker_threshold: u32,
    /// How long an open breaker refuses calls (default 60 s).
    pub breaker_cooldown: Duration,
    /// Calls in flight at once across every seat sharing this backend (default 3).
    pub max_in_flight: u32,
}

impl Default for VaultConfig {
    fn default() -> Self {
        VaultConfig {
            url: DEFAULT_URL.to_string(),
            tenant: DEFAULT_TENANT.to_string(),
            key_source: KeySource::default(),
            models: TierModels::default(),
            system_prompt: DEFAULT_SYSTEM_PROMPT.to_string(),
            max_tokens: 3072,
            retries: 2,
            retry_pause: Duration::from_millis(500),
            timeout: Duration::from_secs(60),
            breaker_threshold: 5,
            breaker_cooldown: Duration::from_secs(60),
            max_in_flight: 3,
        }
    }
}

/// The Director key. Private, and `Debug` prints `<redacted>`.
struct Secret(String);

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("<redacted>")
    }
}

impl Secret {
    fn load(source: &KeySource) -> Result<Secret, String> {
        let raw = match source {
            KeySource::File(path) => std::fs::read_to_string(path).map_err(|e| {
                format!("vault key file {} unreadable: {}", path.display(), e.kind())
            })?,
            KeySource::Env(name) => std::env::var(name)
                .map_err(|_| format!("vault key env var {name} is unset or not unicode"))?,
        };
        let key = raw.trim().to_string();
        if key.is_empty() {
            return Err("vault key is empty".to_string());
        }
        if !key.bytes().all(|b| (0x21..=0x7e).contains(&b)) {
            return Err("vault key has characters not allowed in a header value".to_string());
        }
        Ok(Secret(key))
    }

    /// Belt and braces: no string leaves this module with the key in it.
    fn scrub(&self, text: String) -> String {
        if self.0.is_empty() || !text.contains(&self.0) {
            text
        } else {
            text.replace(&self.0, "<redacted>")
        }
    }
}

/// The breaker's state. Counts failed *attempts*, so a call's retries count
/// each, and a success anywhere closes it.
#[derive(Debug, Default)]
struct Breaker {
    consecutive_failures: u32,
    open_until: Option<Instant>,
}

impl Breaker {
    /// `Err(CIRCUIT_OPEN)` while open. Once the cooldown has passed, one
    /// probe attempt is admitted: the count stays one short of the
    /// threshold, so another failure opens the breaker again at once.
    fn admit(&mut self, threshold: u32, now: Instant) -> Result<(), String> {
        if let Some(until) = self.open_until {
            if now < until {
                return Err(CIRCUIT_OPEN.to_string());
            }
            self.open_until = None;
            self.consecutive_failures = threshold.saturating_sub(1);
        }
        Ok(())
    }

    fn failure(&mut self, threshold: u32, cooldown: Duration, now: Instant) {
        self.consecutive_failures = self.consecutive_failures.saturating_add(1);
        if threshold > 0 && self.consecutive_failures >= threshold {
            self.open_until = Some(now + cooldown);
        }
    }

    fn success(&mut self) {
        self.consecutive_failures = 0;
        self.open_until = None;
    }

    fn is_open(&self, now: Instant) -> bool {
        self.open_until.is_some_and(|until| now < until)
    }
}

/// The body of `POST /api/v1/llm/review`, field for field as the doc gives it.
/// `temperature` is always serialised as `null` (Kimi rejects any value).
#[derive(Serialize)]
struct ReviewRequest<'a> {
    tenant: &'a str,
    provider: &'a str,
    model: &'a str,
    system_prompt: &'a str,
    user_prompt: &'a str,
    temperature: Option<f64>,
    max_tokens: u32,
}

/// What one HTTP attempt came to.
enum Attempt {
    /// A 2xx with usable content.
    Content(String),
    /// A failure worth one more try: 5xx or transport.
    Retriable(String),
    /// A failure that must not be retried: 4xx, 3xx, empty or unreadable content.
    Final(String),
}

struct Inner {
    config: VaultConfig,
    endpoint: String,
    key: Secret,
    agent: ureq::Agent,
    breaker: Mutex<Breaker>,
    gate: tokio::sync::Semaphore,
}

impl Inner {
    fn admit(&self) -> Result<(), String> {
        self.breaker
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .admit(self.config.breaker_threshold, Instant::now())
    }

    fn note_failure(&self) {
        self.breaker
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .failure(
                self.config.breaker_threshold,
                self.config.breaker_cooldown,
                Instant::now(),
            );
    }

    fn note_success(&self) {
        self.breaker
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .success();
    }

    /// Pause before retry number `n` (1-based): `retry_pause × 3^(n-1)`, capped.
    fn pause(&self, n: u32) -> Duration {
        let factor = 3f64.powi(n.saturating_sub(1).min(8) as i32);
        Duration::from_secs_f64(self.config.retry_pause.as_secs_f64() * factor).min(MAX_RETRY_PAUSE)
    }

    /// The blocking call: build the body once, then attempt, retry within
    /// bounds, and report. Every string that leaves is scrubbed of the key.
    fn call(&self, tier: ModelTier, prompt: &str) -> Result<String, String> {
        let route = self.config.models.route(tier);
        let body = serde_json::to_string(&ReviewRequest {
            tenant: &self.config.tenant,
            provider: &route.provider,
            model: &route.model,
            system_prompt: &self.config.system_prompt,
            user_prompt: prompt,
            temperature: None,
            max_tokens: self.config.max_tokens,
        })
        .map_err(|e| format!("vault request body could not be serialised: {e}"))?;

        let mut attempt = 0u32;
        let outcome = loop {
            if let Err(open) = self.admit() {
                break Err(open);
            }
            attempt += 1;
            match self.attempt(&body) {
                Attempt::Content(text) => {
                    self.note_success();
                    break Ok(text);
                }
                Attempt::Final(err) => {
                    self.note_failure();
                    break Err(err);
                }
                Attempt::Retriable(err) => {
                    self.note_failure();
                    if attempt > self.config.retries {
                        break Err(format!("{err} (after {attempt} attempts)"));
                    }
                    std::thread::sleep(self.pause(attempt));
                }
            }
        };
        outcome.map_err(|e| self.key.scrub(e))
    }

    fn attempt(&self, body: &str) -> Attempt {
        let sent = self
            .agent
            .post(&self.endpoint)
            .header("X-Director-Key", self.key.0.as_str())
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .send(body);
        let mut response = match sent {
            Ok(r) => r,
            Err(e) => {
                return Attempt::Retriable(format!(
                    "vault transport error: {}",
                    describe_transport(&e)
                ))
            }
        };
        let status = response.status().as_u16();
        let text = match response
            .body_mut()
            .with_config()
            .limit(MAX_RESPONSE_BYTES)
            .read_to_string()
        {
            Ok(t) => t,
            Err(e) => {
                return Attempt::Retriable(format!(
                    "vault response unreadable (HTTP {status}): {}",
                    describe_transport(&e)
                ))
            }
        };
        match status {
            200..=299 => match extract_content(&text) {
                Ok(content) => Attempt::Content(content),
                Err(why) => Attempt::Final(format!(
                    "vault answered HTTP {status} without usable content: {why}"
                )),
            },
            300..=399 => Attempt::Final(format!(
                "vault answered HTTP {status}: redirect not followed"
            )),
            400..=499 => {
                Attempt::Final(format!("vault refused HTTP {status} {}", error_code(&text)))
            }
            500..=599 => Attempt::Retriable(format!(
                "vault upstream error HTTP {status} {}",
                error_code(&text)
            )),
            _ => Attempt::Final(format!("vault answered unexpected HTTP {status}")),
        }
    }
}

/// A short, header-free description of a transport error.
fn describe_transport(e: &ureq::Error) -> String {
    match e {
        ureq::Error::Timeout(_) => "timeout".to_string(),
        ureq::Error::ConnectionFailed => "connection failed".to_string(),
        ureq::Error::HostNotFound => "host not found".to_string(),
        ureq::Error::Io(io) => format!("io: {}", io.kind()),
        ureq::Error::Tls(_) | ureq::Error::Rustls(_) => "tls handshake failed".to_string(),
        ureq::Error::BodyExceedsLimit(n) => format!("body exceeds {n} bytes"),
        other => other.to_string(),
    }
}

/// The content of a 2xx body: `content` when it is a non-empty string, else
/// a `result` envelope (a string as is, an object or array re-serialised),
/// else an error naming the execution the engine reported.
fn extract_content(text: &str) -> Result<String, String> {
    use serde_json::Value;
    let v: Value = serde_json::from_str(text).map_err(|_| "body is not JSON".to_string())?;
    match v.get("content") {
        Some(Value::String(s)) if !s.trim().is_empty() => return Ok(s.clone()),
        Some(Value::Object(_))
        | Some(Value::Array(_))
        | Some(Value::Number(_))
        | Some(Value::Bool(_)) => return Ok(v["content"].to_string()),
        _ => {}
    }
    match v.get("result") {
        Some(Value::String(s)) if !s.trim().is_empty() => return Ok(s.clone()),
        Some(Value::Object(o)) if !o.is_empty() => return Ok(v["result"].to_string()),
        Some(Value::Array(a)) if !a.is_empty() => return Ok(v["result"].to_string()),
        Some(Value::Number(_)) | Some(Value::Bool(_)) => return Ok(v["result"].to_string()),
        _ => {}
    }
    Err(format!("empty content{}", execution_note(&v)))
}

/// `execution.provider`, `.model` and `.request_id`, as provenance.
fn execution_note(v: &serde_json::Value) -> String {
    let ex = match v.get("execution") {
        Some(ex) if ex.is_object() => ex,
        _ => return String::new(),
    };
    let field = |k: &str| {
        ex.get(k)
            .and_then(|x| x.as_str())
            .filter(|s| is_identifier(s))
    };
    let mut parts = Vec::new();
    if let (Some(p), Some(m)) = (field("provider"), field("model")) {
        parts.push(format!("{p}/{m}"));
    }
    if let Some(id) = field("request_id") {
        parts.push(format!("request {id}"));
    }
    if parts.is_empty() {
        String::new()
    } else {
        format!(" ({})", parts.join(", "))
    }
}

/// The typed code of an error body (`detail.code`, `detail.cause`, `code`,
/// `error`), and only that: never the body, which may echo a header.
fn error_code(text: &str) -> String {
    use serde_json::Value;
    let Ok(v) = serde_json::from_str::<Value>(text) else {
        return "unspecified".to_string();
    };
    fn pick(x: Option<&Value>) -> Option<&str> {
        x.and_then(|x| x.as_str()).filter(|s| is_identifier(s))
    }
    let detail = v.get("detail");
    let mut parts = Vec::new();
    if let Some(code) = pick(detail.and_then(|d| d.get("code")))
        .or_else(|| pick(v.get("code")))
        .or_else(|| pick(v.get("error")))
        .or_else(|| pick(detail))
    {
        parts.push(code.to_string());
    }
    if let Some(cause) = pick(detail.and_then(|d| d.get("cause"))) {
        parts.push(cause.to_string());
    }
    if parts.is_empty() {
        "unspecified".to_string()
    } else {
        parts.join("/")
    }
}

/// A short token made of `[A-Za-z0-9_.-]`: a code, a model id, a request id.
fn is_identifier(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-' || b == b'.')
}

/// `http://127.0.0.1`, `http://localhost` or `http://[::1]`: a host that no
/// proxy should see. Everything else follows `HTTPS_PROXY`/`NO_PROXY`.
fn is_loopback_url(url: &str) -> bool {
    let rest = url.split_once("://").map(|(_, r)| r).unwrap_or(url);
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = authority.rsplit('@').next().unwrap_or(authority);
    let host = if let Some(stripped) = host.strip_prefix('[') {
        stripped.split(']').next().unwrap_or("")
    } else {
        host.split(':').next().unwrap_or("")
    };
    host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<std::net::IpAddr>()
            .map(|ip| ip.is_loopback())
            .unwrap_or(false)
}

/// The estate Vault route as an [`InferenceBackend`]. See the module docs.
#[derive(Clone)]
pub struct VaultBackend {
    inner: Arc<Inner>,
}

impl fmt::Debug for VaultBackend {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let breaker = self.inner.breaker.try_lock();
        f.debug_struct("VaultBackend")
            .field("endpoint", &self.inner.endpoint)
            .field("tenant", &self.inner.config.tenant)
            .field("key", &self.inner.key)
            .field("key_source", &self.inner.config.key_source)
            .field("models", &self.inner.config.models)
            .field("max_tokens", &self.inner.config.max_tokens)
            .field("retries", &self.inner.config.retries)
            .field(
                "circuit_open",
                &breaker.as_ref().map(|b| b.is_open(Instant::now())).ok(),
            )
            .finish()
    }
}

impl VaultBackend {
    /// Read the key from `config.key_source` and build the client. The key
    /// is read exactly once, here; a missing, empty or malformed key is an
    /// `Err` that names the source, never the value.
    pub fn new(config: VaultConfig) -> Result<Self, String> {
        let key = Secret::load(&config.key_source)?;
        let endpoint = format!("{}{}", config.url.trim_end_matches('/'), REVIEW_PATH);
        let mut builder = ureq::Agent::config_builder()
            .timeout_global(Some(config.timeout))
            .http_status_as_error(false)
            .max_redirects(0)
            .user_agent("context-engine-vault/0.1");
        if is_loopback_url(&config.url) {
            builder = builder.proxy(None);
        }
        let agent = ureq::Agent::new_with_config(builder.build());
        let gate = tokio::sync::Semaphore::new(config.max_in_flight.max(1) as usize);
        Ok(VaultBackend {
            inner: Arc::new(Inner {
                endpoint,
                key,
                agent,
                breaker: Mutex::new(Breaker::default()),
                gate,
                config,
            }),
        })
    }

    pub fn config(&self) -> &VaultConfig {
        &self.inner.config
    }

    /// `{url}/api/v1/llm/review`.
    pub fn endpoint(&self) -> &str {
        &self.inner.endpoint
    }

    /// Whether the breaker is refusing calls right now.
    pub fn circuit_open(&self) -> bool {
        self.inner
            .breaker
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .is_open(Instant::now())
    }

    /// Failed attempts since the last success.
    pub fn consecutive_failures(&self) -> u32 {
        self.inner
            .breaker
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .consecutive_failures
    }
}

impl InferenceBackend for VaultBackend {
    fn name(&self) -> &str {
        "vault"
    }

    /// One call for one tier. The HTTP work runs on Tokio's blocking pool
    /// when a runtime is present; without one (the sequential executor) it
    /// runs inline and blocks the poller for the duration of the call.
    fn complete(&self, tier: ModelTier, prompt: String) -> BackendFuture {
        let inner = self.inner.clone();
        Box::pin(async move {
            inner.admit()?;
            let _permit = inner
                .gate
                .acquire()
                .await
                .map_err(|_| "vault gate closed".to_string())?;
            if tokio::runtime::Handle::try_current().is_ok() {
                let worker = inner.clone();
                match tokio::task::spawn_blocking(move || worker.call(tier, &prompt)).await {
                    Ok(result) => result,
                    Err(e) => Err(inner.key.scrub(format!("vault worker failed: {e}"))),
                }
            } else {
                inner.call(tier, &prompt)
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_is_read_and_envelopes_are_unwrapped() {
        assert_eq!(
            extract_content(r#"{"content":"hello","execution":{}}"#).unwrap(),
            "hello"
        );
        assert_eq!(
            extract_content(r#"{"result":{"a":1},"a":1,"execution":{}}"#).unwrap(),
            r#"{"a":1}"#
        );
        assert_eq!(
            extract_content(r#"{"result":[1,2],"execution":{}}"#).unwrap(),
            "[1,2]"
        );
        assert_eq!(extract_content(r#"{"result":"plain"}"#).unwrap(), "plain");
        let empty = extract_content(
            r#"{"content":"","execution":{"provider":"gemini","model":"gemini-3.8-flash","request_id":"r9"}}"#,
        )
        .unwrap_err();
        assert_eq!(empty, "empty content (gemini/gemini-3.8-flash, request r9)");
        assert!(extract_content("not json").is_err());
        assert!(extract_content(r#"{"content":"   "}"#).is_err());
    }

    #[test]
    fn error_code_reports_the_code_and_never_the_body() {
        let body = r#"{"detail":{"code":"llm_review_provider_unavailable","cause":"provider_funds_exhausted","message":"secret SHOULD-NOT-LEAK"}}"#;
        assert_eq!(
            error_code(body),
            "llm_review_provider_unavailable/provider_funds_exhausted"
        );
        assert_eq!(
            error_code(r#"{"code":"route_not_exact"}"#),
            "route_not_exact"
        );
        assert_eq!(error_code(r#"{"error":"no_key"}"#), "no_key");
        assert_eq!(
            error_code(r#"{"detail":"Director access required"}"#),
            "unspecified"
        );
        assert_eq!(error_code("<html>gateway</html>"), "unspecified");
        assert!(!error_code(body).contains("SHOULD-NOT-LEAK"));
    }

    #[test]
    fn breaker_opens_at_threshold_and_admits_one_probe_after_cooldown() {
        let t0 = Instant::now();
        let cooldown = Duration::from_secs(60);
        let mut b = Breaker::default();
        for _ in 0..4 {
            assert!(b.admit(5, t0).is_ok());
            b.failure(5, cooldown, t0);
        }
        assert!(!b.is_open(t0));
        b.failure(5, cooldown, t0);
        assert!(b.is_open(t0));
        assert_eq!(b.admit(5, t0).unwrap_err(), CIRCUIT_OPEN);
        assert_eq!(
            b.admit(5, t0 + Duration::from_secs(59)).unwrap_err(),
            CIRCUIT_OPEN
        );
        let t1 = t0 + cooldown;
        assert!(b.admit(5, t1).is_ok());
        b.failure(5, cooldown, t1);
        assert!(
            b.is_open(t1),
            "one failed probe re-opens the breaker at once"
        );
        b.success();
        assert!(!b.is_open(t1));
        assert_eq!(b.consecutive_failures, 0);
        let mut off = Breaker::default();
        for _ in 0..100 {
            off.failure(0, cooldown, t0);
        }
        assert!(!off.is_open(t0), "threshold 0 disables the breaker");
    }

    #[test]
    fn secret_debug_and_scrub_hide_the_key() {
        let s = Secret("k-abc-123".to_string());
        assert_eq!(format!("{s:?}"), "<redacted>");
        assert_eq!(
            s.scrub("header k-abc-123 rejected, k-abc-123".to_string()),
            "header <redacted> rejected, <redacted>"
        );
        assert_eq!(s.scrub("clean".to_string()), "clean");
    }

    #[test]
    fn loopback_urls_bypass_the_proxy_and_others_do_not() {
        assert!(is_loopback_url("http://127.0.0.1:8080"));
        assert!(is_loopback_url("http://127.0.0.1:8080/"));
        assert!(is_loopback_url("http://localhost"));
        assert!(is_loopback_url("http://[::1]:9/x"));
        assert!(!is_loopback_url(DEFAULT_URL));
        assert!(!is_loopback_url("https://10.0.0.1"));
    }

    #[test]
    fn retry_pauses_widen_and_cap() {
        let config = VaultConfig {
            retry_pause: Duration::from_millis(500),
            ..VaultConfig::default()
        };
        let inner = Inner {
            endpoint: String::new(),
            key: Secret("x".into()),
            agent: ureq::Agent::new_with_defaults(),
            breaker: Mutex::new(Breaker::default()),
            gate: tokio::sync::Semaphore::new(1),
            config,
        };
        assert_eq!(inner.pause(1), Duration::from_millis(500));
        assert_eq!(inner.pause(2), Duration::from_millis(1500));
        assert_eq!(inner.pause(3), Duration::from_millis(4500));
        assert_eq!(inner.pause(50), MAX_RETRY_PAUSE);
    }

    #[test]
    fn request_body_matches_the_route() {
        let body = serde_json::to_value(ReviewRequest {
            tenant: "001_master",
            provider: "gemini",
            model: "gemini-3.8-flash",
            system_prompt: "sys",
            user_prompt: "usr",
            temperature: None,
            max_tokens: 64,
        })
        .unwrap();
        assert_eq!(
            body,
            serde_json::json!({
                "tenant": "001_master", "provider": "gemini", "model": "gemini-3.8-flash",
                "system_prompt": "sys", "user_prompt": "usr", "temperature": null, "max_tokens": 64
            })
        );
    }
}
