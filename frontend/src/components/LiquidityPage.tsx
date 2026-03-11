import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { API_URL } from "../config";

interface Pool {
  address: string;
  token0: string;
  token1: string;
  fee_tier: number;
}

interface Position {
  id: string;
  strategy_id: string;
  token: string;
  amount: string;
  created_at: number;
}

export function LiquidityPage() {
  const { address, isConnected } = useAccount();
  const [pools, setPools] = useState<Pool[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [selectedPool, setSelectedPool] = useState("");
  const [token, setToken] = useState("");
  const [amount, setAmount] = useState("");
  const [tickLower, setTickLower] = useState("-887220");
  const [tickUpper, setTickUpper] = useState("887220");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/v1/pools`)
      .then((r) => r.json())
      .then((d) => setPools(d.pools || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isConnected || !address) return;
    setLoading(true);
    fetch(`${API_URL}/v1/positions?address=${address}`)
      .then((r) => r.json())
      .then((d) => {
        setPositions(d.positions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [address, isConnected]);

  async function handleAdd() {
    if (!address || !selectedPool || !token || !amount) return;
    setSubmitting(true);
    setMessage("");
    try {
      const res = await fetch(`${API_URL}/v1/liquidity/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: address,
          pool: selectedPool,
          token,
          amount,
          tick_lower: parseInt(tickLower),
          tick_upper: parseInt(tickUpper),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`Added! Position: ${data.position_id}`);
        setAmount("");
        // Refresh positions
        const posRes = await fetch(`${API_URL}/v1/positions?address=${address}`);
        const posData = await posRes.json();
        setPositions(posData.positions || []);
      } else {
        setMessage(`Error: ${data.message}`);
      }
    } catch {
      setMessage("Failed to add liquidity");
    }
    setSubmitting(false);
  }

  async function handleRemove(positionId: string) {
    if (!address) return;
    try {
      const res = await fetch(`${API_URL}/v1/liquidity/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: address, position_id: positionId }),
      });
      const data = await res.json();
      if (data.success) {
        setPositions((prev) => prev.filter((p) => p.id !== positionId));
        setMessage(`Removed position ${positionId}`);
      } else {
        setMessage(`Error: ${data.message}`);
      }
    } catch {
      setMessage("Failed to remove liquidity");
    }
  }

  // Auto-fill token when pool is selected
  useEffect(() => {
    const pool = pools.find((p) => p.address === selectedPool);
    if (pool && !token) setToken(pool.token0);
  }, [selectedPool, pools, token]);

  if (!isConnected) {
    return (
      <div className="page-panel">
        <h2 className="page-title">Liquidity</h2>
        <p className="page-sub">Connect your wallet to manage liquidity positions</p>
      </div>
    );
  }

  return (
    <div className="page-panel">
      <h2 className="page-title">Liquidity</h2>
      <p className="page-sub">Add or remove liquidity from Uniswap V3 pools via ARI</p>

      {/* Add liquidity form */}
      <div className="lp-form">
        <h3 className="lp-section-title">Add Liquidity</h3>

        <label className="lp-label">Pool</label>
        <select
          className="lp-select"
          value={selectedPool}
          onChange={(e) => { setSelectedPool(e.target.value); setToken(""); }}
        >
          <option value="">Select a pool</option>
          {pools.map((p) => (
            <option key={p.address} value={p.address}>
              {p.token0}/{p.token1} ({(p.fee_tier / 10000).toFixed(2)}%)
            </option>
          ))}
        </select>

        <label className="lp-label">Token</label>
        <select
          className="lp-select"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        >
          {(() => {
            const pool = pools.find((p) => p.address === selectedPool);
            return pool
              ? [pool.token0, pool.token1].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))
              : <option value="">Select pool first</option>;
          })()}
        </select>

        <label className="lp-label">Amount</label>
        <input
          className="lp-input"
          type="text"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <div className="lp-range-row">
          <div>
            <label className="lp-label">Tick Lower</label>
            <input
              className="lp-input lp-input-half"
              type="text"
              value={tickLower}
              onChange={(e) => setTickLower(e.target.value)}
            />
          </div>
          <div>
            <label className="lp-label">Tick Upper</label>
            <input
              className="lp-input lp-input-half"
              type="text"
              value={tickUpper}
              onChange={(e) => setTickUpper(e.target.value)}
            />
          </div>
        </div>

        <button
          className="lp-button"
          onClick={handleAdd}
          disabled={submitting || !selectedPool || !amount}
        >
          {submitting ? "Adding..." : "Add Liquidity"}
        </button>

        {message && <div className="lp-message">{message}</div>}
      </div>

      {/* Existing positions */}
      <div className="lp-positions">
        <h3 className="lp-section-title">Your Positions</h3>
        {loading ? (
          <div className="page-loading">Loading positions...</div>
        ) : positions.length === 0 ? (
          <div className="page-empty">No active positions</div>
        ) : (
          <div className="page-table-wrap">
            <table className="page-table">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Token</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id}>
                    <td className="page-link">{p.id}</td>
                    <td>{p.token}</td>
                    <td>{p.amount}</td>
                    <td>{new Date(p.created_at * 1000).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="lp-remove-btn"
                        onClick={() => handleRemove(p.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
