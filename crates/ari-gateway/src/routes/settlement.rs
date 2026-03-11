//! Settlement status and configuration endpoint.

use std::sync::Arc;

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::app::AppState;
use crate::executor::ExecutorConfig;

#[derive(Serialize)]
struct SettlementStatus {
    contract_address: String,
    chain_id: u64,
    executor_enabled: bool,
    rpc_url_configured: bool,
    solver_key_configured: bool,
    mode: &'static str,
}

async fn settlement_status(State(_state): State<Arc<AppState>>) -> Json<SettlementStatus> {
    let config = ExecutorConfig::from_env();
    let has_key = std::env::var("SOLVER_PRIVATE_KEY").is_ok();

    let mode = if config.enabled && has_key {
        "live"
    } else if config.enabled {
        "dry-run (no private key)"
    } else {
        "disabled"
    };

    Json(SettlementStatus {
        contract_address: config.settlement_address,
        chain_id: config.chain_id,
        executor_enabled: config.enabled,
        rpc_url_configured: config.rpc_url != "https://eth.llamarpc.com",
        solver_key_configured: has_key,
        mode,
    })
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/v1/settlement/status", get(settlement_status))
}
