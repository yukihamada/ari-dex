//! Liquidity management endpoints — records liquidity operations in DB.

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::app::AppState;
use crate::db;

#[derive(Deserialize)]
struct AddLiquidityRequest {
    owner: String,
    pool: String,
    token: String,
    amount: String,
    tick_lower: i32,
    tick_upper: i32,
}

#[derive(Deserialize)]
struct RemoveLiquidityRequest {
    owner: String,
    position_id: String,
}

#[derive(Serialize)]
struct LiquidityResponse {
    success: bool,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    position_id: Option<String>,
}

async fn add_liquidity(
    State(state): State<Arc<AppState>>,
    Json(body): Json<AddLiquidityRequest>,
) -> impl IntoResponse {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let id = format!("lp_{}", now);

    // Store as a yield position — strategy_id encodes pool info
    let strategy_id = format!("{}:{}:{}", body.pool, body.token, body.tick_lower);

    let conn = state.db.lock().await;
    match db::insert_yield_position(&conn, &id, &body.owner, &strategy_id, &body.token, &body.amount, now) {
        Ok(()) => {
            tracing::info!(
                "Liquidity added: {} {} to pool {} by {}",
                body.amount, body.token, body.pool, body.owner
            );
            Json(LiquidityResponse {
                success: true,
                message: format!(
                    "Liquidity added to pool {} (tick range [{}, {}])",
                    body.pool, body.tick_lower, body.tick_upper
                ),
                position_id: Some(id),
            })
            .into_response()
        }
        Err(e) => {
            tracing::error!("Failed to record liquidity: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(LiquidityResponse {
                    success: false,
                    message: "Failed to record liquidity position".to_string(),
                    position_id: None,
                }),
            )
                .into_response()
        }
    }
}

async fn remove_liquidity(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RemoveLiquidityRequest>,
) -> impl IntoResponse {
    let conn = state.db.lock().await;

    // Verify position exists and belongs to owner
    let positions = db::list_yield_positions(&conn, &body.owner).unwrap_or_default();
    let found = positions.iter().any(|(id, ..)| *id == body.position_id);

    if !found {
        return (
            StatusCode::NOT_FOUND,
            Json(LiquidityResponse {
                success: false,
                message: format!("Position {} not found for {}", body.position_id, body.owner),
                position_id: None,
            }),
        )
            .into_response();
    }

    // Delete the position
    match conn.execute(
        "DELETE FROM yield_positions WHERE id = ?1 AND owner = ?2",
        rusqlite::params![body.position_id, body.owner],
    ) {
        Ok(n) if n > 0 => {
            tracing::info!("Liquidity removed: position {} by {}", body.position_id, body.owner);
            Json(LiquidityResponse {
                success: true,
                message: format!("Position {} removed", body.position_id),
                position_id: Some(body.position_id),
            })
            .into_response()
        }
        _ => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(LiquidityResponse {
                success: false,
                message: "Failed to remove position".to_string(),
                position_id: None,
            }),
        )
            .into_response(),
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/v1/liquidity/add", post(add_liquidity))
        .route("/v1/liquidity/remove", post(remove_liquidity))
}
