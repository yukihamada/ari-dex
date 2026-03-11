import { useState, useCallback, useEffect } from "react";
import { useAccount } from "wagmi";
import { parseUnits } from "viem";
import { useQuote } from "../hooks/useQuote";
import { useSubmitIntent } from "../hooks/useSubmitIntent";
import { useTokenBalance } from "../hooks/useTokenBalance";
import { useTokenApproval } from "../hooks/useTokenApproval";
import { useSwap } from "../hooks/useSwap";
import type { Token } from "../types";
import { ChainId } from "../types";
import { API_URL, DEFAULT_SLIPPAGE_BPS } from "../config";

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

type SwapStep = "idle" | "approving" | "signing" | "swapping" | "confirming" | "success" | "error";

export function SwapPanel() {
  const { address, isConnected } = useAccount();

  const [sellToken, setSellToken] = useState<Token>(TOKENS[0]);
  const [buyToken, setBuyToken] = useState<Token>(TOKENS[1]);
  const [sellAmount, setSellAmount] = useState("");
  const [step, setStep] = useState<SwapStep>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [livePrice, setLivePrice] = useState<Record<string, number>>({});

  // WebSocket for live prices
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      const wsUrl = API_URL
        ? API_URL.replace(/^http/, "ws") + "/ws"
        : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => ws?.send(JSON.stringify({ subscribe: "prices" }));
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

  // Quote
  const { data: quote, isLoading: quoteLoading } = useQuote(sellToken, buyToken, sellAmount);

  // Intent (for analytics/tracking)
  const { submit: submitIntent } = useSubmitIntent();

  // Balance
  const { balance: sellBalance, formatted: sellBalanceFormatted } = useTokenBalance(sellToken, address);

  // Approval for Uniswap Router (ERC-20 only, not ETH)
  const rawSellAmount = sellAmount ? parseUnits(sellAmount, sellToken.decimals) : 0n;
  const {
    needsApproval,
    approve,
    isApproving,
    isApproved,
    refetchAllowance,
    approvalTxHash,
  } = useTokenApproval(sellToken.address, address, rawSellAmount);

  // Swap via Uniswap V3
  const {
    swap,
    txHash: swapTxHash,
    isPending: swapPending,
    isConfirming: swapConfirming,
    isSuccess: swapSuccess,
    error: swapError,
    reset: resetSwap,
  } = useSwap();

  // Watch approval success → move to idle
  useEffect(() => {
    if (isApproved && step === "approving") {
      refetchAllowance();
      setStep("idle");
    }
  }, [isApproved, step, refetchAllowance]);

  // Watch swap states
  useEffect(() => {
    if (swapPending) setStep("swapping");
  }, [swapPending]);

  useEffect(() => {
    if (swapConfirming) setStep("confirming");
  }, [swapConfirming]);

  useEffect(() => {
    if (swapSuccess) {
      setStep("success");
      // Submit intent to API for analytics
      if (address && quote) {
        submitIntent({
          sellToken,
          buyToken,
          sellAmount,
          minBuyAmount: quote.buy_amount,
          sender: address,
        }, { onSuccess: () => {}, onError: () => {} });
      }
    }
  }, [swapSuccess]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (swapError) {
      setStep("error");
      setErrorMsg(swapError.message?.includes("User rejected")
        ? "Transaction rejected by user"
        : swapError.message?.slice(0, 120) || "Swap failed");
    }
  }, [swapError]);

  const isSameToken = sellToken.symbol === buyToken.symbol;
  const isETH = sellToken.address === ZERO_ADDRESS;

  const hasSufficientBalance =
    sellBalance !== undefined && rawSellAmount > 0n
      ? sellBalance >= rawSellAmount
      : true;

  const handleSwapTokens = useCallback(() => {
    setSellToken(buyToken);
    setBuyToken(sellToken);
    setSellAmount("");
    setErrorMsg(null);
    setStep("idle");
    resetSwap();
  }, [sellToken, buyToken, resetSwap]);

  const handleApprove = useCallback(() => {
    setStep("approving");
    setErrorMsg(null);
    approve();
  }, [approve]);

  const handleSwap = useCallback(async () => {
    if (!sellAmount || !quote || isSameToken || !isConnected || !address) return;
    setErrorMsg(null);

    // Calculate minimum output with slippage tolerance
    const buyAmountRaw = BigInt(quote.buy_amount);
    const slippageMultiplier = 10000n - BigInt(DEFAULT_SLIPPAGE_BPS); // 9950 for 0.5%
    const amountOutMinimum = (buyAmountRaw * slippageMultiplier) / 10000n;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 min

    swap({
      sellTokenAddress: sellToken.address,
      buyTokenAddress: buyToken.address,
      sellSymbol: sellToken.symbol,
      buySymbol: buyToken.symbol,
      amountIn: rawSellAmount,
      amountOutMinimum,
      recipient: address,
      deadline,
    });
  }, [sellToken, buyToken, sellAmount, quote, address, isConnected, isSameToken, rawSellAmount, swap]);

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
    if (["USDC", "USDT", "DAI"].includes(sellToken.symbol)) {
      return `$${amt.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    }
    if (sellToken.symbol === "WBTC" && livePrice["BTC/USDC"]) {
      return `$${(amt * livePrice["BTC/USDC"]).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    }
    return "";
  };

  const resetState = () => {
    setStep("idle");
    setErrorMsg(null);
    setSellAmount("");
    resetSwap();
  };

  // Button config
  const getButtonConfig = (): { label: string; disabled: boolean; onClick: () => void } => {
    if (isSameToken) return { label: "Select Different Tokens", disabled: true, onClick: () => {} };
    if (!isConnected) return { label: "Connect Wallet", disabled: true, onClick: () => {} };
    if (!sellAmount || parseFloat(sellAmount) === 0) return { label: "Enter Amount", disabled: true, onClick: () => {} };
    if (!hasSufficientBalance) return { label: "Insufficient Balance", disabled: true, onClick: () => {} };
    if (quoteLoading) return { label: "Fetching Quote...", disabled: true, onClick: () => {} };

    // Need approval for ERC-20
    if (needsApproval && !isETH) {
      if (isApproving) return { label: `Approving ${sellToken.symbol}...`, disabled: true, onClick: () => {} };
      return { label: `Approve ${sellToken.symbol}`, disabled: false, onClick: handleApprove };
    }

    if (step === "swapping") return { label: "Confirm in Wallet...", disabled: true, onClick: () => {} };
    if (step === "confirming") return { label: "Confirming...", disabled: true, onClick: () => {} };
    if (step === "success") return { label: "Swap Complete!", disabled: true, onClick: () => {} };

    return { label: "Swap", disabled: false, onClick: handleSwap };
  };

  const btn = getButtonConfig();

  return (
    <div className="swap-panel">
      <div className="swap-panel-header">
        <h2 className="swap-panel-title">Swap</h2>
        <div className="swap-panel-settings">
          <button className="swap-panel-setting-btn">{DEFAULT_SLIPPAGE_BPS / 100}% slippage</button>
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
                  const maxVal = isETH
                    ? Math.max(0, parseFloat(sellBalanceFormatted) - 0.005).toString()
                    : sellBalanceFormatted;
                  setSellAmount(maxVal);
                  setStep("idle");
                  resetSwap();
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
                setErrorMsg(null);
                setStep("idle");
                resetSwap();
              }
            }}
          />
          <select
            className="swap-panel-token-select"
            value={sellToken.symbol}
            onChange={(e) => {
              const t = TOKENS.find((tk) => tk.symbol === e.target.value);
              if (t) { setSellToken(t); setStep("idle"); resetSwap(); }
            }}
          >
            {TOKENS.map((t) => (
              <option key={t.address} value={t.symbol}>
                {TOKEN_ICONS[t.symbol] || ""} {t.symbol}
              </option>
            ))}
          </select>
        </div>
        {sellAmount && formatUsdValue() && (
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
              if (t) { setBuyToken(t); resetSwap(); }
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
      {quote && !isSameToken && step !== "success" && (
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
            <span>Min. received</span>
            <span>
              {quote ? (
                parseFloat(quote.buy_amount) * (1 - DEFAULT_SLIPPAGE_BPS / 10000) / 10 ** buyToken.decimals
              ).toLocaleString("en-US", { maximumFractionDigits: 6 }) : "—"}{" "}
              {buyToken.symbol}
            </span>
          </div>
          <div className="swap-panel-detail-row">
            <span>Network</span>
            <span style={{ color: "var(--accent)" }}>Ethereum via Uniswap V3</span>
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
        className={`swap-panel-submit ${step === "success" ? "swap-panel-submit--success" : ""} ${!isConnected && sellAmount ? "swap-panel-submit--connect" : ""}`}
        disabled={btn.disabled}
        onClick={btn.onClick}
      >
        {btn.label}
      </button>

      {/* Confirming */}
      {step === "confirming" && swapTxHash && (
        <div className="swap-panel-info">
          Transaction submitted!{" "}
          <a
            href={`https://etherscan.io/tx/${swapTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent)" }}
          >
            View on Etherscan
          </a>
        </div>
      )}

      {/* Success */}
      {step === "success" && swapTxHash && (
        <div className="swap-panel-success">
          <span>&#10003;</span>
          <div>
            <div style={{ fontWeight: 600 }}>Swap successful!</div>
            <div style={{ fontSize: "0.82rem", opacity: 0.85, marginTop: 4 }}>
              Swapped {sellAmount} {sellToken.symbol} for ~{formatBuyAmount()} {buyToken.symbol}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a
                href={`https://etherscan.io/tx/${swapTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: "6px 14px",
                  background: "rgba(6,214,160,0.12)",
                  border: "1px solid rgba(6,214,160,0.25)",
                  borderRadius: 8,
                  color: "var(--accent, #06d6a0)",
                  fontSize: "0.82rem",
                  textDecoration: "none",
                }}
              >
                View on Etherscan
              </a>
              <button
                onClick={resetState}
                style={{
                  padding: "6px 14px",
                  background: "rgba(124,92,252,0.1)",
                  border: "1px solid rgba(124,92,252,0.25)",
                  borderRadius: 8,
                  color: "var(--accent, #7c5cfc)",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                }}
              >
                New Swap
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {step === "error" && errorMsg && (
        <div className="swap-panel-warning">
          <span style={{ flex: 1 }}>{errorMsg}</span>
          <button
            onClick={() => { setStep("idle"); setErrorMsg(null); resetSwap(); }}
            style={{
              marginLeft: 8,
              padding: "2px 10px",
              background: "transparent",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 6,
              color: "var(--red, #ef4444)",
              cursor: "pointer",
              fontSize: "0.78rem",
              flexShrink: 0,
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
