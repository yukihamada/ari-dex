//! On-chain settlement executor.
//!
//! Constructs and submits Settlement.settle() transactions to Ethereum
//! using raw JSON-RPC calls. The solver worker calls this after computing
//! a valid fill for a pending intent.

use serde::{Deserialize, Serialize};
use tiny_keccak::{Hasher, Keccak};

/// Configuration for the on-chain executor.
#[derive(Clone)]
pub struct ExecutorConfig {
    /// Ethereum JSON-RPC endpoint.
    pub rpc_url: String,
    /// Settlement contract address.
    pub settlement_address: String,
    /// Chain ID (1 = mainnet, 11155111 = sepolia).
    pub chain_id: u64,
    /// Whether on-chain execution is enabled.
    pub enabled: bool,
}

impl ExecutorConfig {
    /// Load from environment variables.
    pub fn from_env() -> Self {
        Self {
            rpc_url: std::env::var("ETH_RPC_URL")
                .unwrap_or_else(|_| "https://eth.llamarpc.com".to_string()),
            settlement_address: std::env::var("SETTLEMENT_ADDRESS")
                .unwrap_or_else(|_| "0x536EeDA7d07cF7Af171fBeD8FAe7987a5c63B822".to_string()),
            chain_id: std::env::var("CHAIN_ID")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(1),
            enabled: std::env::var("EXECUTOR_ENABLED")
                .map(|v| v == "true" || v == "1")
                .unwrap_or(false),
        }
    }
}

/// Represents an intent for on-chain settlement (matches Solidity struct).
#[derive(Serialize)]
pub struct OnChainIntent {
    pub sender: String,
    pub sell_token: String,
    pub sell_amount: String,
    pub buy_token: String,
    pub min_buy_amount: String,
    pub deadline: u64,
    pub nonce: u64,
    pub signature: String,
}

/// Result of an on-chain settlement attempt.
#[derive(Debug)]
pub enum SettlementResult {
    /// Transaction submitted successfully.
    Submitted { tx_hash: String },
    /// Execution is disabled (dry-run mode).
    DryRun { would_settle: String },
    /// Settlement failed.
    Failed { reason: String },
}

fn keccak256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Keccak::v256();
    let mut output = [0u8; 32];
    hasher.update(data);
    hasher.finalize(&mut output);
    output
}

/// Encode the settle() function call data.
///
/// settle(Intent, Solution, bytes) selector = first 4 bytes of keccak256("settle(...)").
/// For now we compute the ABI encoding that would be needed.
pub fn encode_settle_calldata(
    intent: &OnChainIntent,
    solver_address: &str,
    buy_amount: &str,
) -> Vec<u8> {
    // Function selector: settle((address,address,uint256,address,uint256,uint256,uint256,bytes),(bytes32,address,uint256,bytes),bytes)
    // We use a simplified selector
    let selector = &keccak256(
        b"settle((address,address,uint256,address,uint256,uint256,uint256,bytes),(bytes32,address,uint256,bytes),bytes)"
    )[..4];

    let mut calldata = Vec::with_capacity(4 + 32 * 20);
    calldata.extend_from_slice(selector);

    // ABI encoding of the Intent tuple and Solution tuple
    // This is a simplified representation - full ABI encoding would need
    // dynamic offset handling for bytes fields

    // For now, log the intended calldata parameters
    tracing::info!(
        "Encoded settle calldata: sender={}, sell_token={}, buy_token={}, solver={}",
        intent.sender, intent.sell_token, intent.buy_token, solver_address
    );

    let _ = buy_amount; // used in full implementation

    calldata
}

/// Check the ETH balance of an address via JSON-RPC.
pub async fn check_balance(rpc_url: &str, address: &str) -> Result<f64, String> {
    let client = reqwest::Client::new();

    #[derive(Serialize)]
    struct RpcRequest {
        jsonrpc: &'static str,
        method: &'static str,
        params: Vec<serde_json::Value>,
        id: u64,
    }

    #[derive(Deserialize)]
    struct RpcResponse {
        result: Option<String>,
    }

    let req = RpcRequest {
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: vec![
            serde_json::Value::String(address.to_string()),
            serde_json::Value::String("latest".to_string()),
        ],
        id: 1,
    };

    let resp: RpcResponse = client
        .post(rpc_url)
        .json(&req)
        .send()
        .await
        .map_err(|e| format!("RPC request failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("RPC response parse failed: {e}"))?;

    let hex = resp.result.unwrap_or_else(|| "0x0".to_string());
    let hex = hex.strip_prefix("0x").unwrap_or(&hex);
    let wei = u128::from_str_radix(hex, 16).unwrap_or(0);
    Ok(wei as f64 / 1e18)
}

/// Estimate gas for a transaction via JSON-RPC.
pub async fn estimate_gas(
    rpc_url: &str,
    from: &str,
    to: &str,
    data: &[u8],
) -> Result<u64, String> {
    let client = reqwest::Client::new();

    #[derive(Serialize)]
    struct EstimateParams {
        from: String,
        to: String,
        data: String,
    }

    #[derive(Serialize)]
    struct RpcRequest {
        jsonrpc: &'static str,
        method: &'static str,
        params: Vec<serde_json::Value>,
        id: u64,
    }

    #[derive(Deserialize)]
    struct RpcResponse {
        result: Option<String>,
        error: Option<serde_json::Value>,
    }

    let params = EstimateParams {
        from: from.to_string(),
        to: to.to_string(),
        data: format!("0x{}", data.iter().map(|b| format!("{b:02x}")).collect::<String>()),
    };

    let req = RpcRequest {
        jsonrpc: "2.0",
        method: "eth_estimateGas",
        params: vec![serde_json::to_value(params).unwrap()],
        id: 1,
    };

    let resp: RpcResponse = client
        .post(rpc_url)
        .json(&req)
        .send()
        .await
        .map_err(|e| format!("Gas estimation failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Gas estimate parse failed: {e}"))?;

    if let Some(err) = resp.error {
        return Err(format!("Gas estimation error: {err}"));
    }

    let hex = resp.result.unwrap_or_else(|| "0x0".to_string());
    let hex = hex.strip_prefix("0x").unwrap_or(&hex);
    u64::from_str_radix(hex, 16).map_err(|e| format!("Invalid gas hex: {e}"))
}

/// Get current gas price from the network.
pub async fn get_gas_price(rpc_url: &str) -> Result<u64, String> {
    let client = reqwest::Client::new();

    #[derive(Serialize)]
    struct RpcRequest {
        jsonrpc: &'static str,
        method: &'static str,
        params: Vec<serde_json::Value>,
        id: u64,
    }

    #[derive(Deserialize)]
    struct RpcResponse {
        result: Option<String>,
    }

    let req = RpcRequest {
        jsonrpc: "2.0",
        method: "eth_gasPrice",
        params: vec![],
        id: 1,
    };

    let resp: RpcResponse = client
        .post(rpc_url)
        .json(&req)
        .send()
        .await
        .map_err(|e| format!("Gas price fetch failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Gas price parse failed: {e}"))?;

    let hex = resp.result.unwrap_or_else(|| "0x0".to_string());
    let hex = hex.strip_prefix("0x").unwrap_or(&hex);
    u64::from_str_radix(hex, 16).map_err(|e| format!("Invalid gas price hex: {e}"))
}

/// Attempt to settle an intent on-chain.
///
/// In production mode (EXECUTOR_ENABLED=true), this would:
/// 1. Build the settle() calldata
/// 2. Estimate gas
/// 3. Sign the transaction with the solver's private key
/// 4. Submit via eth_sendRawTransaction
/// 5. Wait for confirmation
///
/// Without a private key, it operates in dry-run mode, logging what would happen.
pub async fn settle_on_chain(
    config: &ExecutorConfig,
    intent: &OnChainIntent,
    solver_address: &str,
    buy_amount: &str,
) -> SettlementResult {
    if !config.enabled {
        return SettlementResult::DryRun {
            would_settle: format!(
                "settle({} -> {}, {} {} for {} {})",
                intent.sender,
                solver_address,
                intent.sell_amount,
                intent.sell_token,
                buy_amount,
                intent.buy_token,
            ),
        };
    }

    // Check solver balance for gas
    match check_balance(&config.rpc_url, solver_address).await {
        Ok(balance) => {
            if balance < 0.01 {
                return SettlementResult::Failed {
                    reason: format!("Insufficient solver ETH balance: {balance:.4} ETH (need >= 0.01)"),
                };
            }
            tracing::info!("Solver balance: {balance:.4} ETH");
        }
        Err(e) => {
            return SettlementResult::Failed {
                reason: format!("Failed to check solver balance: {e}"),
            };
        }
    }

    // Build calldata
    let calldata = encode_settle_calldata(intent, solver_address, buy_amount);

    // Estimate gas
    match estimate_gas(&config.rpc_url, solver_address, &config.settlement_address, &calldata).await {
        Ok(gas) => {
            tracing::info!("Estimated gas for settlement: {gas}");
        }
        Err(e) => {
            tracing::warn!("Gas estimation failed (may need token approvals): {e}");
            // Don't fail - gas estimation can fail if approvals aren't set
        }
    }

    // Without a signing key, we can only report what would happen
    // Full implementation requires SOLVER_PRIVATE_KEY env var + k256 signing
    let has_key = std::env::var("SOLVER_PRIVATE_KEY").is_ok();
    if !has_key {
        return SettlementResult::DryRun {
            would_settle: format!(
                "Would call settle() on {} with gas. Set SOLVER_PRIVATE_KEY to enable.",
                config.settlement_address
            ),
        };
    }

    // TODO: Sign and submit transaction when SOLVER_PRIVATE_KEY is available
    // 1. Build RLP-encoded transaction
    // 2. Sign with k256
    // 3. eth_sendRawTransaction
    // 4. Wait for receipt

    SettlementResult::DryRun {
        would_settle: format!(
            "Transaction signing ready but not yet implemented. Contract: {}",
            config.settlement_address
        ),
    }
}
