//! SQLite persistence layer for intents.

use rusqlite::{params, Connection, Result};

use crate::app::StoredIntent;

/// Initialize the database, creating tables if they don't exist.
pub fn init_db(path: &str) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS intents (
            id          TEXT PRIMARY KEY,
            sender      TEXT NOT NULL,
            sell_token  TEXT NOT NULL,
            buy_token   TEXT NOT NULL,
            sell_amount TEXT NOT NULL,
            min_buy_amount TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'pending',
            referral_code TEXT,
            created_at  INTEGER NOT NULL
        );",
    )?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS rfqs (
            id TEXT PRIMARY KEY,
            requester TEXT NOT NULL,
            sell_token TEXT NOT NULL,
            buy_token TEXT NOT NULL,
            sell_amount TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            best_quote TEXT,
            best_quoter TEXT,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS rfq_quotes (
            id TEXT PRIMARY KEY,
            rfq_id TEXT NOT NULL,
            quoter TEXT NOT NULL,
            buy_amount TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS referrals (
            code TEXT PRIMARY KEY,
            owner TEXT NOT NULL,
            referred_count INTEGER DEFAULT 0,
            total_volume TEXT DEFAULT '0',
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS yield_positions (
            id TEXT PRIMARY KEY,
            owner TEXT NOT NULL,
            strategy_id TEXT NOT NULL,
            token TEXT NOT NULL,
            amount TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );",
    )?;

    // Social trading tables
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS follows (
            follower TEXT NOT NULL,
            trader TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            PRIMARY KEY (follower, trader)
        );
        CREATE TABLE IF NOT EXISTS copy_trades (
            id TEXT PRIMARY KEY,
            copier TEXT NOT NULL,
            trader TEXT NOT NULL,
            max_amount TEXT NOT NULL,
            active INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS trader_stats (
            address TEXT PRIMARY KEY,
            total_pnl TEXT DEFAULT '0',
            win_rate REAL DEFAULT 0.0,
            trade_count INTEGER DEFAULT 0,
            volume TEXT DEFAULT '0'
        );",
    )?;

    // Solver marketplace tables
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS solvers (
            id TEXT PRIMARY KEY,
            address TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            fill_rate REAL DEFAULT 0.0,
            avg_improvement REAL DEFAULT 0.0,
            total_volume TEXT DEFAULT '0',
            total_fills INTEGER DEFAULT 0,
            score REAL DEFAULT 50.0,
            active INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS solver_fills (
            id TEXT PRIMARY KEY,
            solver_id TEXT NOT NULL,
            intent_id TEXT NOT NULL,
            price_improvement REAL DEFAULT 0.0,
            amount TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );",
    )?;

    Ok(conn)
}

/// Insert a new intent into the database.
pub fn insert_intent(conn: &Connection, intent: &StoredIntent, referral_code: Option<&str>) -> Result<()> {
    conn.execute(
        "INSERT INTO intents (id, sender, sell_token, buy_token, sell_amount, min_buy_amount, status, referral_code, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            intent.intent_id,
            intent.sender,
            intent.sell_token,
            intent.buy_token,
            intent.sell_amount,
            intent.min_buy_amount,
            intent.status,
            referral_code,
            intent.created_at,
        ],
    )?;
    Ok(())
}

/// Get a single intent by ID.
pub fn get_intent(conn: &Connection, id: &str) -> Result<Option<StoredIntent>> {
    let mut stmt = conn.prepare(
        "SELECT id, sender, sell_token, buy_token, sell_amount, min_buy_amount, status, created_at
         FROM intents WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], row_to_intent)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

/// List all intents, ordered by creation time descending.
pub fn list_intents(conn: &Connection, limit: usize) -> Result<Vec<StoredIntent>> {
    let mut stmt = conn.prepare(
        "SELECT id, sender, sell_token, buy_token, sell_amount, min_buy_amount, status, created_at
         FROM intents ORDER BY created_at DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit as i64], row_to_intent)?;
    rows.collect()
}

/// Update the status of an intent.
pub fn update_intent_status(conn: &Connection, id: &str, status: &str) -> Result<bool> {
    let changed = conn.execute(
        "UPDATE intents SET status = ?1 WHERE id = ?2",
        params![status, id],
    )?;
    Ok(changed > 0)
}

/// List intents for a specific sender address, optionally filtered by status.
pub fn list_intents_by_sender(
    conn: &Connection,
    sender: &str,
    status_filter: Option<&str>,
) -> Result<Vec<StoredIntent>> {
    match status_filter {
        Some(status) => {
            let mut stmt = conn.prepare(
                "SELECT id, sender, sell_token, buy_token, sell_amount, min_buy_amount, status, created_at
                 FROM intents WHERE sender = ?1 AND status = ?2 ORDER BY created_at DESC",
            )?;
            let rows = stmt.query_map(params![sender, status], row_to_intent)?;
            rows.collect()
        }
        None => {
            let mut stmt = conn.prepare(
                "SELECT id, sender, sell_token, buy_token, sell_amount, min_buy_amount, status, created_at
                 FROM intents WHERE sender = ?1 ORDER BY created_at DESC",
            )?;
            let rows = stmt.query_map(params![sender], row_to_intent)?;
            rows.collect()
        }
    }
}

// ---------------------------------------------------------------------------
// Yield positions
// ---------------------------------------------------------------------------

/// Insert a new yield position.
pub fn insert_yield_position(
    conn: &Connection,
    id: &str,
    owner: &str,
    strategy_id: &str,
    token: &str,
    amount: &str,
    created_at: u64,
) -> Result<()> {
    conn.execute(
        "INSERT INTO yield_positions (id, owner, strategy_id, token, amount, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, owner, strategy_id, token, amount, created_at],
    )?;
    Ok(())
}

/// List yield positions for a given owner.
pub fn list_yield_positions(
    conn: &Connection,
    owner: &str,
) -> Result<Vec<(String, String, String, String, String, u64)>> {
    let mut stmt = conn.prepare(
        "SELECT id, owner, strategy_id, token, amount, created_at
         FROM yield_positions WHERE owner = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![owner], |row| {
        Ok((
            row.get(0)?,
            row.get(1)?,
            row.get(2)?,
            row.get(3)?,
            row.get(4)?,
            row.get(5)?,
        ))
    })?;
    rows.collect()
}

/// Record a trader's stats update (upsert).
pub fn update_trader_stats(
    conn: &Connection,
    address: &str,
    pnl_delta: &str,
    volume_delta: &str,
    is_win: bool,
) -> Result<()> {
    // Upsert: insert if not exists, update if exists
    conn.execute(
        "INSERT INTO trader_stats (address, total_pnl, win_rate, trade_count, volume)
         VALUES (?1, ?2, CASE WHEN ?3 THEN 1.0 ELSE 0.0 END, 1, ?4)
         ON CONFLICT(address) DO UPDATE SET
           total_pnl = CAST(CAST(total_pnl AS REAL) + CAST(?2 AS REAL) AS TEXT),
           trade_count = trade_count + 1,
           win_rate = (win_rate * (trade_count - 1) + CASE WHEN ?3 THEN 1.0 ELSE 0.0 END) / trade_count,
           volume = CAST(CAST(volume AS REAL) + CAST(?4 AS REAL) AS TEXT)",
        params![address, pnl_delta, is_win, volume_delta],
    )?;
    Ok(())
}

fn row_to_intent(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredIntent> {
    Ok(StoredIntent {
        intent_id: row.get(0)?,
        sender: row.get(1)?,
        sell_token: row.get(2)?,
        buy_token: row.get(3)?,
        sell_amount: row.get(4)?,
        min_buy_amount: row.get(5)?,
        status: row.get(6)?,
        created_at: row.get(7)?,
    })
}
