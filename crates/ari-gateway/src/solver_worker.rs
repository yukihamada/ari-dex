//! Background solver worker that processes pending intents.
//!
//! Polls the database for pending intents every 5 seconds,
//! computes quotes via the price cache, attempts on-chain settlement,
//! and records fills.

use std::sync::Arc;
use std::time::Duration;

use rusqlite::params;

use crate::app::AppState;
use crate::db;
use crate::executor::{self, ExecutorConfig, OnChainIntent, SettlementResult};

/// Spawn the solver worker background task.
pub fn spawn_solver_worker(state: Arc<AppState>) {
    tokio::spawn(async move {
        // Wait for initial startup
        tokio::time::sleep(Duration::from_secs(5)).await;

        // Register default ARI solver if none exist
        register_default_solver(&state).await;

        let config = ExecutorConfig::from_env();
        if config.enabled {
            tracing::info!(
                "Solver worker started (on-chain execution ENABLED, chain_id={}, contract={})",
                config.chain_id,
                config.settlement_address
            );
        } else {
            tracing::info!("Solver worker started (dry-run mode, set EXECUTOR_ENABLED=true to enable on-chain settlement)");
        }

        loop {
            if let Err(e) = process_pending_intents(&state, &config).await {
                tracing::error!("Solver worker error: {e}");
            }
            tokio::time::sleep(Duration::from_secs(5)).await;
        }
    });
}

async fn process_pending_intents(
    state: &Arc<AppState>,
    config: &ExecutorConfig,
) -> Result<(), String> {
    let pending_intents = {
        let conn = state.db.lock().await;
        db::list_intents_by_status(&conn, "pending", 10)
            .map_err(|e| format!("Failed to query pending intents: {e}"))?
    };

    if pending_intents.is_empty() {
        return Ok(());
    }

    tracing::info!("Processing {} pending intents", pending_intents.len());

    // Get current prices
    crate::routes::quote::refresh_prices().await;
    let price_cache = crate::routes::quote::cache().read().await;

    for intent in &pending_intents {
        // Check if intent has expired (older than 5 minutes)
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        if now - intent.created_at > 300 {
            let conn = state.db.lock().await;
            let _ = db::update_intent_status(&conn, &intent.intent_id, "expired");
            tracing::info!("Expired intent {}", intent.intent_id);
            continue;
        }

        // Compute execution price
        let sell_price = price_cache
            .prices
            .get(&intent.sell_token.to_uppercase())
            .copied()
            .unwrap_or(0.0);
        let buy_price = price_cache
            .prices
            .get(&intent.buy_token.to_uppercase())
            .copied()
            .unwrap_or(0.0);

        if sell_price == 0.0 || buy_price == 0.0 {
            tracing::warn!(
                "No price for {}/{}, skipping intent {}",
                intent.sell_token,
                intent.buy_token,
                intent.intent_id
            );
            continue;
        }

        // Calculate the fill amount
        let sell_decimals = token_decimals(&intent.sell_token);
        let buy_decimals = token_decimals(&intent.buy_token);
        let sell_raw: f64 = intent.sell_amount.parse().unwrap_or(0.0);
        let sell_human = sell_raw / 10f64.powi(sell_decimals as i32);
        let rate = sell_price / buy_price;
        let buy_human = sell_human * rate * 0.9995; // 0.05% fee
        let buy_raw = buy_human * 10f64.powi(buy_decimals as i32);

        // Check min_buy_amount
        let min_buy_raw: f64 = intent.min_buy_amount.parse().unwrap_or(0.0);
        if buy_raw < min_buy_raw && min_buy_raw > 0.0 {
            tracing::info!(
                "Intent {} cannot meet min_buy: {} < {}",
                intent.intent_id,
                buy_raw,
                min_buy_raw
            );
            continue;
        }

        // Attempt on-chain settlement
        let on_chain_intent = OnChainIntent {
            sender: intent.sender.clone(),
            sell_token: intent.sell_token.clone(),
            sell_amount: intent.sell_amount.clone(),
            buy_token: intent.buy_token.clone(),
            min_buy_amount: intent.min_buy_amount.clone(),
            deadline: intent.created_at + 300,
            nonce: now,
            signature: String::new(), // User's signature would be stored with the intent
        };

        let solver_addr = &config.settlement_address;
        let result = executor::settle_on_chain(
            config,
            &on_chain_intent,
            solver_addr,
            &format!("{:.0}", buy_raw),
        )
        .await;

        match &result {
            SettlementResult::Submitted { tx_hash } => {
                tracing::info!("On-chain settlement tx: {tx_hash}");
            }
            SettlementResult::DryRun { would_settle } => {
                tracing::debug!("Dry-run: {would_settle}");
            }
            SettlementResult::Failed { reason } => {
                tracing::warn!("On-chain settlement failed: {reason}");
                // Still settle locally - the intent is valid
            }
        }

        // Update DB state regardless (local settlement)
        {
            let conn = state.db.lock().await;
            let _ = db::update_intent_status(&conn, &intent.intent_id, "settled");

            // Record solver fill
            let fill_id = format!("fill_{}", now);
            let improvement = 0.05;
            let _ = conn.execute(
                "INSERT INTO solver_fills (id, solver_id, intent_id, price_improvement, amount, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    fill_id,
                    "ari_solver",
                    intent.intent_id,
                    improvement,
                    intent.sell_amount,
                    now as i64
                ],
            );

            // Update solver stats
            let _ = conn.execute(
                "UPDATE solvers SET total_fills = total_fills + 1, total_volume = CAST(CAST(total_volume AS INTEGER) + ?1 AS TEXT) WHERE id = 'ari_solver'",
                params![sell_raw as i64],
            );
        }

        // Broadcast settlement to WebSocket subscribers
        crate::ws::broadcast_intent(
            &state.broadcast_tx,
            &crate::app::StoredIntent {
                intent_id: intent.intent_id.clone(),
                sender: intent.sender.clone(),
                sell_token: intent.sell_token.clone(),
                buy_token: intent.buy_token.clone(),
                sell_amount: intent.sell_amount.clone(),
                min_buy_amount: intent.min_buy_amount.clone(),
                status: "settled".to_string(),
                created_at: intent.created_at,
            },
        );

        tracing::info!(
            "Settled intent {} | {} {} -> {:.0} {} (rate: {:.6})",
            intent.intent_id,
            sell_human,
            intent.sell_token,
            buy_raw,
            intent.buy_token,
            rate
        );
    }

    Ok(())
}

async fn register_default_solver(state: &Arc<AppState>) {
    let conn = state.db.lock().await;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM solvers", [], |row| row.get(0))
        .unwrap_or(0);
    if count > 0 {
        return;
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let _ = conn.execute(
        "INSERT INTO solvers (id, address, name, endpoint, fill_rate, avg_improvement, total_volume, total_fills, score, active, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10)",
        params![
            "ari_solver",
            "0x536EeDA7d07cF7Af171fBeD8FAe7987a5c63B822",
            "ARI Default Solver",
            "internal://solver-worker",
            95.0,
            0.05,
            "0",
            0i64,
            85.0,
            now,
        ],
    );
    tracing::info!("Registered default ARI solver");
}

fn token_decimals(token: &str) -> u32 {
    match token.to_uppercase().as_str() {
        "USDC" | "USDT" => 6,
        "WBTC" => 8,
        _ => 18,
    }
}
