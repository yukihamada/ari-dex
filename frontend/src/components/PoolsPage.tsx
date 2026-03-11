import { useEffect, useState } from "react";
import { API_URL } from "../config";

interface Pool {
  address: string;
  token0: string;
  token0_address: string;
  token1: string;
  token1_address: string;
  fee_tier: number;
  liquidity: string;
  volume_usd_24h: string;
  tvl_usd: string;
}

export function PoolsPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/v1/pools`)
      .then((r) => r.json())
      .then((d) => { setPools(d.pools || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="page-panel">
      <h2 className="page-title">Liquidity Pools</h2>
      <p className="page-sub">Live Uniswap V3 pools routed by ARI solvers</p>

      {loading ? (
        <div className="page-loading">Loading pools...</div>
      ) : pools.length === 0 ? (
        <div className="page-empty">No pools available</div>
      ) : (
        <div className="page-table-wrap">
          <table className="page-table">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Fee Tier</th>
                <th>TVL</th>
                <th>Volume (24h)</th>
                <th>Contract</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((p) => (
                <tr key={p.address}>
                  <td className="page-pair">
                    <span className="page-pair-token">{p.token0}</span>
                    <span className="page-pair-sep">/</span>
                    <span className="page-pair-token">{p.token1}</span>
                  </td>
                  <td>{(p.fee_tier / 10000).toFixed(2)}%</td>
                  <td>{formatUsd(p.tvl_usd)}</td>
                  <td>{formatUsd(p.volume_usd_24h)}</td>
                  <td>
                    <a
                      href={`https://etherscan.io/address/${p.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="page-link"
                    >
                      {p.address.slice(0, 8)}...{p.address.slice(-4)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatUsd(raw: string): string {
  const n = parseFloat(raw);
  if (isNaN(n) || n === 0) return "$0";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
