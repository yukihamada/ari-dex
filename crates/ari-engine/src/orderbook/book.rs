//! Core order book data structure with price-time priority matching.

use std::collections::BTreeMap;

use ari_core::{LimitOrder, OrderSide, TokenPair};

/// A price-time priority order book for a single token pair.
#[derive(Debug, Clone)]
pub struct OrderBook {
    /// The token pair this book covers.
    pub pair: TokenPair,
    /// Buy orders indexed by price (descending).
    bids: BTreeMap<u128, Vec<LimitOrder>>,
    /// Sell orders indexed by price (ascending).
    asks: BTreeMap<u128, Vec<LimitOrder>>,
    /// Next order ID.
    next_id: u64,
}

impl OrderBook {
    /// Creates a new empty order book for the given token pair.
    pub fn new(pair: TokenPair) -> Self {
        Self {
            pair,
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
            next_id: 1,
        }
    }

    /// Adds a limit order to the book.
    ///
    /// Returns the assigned order ID.
    pub fn add_order(&mut self, mut order: LimitOrder) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        order.id = id;

        match order.side {
            OrderSide::Buy => {
                self.bids.entry(order.price).or_default().push(order);
            }
            OrderSide::Sell => {
                self.asks.entry(order.price).or_default().push(order);
            }
        }

        id
    }

    /// Cancels an order by its ID.
    ///
    /// Returns the cancelled order if found.
    pub fn cancel_order(&mut self, order_id: u64) -> Option<LimitOrder> {
        for orders in self.bids.values_mut() {
            if let Some(pos) = orders.iter().position(|o| o.id == order_id) {
                return Some(orders.remove(pos));
            }
        }
        for orders in self.asks.values_mut() {
            if let Some(pos) = orders.iter().position(|o| o.id == order_id) {
                return Some(orders.remove(pos));
            }
        }
        None
    }

    /// Matches crossing orders using price-time priority.
    ///
    /// Best bid (highest buy) crosses best ask (lowest sell) when bid >= ask.
    /// Within each price level, orders are matched FIFO (time priority).
    ///
    /// Returns a list of (buy_order_id, sell_order_id, matched_quantity) tuples.
    pub fn match_orders(&mut self) -> Vec<(u64, u64, [u8; 32])> {
        let mut fills = Vec::new();

        loop {
            // Get best bid (highest price) and best ask (lowest price)
            let best_bid_price = match self.bids.keys().next_back().copied() {
                Some(p) => p,
                None => break,
            };
            let best_ask_price = match self.asks.keys().next().copied() {
                Some(p) => p,
                None => break,
            };

            // No crossing — stop
            if best_bid_price < best_ask_price {
                break;
            }

            // Get the first order at each price level (FIFO / time priority)
            let bid_orders = self.bids.get_mut(&best_bid_price).unwrap();
            let ask_orders = self.asks.get_mut(&best_ask_price).unwrap();

            let bid = &mut bid_orders[0];
            let ask = &mut ask_orders[0];

            // Compute matched quantity = min(bid.remaining, ask.remaining)
            let matched_qty = min_u256(&bid.remaining, &ask.remaining);

            // Record fill
            fills.push((bid.id, ask.id, matched_qty));

            // Subtract matched quantity from both orders
            bid.remaining = sub_u256(&bid.remaining, &matched_qty);
            ask.remaining = sub_u256(&ask.remaining, &matched_qty);

            // Remove fully filled orders
            let bid_filled = is_zero(&bid.remaining);
            let ask_filled = is_zero(&ask.remaining);

            if bid_filled {
                bid_orders.remove(0);
                if bid_orders.is_empty() {
                    self.bids.remove(&best_bid_price);
                }
            }

            if ask_filled {
                ask_orders.remove(0);
                if ask_orders.is_empty() {
                    self.asks.remove(&best_ask_price);
                }
            }
        }

        fills
    }

    /// Returns the best bid price, if any.
    pub fn best_bid(&self) -> Option<u128> {
        self.bids.keys().next_back().copied()
    }

    /// Returns the best ask price, if any.
    pub fn best_ask(&self) -> Option<u128> {
        self.asks.keys().next().copied()
    }

    /// Returns the number of open orders.
    pub fn order_count(&self) -> usize {
        self.bids.values().map(|v| v.len()).sum::<usize>()
            + self.asks.values().map(|v| v.len()).sum::<usize>()
    }
}

// ---------------------------------------------------------------------------
// U256 helpers (big-endian [u8; 32])
// ---------------------------------------------------------------------------

fn is_zero(a: &[u8; 32]) -> bool {
    a.iter().all(|&b| b == 0)
}

fn min_u256(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    // Compare big-endian: first differing byte determines order
    for i in 0..32 {
        if a[i] < b[i] {
            return *a;
        }
        if a[i] > b[i] {
            return *b;
        }
    }
    *a // equal
}

fn sub_u256(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let mut result = [0u8; 32];
    let mut borrow: u16 = 0;
    for i in (0..32).rev() {
        let diff = (a[i] as u16).wrapping_sub(b[i] as u16).wrapping_sub(borrow);
        result[i] = diff as u8;
        borrow = if diff > 255 { 1 } else { 0 };
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use ari_core::chain::ChainId;
    use ari_core::Token;

    fn test_pair() -> TokenPair {
        TokenPair {
            base: Token { chain: ChainId::Ethereum, address: [0u8; 20], symbol: "ETH".into(), decimals: 18 },
            quote: Token { chain: ChainId::Ethereum, address: [1u8; 20], symbol: "USDC".into(), decimals: 6 },
        }
    }

    fn make_order(side: OrderSide, price: u128, qty: u64) -> LimitOrder {
        let mut quantity = [0u8; 32];
        quantity[24..32].copy_from_slice(&qty.to_be_bytes());
        LimitOrder {
            id: 0,
            owner: [0u8; 20],
            pair: test_pair(),
            side,
            price,
            quantity,
            remaining: quantity,
            timestamp: 0,
        }
    }

    #[test]
    fn test_no_crossing() {
        let mut book = OrderBook::new(test_pair());
        book.add_order(make_order(OrderSide::Buy, 100, 10));
        book.add_order(make_order(OrderSide::Sell, 200, 10));
        let fills = book.match_orders();
        assert!(fills.is_empty());
    }

    #[test]
    fn test_exact_crossing() {
        let mut book = OrderBook::new(test_pair());
        book.add_order(make_order(OrderSide::Buy, 200, 10));
        book.add_order(make_order(OrderSide::Sell, 100, 10));
        let fills = book.match_orders();
        assert_eq!(fills.len(), 1);
        assert_eq!(book.order_count(), 0);
    }

    #[test]
    fn test_partial_fill() {
        let mut book = OrderBook::new(test_pair());
        book.add_order(make_order(OrderSide::Buy, 200, 20));
        book.add_order(make_order(OrderSide::Sell, 100, 10));
        let fills = book.match_orders();
        assert_eq!(fills.len(), 1);
        assert_eq!(book.order_count(), 1);
    }

    #[test]
    fn test_time_priority() {
        let mut book = OrderBook::new(test_pair());
        let id1 = book.add_order(make_order(OrderSide::Sell, 100, 5));
        let _id2 = book.add_order(make_order(OrderSide::Sell, 100, 5));
        book.add_order(make_order(OrderSide::Buy, 100, 5));
        let fills = book.match_orders();
        assert_eq!(fills.len(), 1);
        assert_eq!(fills[0].1, id1);
    }
}
