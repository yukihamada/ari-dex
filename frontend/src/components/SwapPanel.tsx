import { useState, useCallback, useEffect } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { useQuote } from "../hooks/useQuote";
import { useSubmitIntent } from "../hooks/useSubmitIntent";
import { useSignIntent } from "../hooks/useSignIntent";
import { useTokenBalance } from "../hooks/useTokenBalance";
import { useTokenApproval } from "../hooks/useTokenApproval";
import type { Token } from "../types";
import { ChainId } from "../types";
import { API_URL } from "../config";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const TOKENS: Token[] = [
  { chain: ChainId.Ethereum, address: ZERO_ADDRESS, symbol: "ETH", decimals: 18 },
  { chain: ChainId.Ethereum, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 },
  { chain: ChainId.Ethereum, address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6 },
  { chain: ChainId.Ethereum, address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", decimals: 18 },
  { chain: ChainId.Ethereum, address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", decimals: 8 },
];

const TOKEN_ICONS: Record<string, string> = {
  ETH: "\u039E",
  USDC: "$",
  USDT: "\u20AE",
  DAI: "\u25C8",
  WBTC: "\u20BF",
};

type SwapStep = "idle" | "approving" | "signing" | "submitting" | "confirmed" | "error";

export function SwapPanel() {
  const { address, isConnected } = useAccount();

  const [sellToken, setSellToken] = useState<Token>(TOKENS[0]);
  const [buyToken, setBuyToken] = useState<Token>(TOKENS[1]);
  const [sellAmount, setSellAmount] = useState("");
  const [step, setStep] = useState<SwapStep>("idle");
  const [txResult, setTxResult] = useState<{ intentId?: string; txHash?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<Record<string, number>>({});

  // Fetch live prices via WS
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      const wsUrl = API_URL
        ? API_URL.replace(/^http/, "ws") + "/ws"
        : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws?.send(JSON.stringify({ subscribe: "prices" }));
      };
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.pair && data.price) {
            setLivePrice((prev) => ({ ...prev, [data.pair]: data.price }));
          }
        } catch { /* ignore */ }
      };
    } catch { /* ignore */ }
    return () => ws?.close();
  }, []);

  const { data: quote, isLoading: quoteLoading } = useQuote(sellToken, buyToken, sellAmount);
  const { submit } = useSubmitIntent();
  const { signIntent } = useSignIntent();

  // Token balance
  const { balance: sellBalance, formatted: sellBalanceFormatted } = useTokenBalance(sellToken, address);

  // Token approval (only for ERC-20s, not ETH)
  const rawSellAmount = sellAmount
    ? parseUnits(sellAmount, sellToken.decimals)
    : 0n;
  const {
    needsApproval,
    approve,
    isApproving,
    isApproved,
    refetchAllowance,
    approvalTxHash,
  } = useTokenApproval(sellToken.address, address, rawSellAmount);

  // Refetch allowance after approval succeeds
  useEffect(() => {
    if (isApproved) {
      refetchAllowance();
      setStep("idle");
    }
  }, [isApproved, refetchAllowance]);

  const isSameToken = sellToken.symbol === buyToken.symbol;
  const isETH = sellToken.address === ZERO_ADDRESS;

  // Check if user has sufficient balance
  const hasSufficientBalance =
    sellBalance !== undefined && rawSellAmount > 0n
      ? sellBalance >= rawSellAmount
      : true; // Don't block if we can't check

  const handleSwapTokens = useCallback(() => {
    setSellToken(buyToken);
    setBuyToken(sellToken);
    setSellAmount("");
    setTxResult(null);
    setErrorMsg(null);
    setStep("idle");
  }, [sellToken, buyToken]);

  const handleApprove = useCallback(() => {
    setStep("approving");
    setErrorMsg(null);
    approve();
  }, [approve]);

  const handleSubmit = useCallback(async () => {
    if (!sellAmount || !quote || isSameToken || !isConnected || !address) return;

    setErrorMsg(null);
    setStep("signing");

    try {
      // Step 1: Sign the intent with EIP-712
      const result = await signIntent({
        sender: address,
        sellToken,
        buyToken,
        sellAmount,
        minBuyAmount: quote.buy_amount,
      });

      // Step 2: Submit intent to API
      setStep("submitting");
      submit(
        {
          sellToken,
          buyToken,
          sellAmount,
          minBuyAmount: quote.buy_amount,
          sender: address,
          signature: result.signature,
          deadline: result.deadline,
          nonce: result.nonce,
        },
        {
          onSuccess: (data) => {
            setStep("confirmed");
            setTxResult({
              intentId: data.intent_id,
            });
          },
          onError: (err) => {
            setStep("error");
            setErrorMsg(err.message);
          },
        },
      );
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Transaction failed");
    }
  }, [sellToken, buyToken, sellAmount, quote, submit, address, isConnected, signIntent, isSameToken]);

  const formatBuyAmount = () => {
    if (!quote) return "";
    const raw = parseFloat(quote.buy_amount);
    const decimals = buyToken.decimals;
    return (raw / 10 ** decimals).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals > 8 ? 6 : 2,
    });
  };

  const formatUsdValue = () => {
    if (!quote) return "";
    const amt = parseFloat(sellAmount || "0");
    if (sellToken.symbol === "ETH" && livePrice["ETH/USDC"]) {
      return `$${(amt * livePrice["ETH/USDC"]).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    }
    if (sellToken.symbol === "USDC" || sellToken.symbol === "USDT" || sellToken.symbol === "DAI") {
      return `$${amt.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    }
    return "";
  };

  const resetState = () => {
    setStep("idle");
    setTxResult(null);
    setErrorMsg(null);
    setSellAmount("");
  };

  // Determine button state
  const getButtonConfig = (): { label: string; disabled: boolean; onClick: () => void } => {
    if (isSameToken) return { label: "Select Different Tokens", disabled: true, onClick: () => {} };
    if (!isConnected) return { label: "Connect Wallet", disabled: true, onClick: () => {} };
    if (!sellAmount) return { label: "Enter Amount", disabled: true, onClick: () => {} };
    if (!hasSufficientBalance) return { label: "Insufficient Balance", disabled: true, onClick: () => {} };
    if (quoteLoading) return { label: "Fetching Quote...", disabled: true, onClick: () => {} };

    // Need approval for ERC-20 (not ETH)
    if (needsApproval && !isETH) {
      if (isApproving) return { label: `Approving ${sellToken.symbol}...`, disabled: true, onClick: () => {} };
      return { label: `Approve ${sellToken.symbol}`, disabled: false, onClick: handleApprove };
    }

    if (step === "signing") return { label: "Signing Intent...", disabled: true, onClick: () => {} };
    if (step === "submitting") return { label: "Submitting...", disabled: true, onClick: () => {} };

    return { label: "Sign & Submit Intent", disabled: false, onClick: handleSubmit };
  };

  const btn = getButtonConfig();

  return (
    <div className="swap-panel">
      <div className="swap-panel-header">
        <h2 className="swap-panel-title">Swap</h2>
        <div className="swap-panel-settings">
          <button className="swap-panel-setting-btn">0.5% slippage</button>
        </div>
      </div>

      {/* Sell */}
      <div className="swap-panel-section">
        <div className="swap-panel-section-header">
          <label className="swap-panel-label">You pay</label>
          {isConnected && sellBalanceFormatted && (
            <span
              className="swap-panel-balance"
              onClick={() => {
                if (sellBalanceFormatted) {
                  // Set to max balance (leave some ETH for gas)
                  const maxVal = isETH
                    ? Math.max(0, parseFloat(sellBalanceFormatted) - 0.01).toString()
                    : sellBalanceFormatted;
                  setSellAmount(maxVal);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              Balance: {parseFloat(sellBalanceFormatted).toLocaleString("en-US", {
                maximumFractionDigits: 6,
              })} {sellToken.symbol}
            </span>
          )}
        </div>
        <div className="swap-panel-row">
          <input
            className="swap-panel-input"
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={sellAmount}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "" || /^\d*\.?\d*$/.test(val)) {
                setSellAmount(val);
                setTxResult(null);
                setErrorMsg(null);
                setStep("idle");
              }
            }}
          />
          <select
            className="swap-panel-token-select"
            value={sellToken.symbol}
            onChange={(e) => {
              const t = TOKENS.find((tk) => tk.symbol === e.target.value);
              if (t) {
                setSellToken(t);
                setStep("idle");
              }
            }}
          >
            {TOKENS.map((t) => (
              <option key={t.address} value={t.symbol}>
                {TOKEN_ICONS[t.symbol] || ""} {t.symbol}
              </option>
            ))}
          </select>
        </div>
        {sellAmount && (
          <div className="swap-panel-usd">{formatUsdValue()}</div>
        )}
        {sellAmount && !hasSufficientBalance && (
          <div className="swap-panel-warning" style={{ marginTop: 6, fontSize: "0.82rem" }}>
            Insufficient {sellToken.symbol} balance
          </div>
        )}
      </div>

      {/* Flip */}
      <button className="swap-panel-flip" onClick={handleSwapTokens} aria-label="Swap tokens">
        &#8595;
      </button>

      {/* Buy */}
      <div className="swap-panel-section">
        <div className="swap-panel-section-header">
          <label className="swap-panel-label">You receive</label>
        </div>
        <div className="swap-panel-row">
          <input
            className={`swap-panel-input ${quoteLoading ? "loading" : ""}`}
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={formatBuyAmount()}
            readOnly
          />
          <select
            className="swap-panel-token-select"
            value={buyToken.symbol}
            onChange={(e) => {
              const t = TOKENS.find((tk) => tk.symbol === e.target.value);
              if (t) setBuyToken(t);
            }}
          >
            {TOKENS.map((t) => (
              <option key={t.address} value={t.symbol}>
                {TOKEN_ICONS[t.symbol] || ""} {t.symbol}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Same-token warning */}
      {isSameToken && (
        <div className="swap-panel-warning">
          Cannot swap a token for itself. Please select different tokens.
        </div>
      )}

      {/* Quote details */}
      {quote && !isSameToken && (
        <div className="swap-panel-details">
          <div className="swap-panel-detail-row">
            <span>Rate</span>
            <span>
              1 {sellToken.symbol} = {parseFloat(quote.price).toLocaleString("en-US", { maximumFractionDigits: 6 })}{" "}
              {buyToken.symbol}
            </span>
          </div>
          <div className="swap-panel-detail-row">
            <span>Price Impact</span>
            <span style={{ color: parseFloat(quote.price_impact) > 1 ? "var(--red)" : "var(--green)" }}>
              {quote.price_impact}%
            </span>
          </div>
          <div className="swap-panel-detail-row">
            <span>Route</span>
            <span className="swap-panel-route">
              {quote.route.map((token, i) => (
                <span key={i}>
                  {i > 0 && <span className="swap-panel-route-arrow"> &rarr; </span>}
                  <span className="swap-panel-route-token">{token}</span>
                </span>
              ))}
            </span>
          </div>
          <div className="swap-panel-detail-row">
            <span>Fee</span>
            <span>0.05%</span>
          </div>
          <div className="swap-panel-detail-row">
            <span>Settlement</span>
            <span style={{ color: "var(--accent)" }}>Intent-based (solver network)</span>
          </div>
        </div>
      )}

      {/* Approval progress */}
      {approvalTxHash && isApproving && (
        <div className="swap-panel-info">
          Approval pending...{" "}
          <a
            href={`https://etherscan.io/tx/${approvalTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent)" }}
          >
            View on Etherscan
          </a>
        </div>
      )}

      {/* Action button */}
      <button
        className={`swap-panel-submit ${!isConnected && sellAmount ? "swap-panel-submit--connect" : ""}`}
        disabled={btn.disabled}
        onClick={btn.onClick}
      >
        {btn.label}
      </button>

      {/* Success */}
      {step === "confirmed" && txResult && (
        <div className="swap-panel-success">
          <span>&#10003;</span>
          <div>
            <div>Intent submitted successfully!</div>
            {txResult.intentId && (
              <div style={{ fontSize: "0.82rem", opacity: 0.8, marginTop: 4 }}>
                ID: {txResult.intentId.slice(0, 12)}...{txResult.intentId.slice(-6)}
              </div>
            )}
            <div style={{ fontSize: "0.8rem", opacity: 0.7, marginTop: 4 }}>
              Solvers are competing to fill your intent with optimal execution.
            </div>
            <button
              onClick={resetState}
              style={{
                marginTop: 8,
                padding: "6px 16px",
                background: "rgba(6,214,160,0.15)",
                border: "1px solid rgba(6,214,160,0.3)",
                borderRadius: 8,
                color: "var(--accent)",
                cursor: "pointer",
                fontSize: "0.82rem",
              }}
            >
              New Swap
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {step === "error" && errorMsg && (
        <div className="swap-panel-warning">
          {errorMsg}
          <button
            onClick={() => { setStep("idle"); setErrorMsg(null); }}
            style={{
              marginLeft: 8,
              padding: "2px 10px",
              background: "transparent",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 6,
              color: "var(--red, #ef4444)",
              cursor: "pointer",
              fontSize: "0.78rem",
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
