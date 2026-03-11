//! Portfolio endpoints — fetches on-chain balances via Ethereum JSON-RPC.

use std::sync::Arc;

use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::app::AppState;
use crate::db;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct TargetAllocation {
    token: String,
    percentage: u32,
}

#[derive(Deserialize)]
struct RebalanceRequest {
    owner: String,
    targets: Vec<TargetAllocation>,
}

#[derive(Serialize)]
struct RebalanceIntent {
    sell_token: String,
    buy_token: String,
    sell_amount: String,
    reason: String,
}

#[derive(Serialize)]
struct RebalanceResponse {
    owner: String,
    intents: Vec<RebalanceIntent>,
}

#[derive(Clone, Serialize)]
struct Holding {
    token: String,
    address: String,
    amount: String,
    usd_value: f64,
    percentage: f64,
}

#[derive(Serialize)]
struct PortfolioResponse {
    address: String,
    total_usd: f64,
    holdings: Vec<Holding>,
}

#[derive(Serialize)]
struct DayValue {
    date: String,
    usd_value: f64,
}

#[derive(Serialize)]
struct HistoryResponse {
    address: String,
    days: Vec<DayValue>,
}

// ---------------------------------------------------------------------------
// On-chain balance queries
// ---------------------------------------------------------------------------

/// Known tokens with their contract addresses and decimals.
const TOKENS: &[(&str, &str, u32)] = &[
    ("ETH", "0x0000000000000000000000000000000000000000", 18),
    ("USDC", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6),
    ("USDT", "0xdAC17F958D2ee523a2206206994597C13D831ec7", 6),
    ("DAI", "0x6B175474E89094C44Da98b954EedeAC495271d0F", 18),
    ("WBTC", "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 8),
    ("WETH", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 18),
];

/// Fetch ETH balance via eth_getBalance.
async fn fetch_eth_balance(client: &reqwest::Client, rpc: &str, address: &str) -> f64 {
    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_getBalance",
        "params": [address, "latest"],
        "id": 1
    });

    let resp = client.post(rpc).json(&body).send().await;
    match resp {
        Ok(r) => {
            if let Ok(data) = r.json::<serde_json::Value>().await {
                if let Some(hex) = data["result"].as_str() {
                    let raw = u128::from_str_radix(hex.trim_start_matches("0x"), 16).unwrap_or(0);
                    return raw as f64 / 1e18;
                }
            }
            0.0
        }
        Err(_) => 0.0,
    }
}

/// Fetch ERC-20 balance via eth_call (balanceOf).
async fn fetch_erc20_balance(
    client: &reqwest::Client,
    rpc: &str,
    token_address: &str,
    owner: &str,
    decimals: u32,
) -> f64 {
    // balanceOf(address) selector = 0x70a08231
    let padded_owner = format!("000000000000000000000000{}", owner.trim_start_matches("0x"));
    let call_data = format!("0x70a08231{}", padded_owner);

    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "eth_call",
        "params": [{"to": token_address, "data": call_data}, "latest"],
        "id": 1
    });

    let resp = client.post(rpc).json(&body).send().await;
    match resp {
        Ok(r) => {
            if let Ok(data) = r.json::<serde_json::Value>().await {
                if let Some(hex) = data["result"].as_str() {
                    let hex = hex.trim_start_matches("0x");
                    if hex.is_empty() || hex == "0" {
                        return 0.0;
                    }
                    let raw = u128::from_str_radix(hex, 16).unwrap_or(0);
                    return raw as f64 / 10f64.powi(decimals as i32);
                }
            }
            0.0
        }
        Err(_) => 0.0,
    }
}

/// Fetch all balances for an address.
async fn fetch_all_balances(address: &str) -> Vec<(String, String, f64)> {
    let rpc = "https://eth.llamarpc.com";
    let client = reqwest::Client::builder()
        .user_agent("ARI-DEX/0.1")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_default();

    let mut results = Vec::new();

    for &(symbol, token_addr, decimals) in TOKENS {
        let balance = if symbol == "ETH" {
            fetch_eth_balance(&client, rpc, address).await
        } else {
            fetch_erc20_balance(&client, rpc, token_addr, address, decimals).await
        };

        if balance > 0.0001 {
            results.push((symbol.to_string(), token_addr.to_string(), balance));
        }
    }

    results
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async fn rebalance(
    State(_state): State<Arc<AppState>>,
    Json(body): Json<RebalanceRequest>,
) -> Json<RebalanceResponse> {
    let balances = fetch_all_balances(&body.owner).await;

    // Get prices
    crate::routes::quote::refresh_prices().await;
    let price_cache = crate::routes::quote::cache().read().await;

    let holdings: Vec<Holding> = balances
        .iter()
        .map(|(sym, addr, bal)| {
            let price = price_cache.prices.get(sym).copied().unwrap_or(0.0);
            Holding {
                token: sym.clone(),
                address: addr.clone(),
                amount: format!("{:.6}", bal),
                usd_value: bal * price,
                percentage: 0.0,
            }
        })
        .collect();

    let total_usd: f64 = holdings.iter().map(|h| h.usd_value).sum();

    let mut intents: Vec<RebalanceIntent> = Vec::new();

    for target in &body.targets {
        let current = if total_usd > 0.0 {
            holdings
                .iter()
                .find(|h| h.token == target.token)
                .map(|h| h.usd_value / total_usd * 100.0)
                .unwrap_or(0.0)
        } else {
            0.0
        };

        let diff = target.percentage as f64 - current;
        if diff.abs() < 1.0 {
            continue;
        }

        let usd_delta = (diff / 100.0) * total_usd;

        if usd_delta > 0.0 {
            intents.push(RebalanceIntent {
                sell_token: "USDC".to_string(),
                buy_token: target.token.clone(),
                sell_amount: format!("{:.2}", usd_delta),
                reason: format!(
                    "Increase {} from {:.1}% to {}%",
                    target.token, current, target.percentage
                ),
            });
        } else {
            intents.push(RebalanceIntent {
                sell_token: target.token.clone(),
                buy_token: "USDC".to_string(),
                sell_amount: format!("{:.2}", usd_delta.abs()),
                reason: format!(
                    "Decrease {} from {:.1}% to {}%",
                    target.token, current, target.percentage
                ),
            });
        }
    }

    Json(RebalanceResponse {
        owner: body.owner,
        intents,
    })
}

async fn get_portfolio(
    State(_state): State<Arc<AppState>>,
    Path(address): Path<String>,
) -> Json<PortfolioResponse> {
    let balances = fetch_all_balances(&address).await;

    // Get prices
    crate::routes::quote::refresh_prices().await;
    let price_cache = crate::routes::quote::cache().read().await;

    let mut holdings: Vec<Holding> = balances
        .iter()
        .map(|(sym, addr, bal)| {
            let price = price_cache.prices.get(sym).copied().unwrap_or(0.0);
            Holding {
                token: sym.clone(),
                address: addr.clone(),
                amount: format!("{:.6}", bal),
                usd_value: bal * price,
                percentage: 0.0,
            }
        })
        .collect();

    let total_usd: f64 = holdings.iter().map(|h| h.usd_value).sum();

    // Calculate percentages
    if total_usd > 0.0 {
        for h in &mut holdings {
            h.percentage = h.usd_value / total_usd * 100.0;
        }
    }

    // Sort by value descending
    holdings.sort_by(|a, b| b.usd_value.partial_cmp(&a.usd_value).unwrap_or(std::cmp::Ordering::Equal));

    Json(PortfolioResponse {
        address,
        total_usd,
        holdings,
    })
}

async fn portfolio_history(
    State(state): State<Arc<AppState>>,
    Path(address): Path<String>,
) -> Json<HistoryResponse> {
    // Build history from actual trade records in DB
    let conn = state.db.lock().await;
    let intents = db::list_intents_by_sender(&conn, &address, None).unwrap_or_default();

    // Group trades by day and compute cumulative activity
    let mut day_map: std::collections::BTreeMap<String, f64> = std::collections::BTreeMap::new();

    for intent in &intents {
        let ts = intent.created_at;
        let dt = chrono_date_from_ts(ts);
        let amount: f64 = intent.sell_amount.parse().unwrap_or(0.0);
        *day_map.entry(dt).or_insert(0.0) += amount;
    }

    let days: Vec<DayValue> = day_map
        .into_iter()
        .map(|(date, usd_value)| DayValue { date, usd_value })
        .collect();

    Json(HistoryResponse { address, days })
}

fn chrono_date_from_ts(ts: u64) -> String {
    let secs = ts as i64;
    let days_since_epoch = secs / 86400;
    // Simple date calculation
    let year = 1970 + (days_since_epoch / 365) as i32;
    let remaining = (days_since_epoch % 365) as u32;
    let month = (remaining / 30).min(11) + 1;
    let day = (remaining % 30) + 1;
    format!("{:04}-{:02}-{:02}", year, month, day)
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/v1/portfolio/rebalance", post(rebalance))
        .route("/v1/portfolio/:address", get(get_portfolio))
        .route("/v1/portfolio/:address/history", get(portfolio_history))
}
