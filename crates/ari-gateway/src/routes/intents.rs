//! Intent submission and query endpoints.

use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::app::{AppState, StoredIntent};
use crate::db;
use crate::validation;
use crate::ws;

#[derive(Deserialize)]
struct SubmitIntentRequest {
    sender: String,
    sell_token: String,
    buy_token: String,
    sell_amount: String,
    min_buy_amount: String,
    #[serde(default)]
    signature: Option<String>,
    #[serde(default)]
    deadline: Option<u64>,
    #[serde(default)]
    #[allow(dead_code)]
    nonce: Option<u64>,
    #[serde(default)]
    referral_code: Option<String>,
}

#[derive(Deserialize)]
struct ListIntentsQuery {
    #[serde(default = "default_limit")]
    limit: usize,
    #[serde(default)]
    status: Option<String>,
}

fn default_limit() -> usize {
    50
}

#[derive(Serialize)]
struct IntentListResponse {
    intents: Vec<StoredIntent>,
    count: usize,
}

async fn submit_intent(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SubmitIntentRequest>,
) -> impl IntoResponse {
    // Validate sender address
    if let Err(e) = validation::validate_address(&body.sender) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": format!("invalid sender: {e}")})),
        )
            .into_response();
    }

    // Validate amounts
    if let Err(e) = validation::validate_amount(&body.sell_amount) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": format!("invalid sell_amount: {e}")})),
        )
            .into_response();
    }
    if let Err(e) = validation::validate_amount(&body.min_buy_amount) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": format!("invalid min_buy_amount: {e}")})),
        )
            .into_response();
    }

    // Verify EIP-712 signature
    if let Err(e) = validation::verify_intent_signature(
        &body.sender,
        &body.sell_token,
        &body.buy_token,
        &body.sell_amount,
        &body.min_buy_amount,
        body.deadline,
        body.signature.as_deref(),
    ) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": format!("signature verification failed: {e}")})),
        )
            .into_response();
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let intent_id = format!(
        "0x{:016x}{:048x}",
        now,
        rand::random::<u64>()
    );

    let referral_code = body.referral_code;

    let stored = StoredIntent {
        intent_id: intent_id.clone(),
        sender: body.sender,
        sell_token: body.sell_token,
        buy_token: body.buy_token,
        sell_amount: body.sell_amount,
        min_buy_amount: body.min_buy_amount,
        status: "pending".to_string(),
        created_at: now,
    };

    {
        let conn = state.db.lock().await;
        if let Err(e) = db::insert_intent(&conn, &stored, referral_code.as_deref()) {
            tracing::error!("Failed to insert intent: {e}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "internal error"})),
            )
                .into_response();
        }
        if let Some(ref code) = referral_code {
            crate::routes::referral::track_referral(&conn, code, &stored.sell_amount);
        }
        let _ = db::update_trader_stats(&conn, &stored.sender, &stored.sell_amount, &stored.sell_amount, true);
    }

    // Broadcast to WebSocket subscribers
    ws::broadcast_intent(&state.broadcast_tx, &stored);

    (
        StatusCode::CREATED,
        Json(serde_json::json!({
            "intent_id": intent_id,
            "status": "pending",
        })),
    )
        .into_response()
}

async fn get_intent(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let conn = state.db.lock().await;
    match db::get_intent(&conn, &id) {
        Ok(Some(intent)) => Json(serde_json::to_value(intent).unwrap()).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(e) => {
            tracing::error!("Failed to get intent: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": "internal error"})),
            )
                .into_response()
        }
    }
}

async fn list_intents(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListIntentsQuery>,
) -> impl IntoResponse {
    let conn = state.db.lock().await;
    let limit = params.limit.min(200);
    let intents = match params.status {
        Some(ref status) => {
            // List by status
            let mut stmt = conn.prepare(
                "SELECT id, sender, sell_token, buy_token, sell_amount, min_buy_amount, status, created_at
                 FROM intents WHERE status = ?1 ORDER BY created_at DESC LIMIT ?2",
            ).unwrap();
            stmt.query_map(rusqlite::params![status, limit as i64], |row| {
                Ok(StoredIntent {
                    intent_id: row.get(0)?,
                    sender: row.get(1)?,
                    sell_token: row.get(2)?,
                    buy_token: row.get(3)?,
                    sell_amount: row.get(4)?,
                    min_buy_amount: row.get(5)?,
                    status: row.get(6)?,
                    created_at: row.get(7)?,
                })
            }).unwrap().filter_map(|r| r.ok()).collect::<Vec<_>>()
        }
        None => db::list_intents(&conn, limit).unwrap_or_default(),
    };
    let count = intents.len();
    Json(IntentListResponse { intents, count }).into_response()
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/v1/intents", post(submit_intent).get(list_intents))
        .route("/v1/intents/:id", get(get_intent))
}
