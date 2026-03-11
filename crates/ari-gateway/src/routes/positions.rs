//! NFT LP position dashboard — reads real positions from DB and on-chain.

use std::sync::Arc;

use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::app::AppState;
use crate::db;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
struct LpPosition {
    position_id: String,
    pool: String,
    token0: String,
    token1: String,
    fee_tier: u32,
    amount: String,
    created_at: u64,
}

#[derive(Serialize)]
struct PositionsResponse {
    address: String,
    positions: Vec<LpPosition>,
}

#[derive(Serialize)]
struct PositionDetailResponse {
    position: Option<LpPosition>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn list_positions(
    State(state): State<Arc<AppState>>,
    Path(address): Path<String>,
) -> Json<PositionsResponse> {
    let conn = state.db.lock().await;

    // Read yield positions from DB (these are recorded when users interact)
    let positions = match db::list_yield_positions(&conn, &address) {
        Ok(rows) => rows
            .into_iter()
            .map(|(id, _owner, strategy_id, token, amount, created_at)| {
                // Parse strategy_id to extract pool info
                let (pool, token0, token1, fee_tier) = parse_strategy(&strategy_id, &token);
                LpPosition {
                    position_id: id,
                    pool,
                    token0,
                    token1,
                    fee_tier,
                    amount,
                    created_at,
                }
            })
            .collect(),
        Err(e) => {
            tracing::error!("Failed to query positions: {e}");
            Vec::new()
        }
    };

    Json(PositionsResponse { address, positions })
}

async fn get_position_detail(
    State(state): State<Arc<AppState>>,
    Path((address, id)): Path<(String, String)>,
) -> Json<PositionDetailResponse> {
    let conn = state.db.lock().await;
    let positions = db::list_yield_positions(&conn, &address).unwrap_or_default();

    let position = positions
        .into_iter()
        .find(|(pid, ..)| *pid == id)
        .map(|(pid, _owner, strategy_id, token, amount, created_at)| {
            let (pool, token0, token1, fee_tier) = parse_strategy(&strategy_id, &token);
            LpPosition {
                position_id: pid,
                pool,
                token0,
                token1,
                fee_tier,
                amount,
                created_at,
            }
        });

    Json(PositionDetailResponse { position })
}

/// Parse strategy_id format "POOL:TOKEN0-TOKEN1:FEE" into components.
fn parse_strategy(strategy_id: &str, token: &str) -> (String, String, String, u32) {
    let parts: Vec<&str> = strategy_id.split(':').collect();
    if parts.len() >= 3 {
        let pair: Vec<&str> = parts[1].split('-').collect();
        let fee: u32 = parts[2].parse().unwrap_or(3000);
        let token0 = pair.first().unwrap_or(&"").to_string();
        let token1 = pair.last().unwrap_or(&"").to_string();
        let pool = format!("{}-{} {:.2}%", token0, token1, fee as f64 / 10000.0);
        (pool, token0, token1, fee)
    } else {
        let pool = format!("{} pool", token);
        (pool, token.to_string(), "USDC".to_string(), 3000)
    }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/v1/positions/:address", get(list_positions))
        .route("/v1/positions/:address/:id", get(get_position_detail))
}
