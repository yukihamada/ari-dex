//! Token listing endpoint — returns supported tokens with on-chain addresses.

use std::sync::Arc;

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::app::AppState;

#[derive(Clone, Serialize)]
struct TokenInfo {
    symbol: String,
    name: String,
    address: String,
    chain: String,
    decimals: u8,
    logo_uri: String,
}

#[derive(Serialize)]
struct TokensResponse {
    tokens: Vec<TokenInfo>,
}

/// Curated token list with verified mainnet addresses.
fn token_list() -> Vec<TokenInfo> {
    vec![
        TokenInfo {
            symbol: "ETH".into(),
            name: "Ether".into(),
            address: "0x0000000000000000000000000000000000000000".into(),
            chain: "ethereum".into(),
            decimals: 18,
            logo_uri: "https://assets.coingecko.com/coins/images/279/small/ethereum.png".into(),
        },
        TokenInfo {
            symbol: "WETH".into(),
            name: "Wrapped Ether".into(),
            address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".into(),
            chain: "ethereum".into(),
            decimals: 18,
            logo_uri: "https://assets.coingecko.com/coins/images/2518/small/weth.png".into(),
        },
        TokenInfo {
            symbol: "USDC".into(),
            name: "USD Coin".into(),
            address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".into(),
            chain: "ethereum".into(),
            decimals: 6,
            logo_uri: "https://assets.coingecko.com/coins/images/6319/small/usdc.png".into(),
        },
        TokenInfo {
            symbol: "USDT".into(),
            name: "Tether USD".into(),
            address: "0xdAC17F958D2ee523a2206206994597C13D831ec7".into(),
            chain: "ethereum".into(),
            decimals: 6,
            logo_uri: "https://assets.coingecko.com/coins/images/325/small/Tether.png".into(),
        },
        TokenInfo {
            symbol: "DAI".into(),
            name: "Dai Stablecoin".into(),
            address: "0x6B175474E89094C44Da98b954EedeAC495271d0F".into(),
            chain: "ethereum".into(),
            decimals: 18,
            logo_uri: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png".into(),
        },
        TokenInfo {
            symbol: "WBTC".into(),
            name: "Wrapped BTC".into(),
            address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599".into(),
            chain: "ethereum".into(),
            decimals: 8,
            logo_uri: "https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png".into(),
        },
        TokenInfo {
            symbol: "UNI".into(),
            name: "Uniswap".into(),
            address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984".into(),
            chain: "ethereum".into(),
            decimals: 18,
            logo_uri: "https://assets.coingecko.com/coins/images/12504/small/uni.jpg".into(),
        },
        TokenInfo {
            symbol: "LINK".into(),
            name: "Chainlink".into(),
            address: "0x514910771AF9Ca656af840dff83E8264EcF986CA".into(),
            chain: "ethereum".into(),
            decimals: 18,
            logo_uri: "https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png".into(),
        },
        TokenInfo {
            symbol: "AAVE".into(),
            name: "Aave".into(),
            address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9".into(),
            chain: "ethereum".into(),
            decimals: 18,
            logo_uri: "https://assets.coingecko.com/coins/images/12645/small/aave-token-round.png".into(),
        },
        TokenInfo {
            symbol: "MKR".into(),
            name: "Maker".into(),
            address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2".into(),
            chain: "ethereum".into(),
            decimals: 18,
            logo_uri: "https://assets.coingecko.com/coins/images/1364/small/Mark_Maker.png".into(),
        },
        TokenInfo {
            symbol: "PEPE".into(),
            name: "Pepe".into(),
            address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933".into(),
            chain: "ethereum".into(),
            decimals: 18,
            logo_uri: "https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg".into(),
        },
        TokenInfo {
            symbol: "SHIB".into(),
            name: "Shiba Inu".into(),
            address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE".into(),
            chain: "ethereum".into(),
            decimals: 18,
            logo_uri: "https://assets.coingecko.com/coins/images/11939/small/shiba.png".into(),
        },
    ]
}

async fn list_tokens(State(_state): State<Arc<AppState>>) -> Json<TokensResponse> {
    Json(TokensResponse {
        tokens: token_list(),
    })
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new().route("/v1/tokens", get(list_tokens))
}
