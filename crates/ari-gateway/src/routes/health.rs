//! Health check and metrics endpoint.

use std::sync::Arc;

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::app::AppState;

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    version: &'static str,
    db_status: &'static str,
    solver_worker: &'static str,
    ws_connections: usize,
    uptime_secs: u64,
}

static START_TIME: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();

fn start_time() -> &'static std::time::Instant {
    START_TIME.get_or_init(std::time::Instant::now)
}

async fn health_check(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    let db_ok = state.db.try_lock().is_ok();
    let ws = state.ws_connections.load(std::sync::atomic::Ordering::Relaxed);
    let uptime = start_time().elapsed().as_secs();

    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        db_status: if db_ok { "connected" } else { "busy" },
        solver_worker: "running",
        ws_connections: ws,
        uptime_secs: uptime,
    })
}

#[derive(Serialize)]
struct MetricsResponse {
    total_intents: i64,
    pending_intents: i64,
    settled_intents: i64,
    expired_intents: i64,
    total_solvers: i64,
    total_fills: i64,
    active_positions: i64,
    ws_connections: usize,
}

async fn metrics(State(state): State<Arc<AppState>>) -> Json<MetricsResponse> {
    let conn = state.db.lock().await;

    let count = |sql: &str| -> i64 {
        conn.query_row(sql, [], |row| row.get(0)).unwrap_or(0)
    };

    let ws = state.ws_connections.load(std::sync::atomic::Ordering::Relaxed);

    Json(MetricsResponse {
        total_intents: count("SELECT COUNT(*) FROM intents"),
        pending_intents: count("SELECT COUNT(*) FROM intents WHERE status = 'pending'"),
        settled_intents: count("SELECT COUNT(*) FROM intents WHERE status = 'settled'"),
        expired_intents: count("SELECT COUNT(*) FROM intents WHERE status = 'expired'"),
        total_solvers: count("SELECT COUNT(*) FROM solvers WHERE active = 1"),
        total_fills: count("SELECT COUNT(*) FROM solver_fills"),
        active_positions: count("SELECT COUNT(*) FROM yield_positions"),
        ws_connections: ws,
    })
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/health", get(health_check))
        .route("/v1/metrics", get(metrics))
}
