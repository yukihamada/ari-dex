//! Custom middleware for the ARI gateway.
//!
//! Provides rate limiting and request logging.

use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::http::{Request, Response, StatusCode};
use axum::middleware::Next;
use tokio::sync::Mutex;

// ---------------------------------------------------------------------------
// Rate Limiter
// ---------------------------------------------------------------------------

/// Per-IP rate limiter using a sliding window counter.
pub struct RateLimiter {
    max_requests: u32,
    window: Duration,
    counters: Mutex<HashMap<IpAddr, (u32, Instant)>>,
}

impl RateLimiter {
    pub fn new(max_requests: u32, window: Duration) -> Self {
        Self {
            max_requests,
            window,
            counters: Mutex::new(HashMap::new()),
        }
    }

    async fn check(&self, ip: IpAddr) -> bool {
        let mut counters = self.counters.lock().await;
        let now = Instant::now();
        let entry = counters.entry(ip).or_insert((0, now));

        if now.duration_since(entry.1) >= self.window {
            entry.0 = 0;
            entry.1 = now;
        }

        entry.0 += 1;
        entry.0 <= self.max_requests
    }

    /// Spawn periodic cleanup to prevent unbounded memory growth.
    pub fn spawn_cleanup(self: &Arc<Self>) {
        let limiter = Arc::clone(self);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(300)).await;
                let mut counters = limiter.counters.lock().await;
                let now = Instant::now();
                counters.retain(|_, (_, start)| now.duration_since(*start) < limiter.window * 2);
            }
        });
    }
}

// ---------------------------------------------------------------------------
// Rate Limit Middleware (100 req/min per IP)
// ---------------------------------------------------------------------------

/// Returns 429 Too Many Requests if rate limit is exceeded.
pub async fn rate_limit_middleware(
    request: Request<Body>,
    next: Next,
) -> Response<Body> {
    let ip = extract_client_ip(&request);

    static LIMITER: std::sync::OnceLock<Arc<RateLimiter>> = std::sync::OnceLock::new();
    let limiter = LIMITER.get_or_init(|| {
        let l = Arc::new(RateLimiter::new(100, Duration::from_secs(60)));
        l.spawn_cleanup();
        l
    });

    if !limiter.check(ip).await {
        tracing::warn!("Rate limit exceeded for {}", ip);
        return Response::builder()
            .status(StatusCode::TOO_MANY_REQUESTS)
            .header("Retry-After", "60")
            .header("Content-Type", "application/json")
            .body(Body::from(r#"{"error":"rate limit exceeded","retry_after":60}"#))
            .unwrap();
    }

    next.run(request).await
}

// ---------------------------------------------------------------------------
// Request Logging Middleware
// ---------------------------------------------------------------------------

/// Logs method, path, status, and latency for each request.
pub async fn request_logging_middleware(
    request: Request<Body>,
    next: Next,
) -> Response<Body> {
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    let start = Instant::now();

    let response = next.run(request).await;

    let latency = start.elapsed();
    let status = response.status().as_u16();

    if path != "/health" && !path.starts_with("/assets/") {
        tracing::info!(
            method = %method,
            path = %path,
            status = status,
            latency_ms = latency.as_millis() as u64,
            "request"
        );
    }

    response
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn extract_client_ip(request: &Request<Body>) -> IpAddr {
    // Fly.io sets Fly-Client-IP
    if let Some(ip) = request
        .headers()
        .get("fly-client-ip")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse::<IpAddr>().ok())
    {
        return ip;
    }

    // X-Forwarded-For fallback
    if let Some(forwarded) = request
        .headers()
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
    {
        if let Some(first) = forwarded.split(',').next() {
            if let Ok(ip) = first.trim().parse::<IpAddr>() {
                return ip;
            }
        }
    }

    "127.0.0.1".parse().unwrap()
}
