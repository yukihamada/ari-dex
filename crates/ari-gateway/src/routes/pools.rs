//! Pool listing endpoint — fetches live data from Uniswap V3 Subgraph.

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::app::AppState;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Clone, Serialize)]
struct PoolInfo {
    address: String,
    token0: String,
    token0_address: String,
    token1: String,
    token1_address: String,
    fee_tier: u32,
    liquidity: String,
    volume_usd_24h: String,
    tvl_usd: String,
}

#[derive(Serialize)]
struct PoolsResponse {
    pools: Vec<PoolInfo>,
    updated_at: i64,
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

static POOL_CACHE: std::sync::OnceLock<Arc<RwLock<PoolCache>>> = std::sync::OnceLock::new();

struct PoolCache {
    pools: Vec<PoolInfo>,
    updated_at: Instant,
}

fn pool_cache() -> &'static Arc<RwLock<PoolCache>> {
    POOL_CACHE.get_or_init(|| {
        Arc::new(RwLock::new(PoolCache {
            pools: Vec::new(),
            updated_at: Instant::now() - Duration::from_secs(600),
        }))
    })
}

// ---------------------------------------------------------------------------
// Uniswap V3 Subgraph fetch
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SubgraphResponse {
    data: Option<SubgraphData>,
}

#[derive(Deserialize)]
struct SubgraphData {
    pools: Vec<SubgraphPool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubgraphPool {
    id: String,
    token0: SubgraphToken,
    token1: SubgraphToken,
    fee_tier: String,
    liquidity: String,
    volume_u_s_d: Option<String>,
    total_value_locked_u_s_d: Option<String>,
}

#[derive(Deserialize)]
struct SubgraphToken {
    symbol: String,
    id: String,
}

async fn fetch_pools_from_subgraph() -> Result<Vec<PoolInfo>, ()> {
    let client = reqwest::Client::builder()
        .user_agent("ARI-DEX/0.1")
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|_| ())?;

    // Query top pools by TVL from Uniswap V3 Ethereum subgraph
    let query = r#"{
        pools(first: 20, orderBy: totalValueLockedUSD, orderDirection: desc, where: { volumeUSD_gt: "1000000" }) {
            id
            token0 { symbol id }
            token1 { symbol id }
            feeTier
            liquidity
            volumeUSD
            totalValueLockedUSD
        }
    }"#;

    let body = serde_json::json!({ "query": query });

    // Use API key if available, otherwise try public endpoint
    let url = match std::env::var("SUBGRAPH_API_KEY") {
        Ok(key) if !key.is_empty() => format!(
            "https://gateway.thegraph.com/api/{}/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV",
            key
        ),
        _ => "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3".to_string(),
    };
    let url = &url;

    let resp = client.post(url).json(&body).send().await.map_err(|e| {
        tracing::warn!("Subgraph fetch failed: {e}");
    })?;

    if !resp.status().is_success() {
        tracing::warn!("Subgraph returned {}", resp.status());
        // Try fallback gateway
        return fetch_pools_fallback(&client).await;
    }

    let data: SubgraphResponse = resp.json().await.map_err(|e| {
        tracing::warn!("Subgraph parse failed: {e}");
    })?;

    match data.data {
        Some(d) => Ok(d.pools.into_iter().map(subgraph_pool_to_info).collect()),
        None => fetch_pools_fallback(&client).await,
    }
}

async fn fetch_pools_fallback(client: &reqwest::Client) -> Result<Vec<PoolInfo>, ()> {
    // Fallback: use The Graph decentralized network gateway
    let query = r#"{
        pools(first: 20, orderBy: totalValueLockedUSD, orderDirection: desc, where: { volumeUSD_gt: "1000000" }) {
            id
            token0 { symbol id }
            token1 { symbol id }
            feeTier
            liquidity
            volumeUSD
            totalValueLockedUSD
        }
    }"#;

    let body = serde_json::json!({ "query": query });
    let url = "https://gateway.thegraph.com/api/subgraphs/id/5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV";

    let resp = client.post(url).json(&body).send().await.map_err(|e| {
        tracing::warn!("Subgraph fallback fetch failed: {e}");
    })?;

    if !resp.status().is_success() {
        tracing::warn!("Subgraph fallback returned {}", resp.status());
        return Ok(well_known_pools());
    }

    let data: SubgraphResponse = resp.json().await.map_err(|e| {
        tracing::warn!("Subgraph fallback parse failed: {e}");
    })?;

    match data.data {
        Some(d) if !d.pools.is_empty() => {
            Ok(d.pools.into_iter().map(subgraph_pool_to_info).collect())
        }
        _ => Ok(well_known_pools()),
    }
}

fn subgraph_pool_to_info(p: SubgraphPool) -> PoolInfo {
    PoolInfo {
        address: p.id,
        token0: p.token0.symbol,
        token0_address: p.token0.id,
        token1: p.token1.symbol,
        token1_address: p.token1.id,
        fee_tier: p.fee_tier.parse().unwrap_or(0),
        liquidity: p.liquidity,
        volume_usd_24h: p.volume_u_s_d.unwrap_or_else(|| "0".to_string()),
        tvl_usd: p.total_value_locked_u_s_d.unwrap_or_else(|| "0".to_string()),
    }
}

/// Well-known Uniswap V3 pools as last-resort fallback.
fn well_known_pools() -> Vec<PoolInfo> {
    vec![
        PoolInfo {
            address: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640".into(),
            token0: "USDC".into(),
            token0_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48".into(),
            token1: "WETH".into(),
            token1_address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2".into(),
            fee_tier: 500,
            liquidity: "0".into(),
            volume_usd_24h: "0".into(),
            tvl_usd: "0".into(),
        },
        PoolInfo {
            address: "0xcbcdf9626bc03e24f779434178a73a0b4bad62ed".into(),
            token0: "WBTC".into(),
            token0_address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599".into(),
            token1: "WETH".into(),
            token1_address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2".into(),
            fee_tier: 3000,
            liquidity: "0".into(),
            volume_usd_24h: "0".into(),
            tvl_usd: "0".into(),
        },
        PoolInfo {
            address: "0x3416cf6c708da44db2624d63ea0aaef7113527c6".into(),
            token0: "USDC".into(),
            token0_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48".into(),
            token1: "USDT".into(),
            token1_address: "0xdac17f958d2ee523a2206206994597c13d831ec7".into(),
            fee_tier: 100,
            liquidity: "0".into(),
            volume_usd_24h: "0".into(),
            tvl_usd: "0".into(),
        },
    ]
}

async fn refresh_pools() -> Vec<PoolInfo> {
    let c = pool_cache();
    {
        let r = c.read().await;
        if r.updated_at.elapsed() < Duration::from_secs(300) && !r.pools.is_empty() {
            return r.pools.clone();
        }
    }

    match fetch_pools_from_subgraph().await {
        Ok(pools) if !pools.is_empty() => {
            let mut w = c.write().await;
            w.pools = pools.clone();
            w.updated_at = Instant::now();
            tracing::info!("Pools updated: {} pools from subgraph", pools.len());
            pools
        }
        _ => {
            let r = c.read().await;
            if !r.pools.is_empty() {
                r.pools.clone()
            } else {
                well_known_pools()
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async fn list_pools(State(_state): State<Arc<AppState>>) -> Json<PoolsResponse> {
    let pools = refresh_pools().await;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    Json(PoolsResponse {
        pools,
        updated_at: now,
    })
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/v1/pools", get(list_pools))
}
