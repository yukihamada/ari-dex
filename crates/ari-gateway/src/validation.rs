//! Input validation helpers with EIP-712 signature verification.

use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use tiny_keccak::{Hasher, Keccak};

/// Validate that a string represents a valid, non-negative decimal amount.
pub fn validate_amount(s: &str) -> Result<(), &'static str> {
    if s.is_empty() {
        return Err("empty amount");
    }
    let parsed: f64 = s.parse().map_err(|_| "invalid number")?;
    if parsed < 0.0 {
        return Err("negative amount");
    }
    if parsed.is_nan() || parsed.is_infinite() {
        return Err("invalid amount");
    }
    Ok(())
}

/// Validate that a hex string looks like an Ethereum address (0x + 40 hex chars).
pub fn validate_address(s: &str) -> Result<(), &'static str> {
    if !s.starts_with("0x") && !s.starts_with("0X") {
        return Err("address must start with 0x");
    }
    let hex = &s[2..];
    if hex.len() != 40 {
        return Err("address must be 42 characters");
    }
    if !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("address contains invalid hex characters");
    }
    Ok(())
}

fn keccak256(data: &[u8]) -> [u8; 32] {
    let mut hasher = Keccak::v256();
    let mut output = [0u8; 32];
    hasher.update(data);
    hasher.finalize(&mut output);
    output
}

fn hex_decode(hex: &str) -> Result<Vec<u8>, String> {
    if hex.len() % 2 != 0 {
        return Err("odd length hex string".into());
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).map_err(|e| e.to_string()))
        .collect()
}

/// Recover Ethereum address from EIP-712 typed data hash and signature.
fn ecrecover(hash: &[u8; 32], sig_bytes: &[u8; 65]) -> Result<String, String> {
    let r_s = &sig_bytes[..64];
    let v = sig_bytes[64];

    // v is either 27/28 (legacy) or 0/1
    let recovery_id = match v {
        27 | 0 => RecoveryId::new(false, false),
        28 | 1 => RecoveryId::new(true, false),
        _ => return Err(format!("invalid recovery id: {v}")),
    };

    let signature =
        Signature::from_slice(r_s).map_err(|e| format!("invalid signature: {e}"))?;

    let verifying_key =
        VerifyingKey::recover_from_prehash(hash, &signature, recovery_id)
            .map_err(|e| format!("ecrecover failed: {e}"))?;

    // Derive Ethereum address: keccak256(uncompressed_pubkey[1..]) -> last 20 bytes
    let pubkey_bytes = verifying_key
        .to_encoded_point(false);
    let pubkey_uncompressed = &pubkey_bytes.as_bytes()[1..]; // skip 0x04 prefix
    let hash = keccak256(pubkey_uncompressed);
    let addr = &hash[12..]; // last 20 bytes
    Ok(format!("0x{}", hex::encode(addr)))
}

/// Build the EIP-712 struct hash for an ARI swap intent.
///
/// Matches the Solidity Settlement.sol INTENT_TYPEHASH:
///   Intent(address sender,address sellToken,uint256 sellAmount,address buyToken,uint256 minBuyAmount,uint256 deadline,uint256 nonce)
fn build_intent_hash(
    sender: &str,
    sell_token: &str,
    buy_token: &str,
    sell_amount: &str,
    min_buy_amount: &str,
    deadline: Option<u64>,
    nonce: Option<u64>,
) -> [u8; 32] {
    let type_hash = keccak256(
        b"Intent(address sender,address sellToken,uint256 sellAmount,address buyToken,uint256 minBuyAmount,uint256 deadline,uint256 nonce)",
    );

    // ABI-encode: type_hash + address(sender) + address(sellToken) + uint256(sellAmount)
    //             + address(buyToken) + uint256(minBuyAmount) + uint256(deadline) + uint256(nonce)
    let mut encoded = Vec::with_capacity(8 * 32);
    encoded.extend_from_slice(&type_hash);

    // Addresses are left-padded to 32 bytes
    let sender_bytes = address_to_bytes32(sender);
    let sell_token_bytes = address_to_bytes32(sell_token);
    let buy_token_bytes = address_to_bytes32(buy_token);
    encoded.extend_from_slice(&sender_bytes);
    encoded.extend_from_slice(&sell_token_bytes);

    // uint256 sell_amount
    let sell_amt: u128 = sell_amount.parse().unwrap_or(0);
    let mut buf = [0u8; 32];
    buf[16..32].copy_from_slice(&sell_amt.to_be_bytes());
    encoded.extend_from_slice(&buf);

    encoded.extend_from_slice(&buy_token_bytes);

    // uint256 min_buy_amount
    let min_buy: u128 = min_buy_amount.parse().unwrap_or(0);
    buf = [0u8; 32];
    buf[16..32].copy_from_slice(&min_buy.to_be_bytes());
    encoded.extend_from_slice(&buf);

    // uint256 deadline
    let dl = deadline.unwrap_or(0) as u128;
    buf = [0u8; 32];
    buf[16..32].copy_from_slice(&dl.to_be_bytes());
    encoded.extend_from_slice(&buf);

    // uint256 nonce
    let n = nonce.unwrap_or(0) as u128;
    buf = [0u8; 32];
    buf[16..32].copy_from_slice(&n.to_be_bytes());
    encoded.extend_from_slice(&buf);

    keccak256(&encoded)
}

/// Convert an Ethereum address string (0x...) to a 32-byte left-padded array.
fn address_to_bytes32(addr: &str) -> [u8; 32] {
    let mut result = [0u8; 32];
    let hex_str = addr.strip_prefix("0x").or_else(|| addr.strip_prefix("0X")).unwrap_or(addr);
    if let Ok(bytes) = hex_decode(hex_str) {
        let start = 32 - bytes.len().min(20);
        let len = bytes.len().min(20);
        result[start..start + len].copy_from_slice(&bytes[..len]);
    }
    result
}

/// Build the EIP-712 domain separator for ARI DEX.
fn domain_separator() -> [u8; 32] {
    let type_hash = keccak256(
        b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
    );
    let name_hash = keccak256(b"ARI Exchange");
    let version_hash = keccak256(b"1");
    let chain_id: u128 = 1; // Ethereum mainnet
    let contract = hex_decode("536EeDA7d07cF7Af171fBeD8FAe7987a5c63B822").unwrap_or_default();

    let mut encoded = Vec::with_capacity(5 * 32);
    encoded.extend_from_slice(&type_hash);
    encoded.extend_from_slice(&name_hash);
    encoded.extend_from_slice(&version_hash);
    let mut buf = [0u8; 32];
    buf[16..32].copy_from_slice(&chain_id.to_be_bytes());
    encoded.extend_from_slice(&buf);
    buf = [0u8; 32];
    buf[12..32].copy_from_slice(&contract);
    encoded.extend_from_slice(&buf);

    keccak256(&encoded)
}

/// Verify an EIP-712 signature for an intent.
///
/// Recovers the signer via secp256k1 ecrecover and checks it matches `sender`.
/// Unsigned intents are allowed (frontend does direct Uniswap swap).
pub fn verify_intent_signature(
    sender: &str,
    sell_token: &str,
    buy_token: &str,
    sell_amount: &str,
    min_buy_amount: &str,
    deadline: Option<u64>,
    signature: Option<&str>,
) -> Result<(), String> {
    verify_intent_signature_with_nonce(sender, sell_token, buy_token, sell_amount, min_buy_amount, deadline, None, signature)
}

/// Full signature verification with nonce support.
#[allow(clippy::too_many_arguments)]
pub fn verify_intent_signature_with_nonce(
    sender: &str,
    sell_token: &str,
    buy_token: &str,
    sell_amount: &str,
    min_buy_amount: &str,
    deadline: Option<u64>,
    nonce: Option<u64>,
    signature: Option<&str>,
) -> Result<(), String> {
    // If no signature provided, allow unsigned intents
    let sig = match signature {
        Some(s) if !s.is_empty() && s != "0x" => s,
        _ => {
            tracing::debug!("No signature provided for intent from {}", sender);
            return Ok(());
        }
    };

    // Validate signature format: 0x + 130 hex chars (65 bytes = r[32] + s[32] + v[1])
    if !sig.starts_with("0x") {
        return Err("signature must start with 0x".into());
    }
    let hex_part = &sig[2..];
    if hex_part.len() != 130 {
        return Err(format!(
            "signature must be 65 bytes (130 hex chars), got {}",
            hex_part.len()
        ));
    }
    if !hex_part.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("signature contains invalid hex characters".into());
    }

    // Validate deadline hasn't passed
    if let Some(dl) = deadline {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        if dl < now {
            return Err(format!("intent expired: deadline {} < now {}", dl, now));
        }
    }

    // Validate sender address format
    if let Err(e) = validate_address(sender) {
        return Err(format!("invalid sender address: {}", e));
    }

    // Build EIP-712 hash
    let struct_hash = build_intent_hash(sender, sell_token, buy_token, sell_amount, min_buy_amount, deadline, nonce);
    let domain_sep = domain_separator();

    // "\x19\x01" || domainSeparator || structHash
    let mut digest_input = Vec::with_capacity(2 + 32 + 32);
    digest_input.extend_from_slice(&[0x19, 0x01]);
    digest_input.extend_from_slice(&domain_sep);
    digest_input.extend_from_slice(&struct_hash);
    let digest = keccak256(&digest_input);

    // Decode signature bytes and recover
    let sig_bytes = hex_decode(hex_part).map_err(|e| format!("invalid signature hex: {e}"))?;
    let mut sig_arr = [0u8; 65];
    sig_arr.copy_from_slice(&sig_bytes);

    let recovered = ecrecover(&digest, &sig_arr)?;

    // Compare addresses (case-insensitive)
    if recovered.to_lowercase() != sender.to_lowercase() {
        return Err(format!(
            "signer mismatch: recovered {} but sender is {}",
            recovered, sender
        ));
    }

    tracing::info!(
        "Verified EIP-712 signature from {} ({} {} -> {} {})",
        sender,
        sell_amount,
        sell_token,
        min_buy_amount,
        buy_token
    );

    Ok(())
}

// hex encode helper (avoid adding another dependency)
mod hex {
    pub fn encode(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }
}
