//! Orderbook Implementation
//!
//! High-performance orderbook for prediction markets with lock-free concurrent access.

use super::types::*;
use crate::models::market::ShareType;
use dashmap::DashMap;
use parking_lot::RwLock;
use rust_decimal::Decimal;
use std::collections::{BTreeMap, VecDeque};
use std::sync::atomic::{AtomicI64, Ordering as AtomicOrdering};
use uuid::Uuid;

/// A single orderbook for a specific market outcome (Yes or No shares)
pub struct Orderbook {
    /// Market ID
    pub market_id: Uuid,

    /// Outcome ID
    pub outcome_id: Uuid,

    /// Share type (Yes/No)
    pub share_type: ShareType,

    /// Bids sorted by price descending (highest first)
    /// Using RwLock for price level operations
    bids: RwLock<BTreeMap<PriceLevel, VecDeque<OrderEntry>>>,

    /// Asks sorted by price ascending (lowest first)
    asks: RwLock<BTreeMap<PriceLevel, VecDeque<OrderEntry>>>,

    /// Order ID to (side, price_level) mapping for O(1) cancellation
    order_index: DashMap<Uuid, (Side, PriceLevel)>,

    /// Last trade price
    last_trade_price: AtomicI64,

    /// Order count
    order_count: AtomicI64,
}

impl Orderbook {
    /// Create a new orderbook for a market outcome
    /// Accepts either a market_key string (format: market_id:outcome_id:share_type)
    /// or uses provided values directly
    pub fn new(market_key: String) -> Self {
        // Parse market_key to extract components
        let (market_id, outcome_id, share_type) = Self::parse_market_key(&market_key)
            .unwrap_or((Uuid::nil(), Uuid::nil(), ShareType::Yes));

        Self {
            market_id,
            outcome_id,
            share_type,
            bids: RwLock::new(BTreeMap::new()),
            asks: RwLock::new(BTreeMap::new()),
            order_index: DashMap::new(),
            last_trade_price: AtomicI64::new(0),
            order_count: AtomicI64::new(0),
        }
    }

    /// Parse market_key into components
    fn parse_market_key(market_key: &str) -> Option<(Uuid, Uuid, ShareType)> {
        let parts: Vec<&str> = market_key.split(':').collect();
        if parts.len() != 3 {
            // For legacy symbol format (e.g., "BTCUSDT"), return nil UUIDs
            return None;
        }
        let market_id = Uuid::parse_str(parts[0]).ok()?;
        let outcome_id = Uuid::parse_str(parts[1]).ok()?;
        let share_type: ShareType = parts[2].parse().ok()?;
        Some((market_id, outcome_id, share_type))
    }

    /// Get the market ID
    pub fn market_id(&self) -> Uuid {
        self.market_id
    }

    /// Get the outcome ID
    pub fn outcome_id(&self) -> Uuid {
        self.outcome_id
    }

    /// Get the share type
    pub fn share_type(&self) -> ShareType {
        self.share_type
    }

    /// Get total order count
    pub fn order_count(&self) -> i64 {
        self.order_count.load(AtomicOrdering::Relaxed)
    }

    /// Get last trade price
    pub fn last_trade_price(&self) -> Option<Decimal> {
        let raw = self.last_trade_price.load(AtomicOrdering::Relaxed);
        if raw == 0 {
            None
        } else {
            Some(Decimal::from(raw) / Decimal::from(100_000_000))
        }
    }

    /// Set last trade price
    pub fn set_last_trade_price(&self, price: Decimal) {
        let level = PriceLevel::from_decimal(price);
        self.last_trade_price.store(level.raw(), AtomicOrdering::Relaxed);
    }

    /// Get best bid price
    pub fn best_bid(&self) -> Option<Decimal> {
        let bids = self.bids.read();
        bids.keys().next_back().map(|p| p.to_decimal())
    }

    /// Get best ask price
    pub fn best_ask(&self) -> Option<Decimal> {
        let asks = self.asks.read();
        asks.keys().next().map(|p| p.to_decimal())
    }

    /// Get spread
    pub fn spread(&self) -> Option<Decimal> {
        match (self.best_bid(), self.best_ask()) {
            (Some(bid), Some(ask)) => Some(ask - bid),
            _ => None,
        }
    }

    /// Validate price is within valid range for prediction markets (0 < price < 1)
    fn validate_price(&self, price: Decimal) -> Result<(), MatchingError> {
        if price <= Decimal::ZERO || price >= Decimal::ONE {
            return Err(MatchingError::InvalidPrice(format!(
                "Price {} must be between 0 and 1 (exclusive)",
                price
            )));
        }
        Ok(())
    }

    /// Add an order to the orderbook
    pub fn add_order(&self, entry: OrderEntry) -> Result<(), MatchingError> {
        // Validate price
        self.validate_price(entry.price)?;

        // Note: Market/outcome validation is done at the engine level when looking up orderbook
        // The orderbook is already specific to a market:outcome:share_type combination

        let price_level = PriceLevel::from_decimal(entry.price);
        let side = entry.side;
        let order_id = entry.id;

        // Add to appropriate book
        match side {
            Side::Buy => {
                let mut bids = self.bids.write();
                bids.entry(price_level)
                    .or_insert_with(VecDeque::new)
                    .push_back(entry);
            }
            Side::Sell => {
                let mut asks = self.asks.write();
                asks.entry(price_level)
                    .or_insert_with(VecDeque::new)
                    .push_back(entry);
            }
        }

        // Add to index
        self.order_index.insert(order_id, (side, price_level));
        self.order_count.fetch_add(1, AtomicOrdering::Relaxed);

        Ok(())
    }

    /// Cancel an order by ID
    pub fn cancel_order(&self, order_id: Uuid) -> Option<OrderEntry> {
        // Find and remove from index
        let (side, price_level) = self.order_index.remove(&order_id)?.1;

        // Remove from book
        let entry = match side {
            Side::Buy => {
                let mut bids = self.bids.write();
                if let Some(queue) = bids.get_mut(&price_level) {
                    let pos = queue.iter().position(|o| o.id == order_id);
                    if let Some(pos) = pos {
                        let entry = queue.remove(pos);
                        if queue.is_empty() {
                            bids.remove(&price_level);
                        }
                        entry
                    } else {
                        None
                    }
                } else {
                    None
                }
            }
            Side::Sell => {
                let mut asks = self.asks.write();
                if let Some(queue) = asks.get_mut(&price_level) {
                    let pos = queue.iter().position(|o| o.id == order_id);
                    if let Some(pos) = pos {
                        let entry = queue.remove(pos);
                        if queue.is_empty() {
                            asks.remove(&price_level);
                        }
                        entry
                    } else {
                        None
                    }
                } else {
                    None
                }
            }
        };

        if entry.is_some() {
            self.order_count.fetch_sub(1, AtomicOrdering::Relaxed);
        }

        entry
    }

    /// Match an incoming order against the orderbook (Normal matching)
    /// Returns (trades, remaining_amount)
    ///
    /// Normal matching: Same share type, opposite sides
    /// - Buy order matches against Sell orders
    /// - Sell order matches against Buy orders
    pub fn match_order(
        &self,
        taker_order_id: Uuid,
        taker_address: &str,
        side: Side,
        mut amount: Decimal,
        limit_price: Option<Decimal>,
        fee_config: &FeeConfig,
    ) -> (Vec<TradeExecution>, Decimal) {
        let mut trades = Vec::new();
        let now = chrono::Utc::now().timestamp_millis();

        match side {
            Side::Buy => {
                // Match against asks (lowest first)
                let mut asks = self.asks.write();
                let price_levels: Vec<PriceLevel> = asks.keys().cloned().collect();

                for price_level in price_levels {
                    if amount <= Decimal::ZERO {
                        break;
                    }

                    let level_price = price_level.to_decimal();

                    // Check price limit for limit orders
                    if let Some(limit) = limit_price {
                        if level_price > limit {
                            break;
                        }
                    }

                    if let Some(queue) = asks.get_mut(&price_level) {
                        while let Some(maker) = queue.front_mut() {
                            if amount <= Decimal::ZERO {
                                break;
                            }

                            let trade_amount = amount.min(maker.remaining_amount);
                            let trade_price = maker.price;

                            // Calculate symmetric fees for prediction market
                            let maker_fee = fee_config.calculate_maker_fee(trade_price, trade_amount);
                            let taker_fee = fee_config.calculate_taker_fee(trade_price, trade_amount);

                            let trade = TradeExecution {
                                trade_id: Uuid::new_v4(),
                                market_id: self.market_id,
                                outcome_id: self.outcome_id,
                                share_type: self.share_type,
                                match_type: MatchType::Normal,
                                maker_order_id: maker.id,
                                taker_order_id,
                                maker_address: maker.user_address.clone(),
                                price: trade_price,
                                amount: trade_amount,
                                maker_fee,
                                taker_fee,
                                timestamp: now,
                            };

                            trades.push(trade);
                            amount -= trade_amount;
                            maker.remaining_amount -= trade_amount;

                            // Update last trade price
                            self.set_last_trade_price(trade_price);

                            // Remove fully filled maker order
                            if maker.remaining_amount <= Decimal::ZERO {
                                let maker_id = maker.id;
                                queue.pop_front();
                                self.order_index.remove(&maker_id);
                                self.order_count.fetch_sub(1, AtomicOrdering::Relaxed);
                            }
                        }

                        if queue.is_empty() {
                            asks.remove(&price_level);
                        }
                    }
                }
            }
            Side::Sell => {
                // Match against bids (highest first)
                let mut bids = self.bids.write();
                let price_levels: Vec<PriceLevel> = bids.keys().rev().cloned().collect();

                for price_level in price_levels {
                    if amount <= Decimal::ZERO {
                        break;
                    }

                    let level_price = price_level.to_decimal();

                    // Check price limit for limit orders
                    if let Some(limit) = limit_price {
                        if level_price < limit {
                            break;
                        }
                    }

                    if let Some(queue) = bids.get_mut(&price_level) {
                        while let Some(maker) = queue.front_mut() {
                            if amount <= Decimal::ZERO {
                                break;
                            }

                            let trade_amount = amount.min(maker.remaining_amount);
                            let trade_price = maker.price;

                            // Calculate symmetric fees for prediction market
                            let maker_fee = fee_config.calculate_maker_fee(trade_price, trade_amount);
                            let taker_fee = fee_config.calculate_taker_fee(trade_price, trade_amount);

                            let trade = TradeExecution {
                                trade_id: Uuid::new_v4(),
                                market_id: self.market_id,
                                outcome_id: self.outcome_id,
                                share_type: self.share_type,
                                match_type: MatchType::Normal,
                                maker_order_id: maker.id,
                                taker_order_id,
                                maker_address: maker.user_address.clone(),
                                price: trade_price,
                                amount: trade_amount,
                                maker_fee,
                                taker_fee,
                                timestamp: now,
                            };

                            trades.push(trade);
                            amount -= trade_amount;
                            maker.remaining_amount -= trade_amount;

                            // Update last trade price
                            self.set_last_trade_price(trade_price);

                            // Remove fully filled maker order
                            if maker.remaining_amount <= Decimal::ZERO {
                                let maker_id = maker.id;
                                queue.pop_front();
                                self.order_index.remove(&maker_id);
                                self.order_count.fetch_sub(1, AtomicOrdering::Relaxed);
                            }
                        }

                        if queue.is_empty() {
                            bids.remove(&price_level);
                        }
                    }
                }
            }
        }

        (trades, amount)
    }

    /// Get orderbook snapshot
    pub fn snapshot(&self, depth: usize) -> OrderbookSnapshot {
        let mut bids_vec: Vec<[String; 2]> = Vec::new();
        let mut asks_vec: Vec<[String; 2]> = Vec::new();

        // Get bids (highest first)
        {
            let bids = self.bids.read();
            for (price_level, orders) in bids.iter().rev().take(depth) {
                let total: Decimal = orders.iter().map(|o| o.remaining_amount).sum();
                bids_vec.push([price_level.to_decimal().to_string(), total.to_string()]);
            }
        }

        // Get asks (lowest first)
        {
            let asks = self.asks.read();
            for (price_level, orders) in asks.iter().take(depth) {
                let total: Decimal = orders.iter().map(|o| o.remaining_amount).sum();
                asks_vec.push([price_level.to_decimal().to_string(), total.to_string()]);
            }
        }

        OrderbookSnapshot {
            symbol: format!("{}:{}:{}", self.market_id, self.outcome_id, self.share_type),
            bids: bids_vec,
            asks: asks_vec,
            last_price: self.last_trade_price(),
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }

    /// Get bid depth (total bids volume)
    pub fn bid_depth(&self) -> Decimal {
        let bids = self.bids.read();
        bids.values()
            .flat_map(|q| q.iter())
            .map(|o| o.remaining_amount)
            .sum()
    }

    /// Get ask depth (total asks volume)
    pub fn ask_depth(&self) -> Decimal {
        let asks = self.asks.read();
        asks.values()
            .flat_map(|q| q.iter())
            .map(|o| o.remaining_amount)
            .sum()
    }

    /// Check if an order exists
    pub fn has_order(&self, order_id: &Uuid) -> bool {
        self.order_index.contains_key(order_id)
    }

    /// Get order by ID
    pub fn get_order(&self, order_id: &Uuid) -> Option<OrderEntry> {
        let (side, price_level) = self.order_index.get(order_id)?.clone();

        match side {
            Side::Buy => {
                let bids = self.bids.read();
                bids.get(&price_level)?
                    .iter()
                    .find(|o| o.id == *order_id)
                    .cloned()
            }
            Side::Sell => {
                let asks = self.asks.read();
                asks.get(&price_level)?
                    .iter()
                    .find(|o| o.id == *order_id)
                    .cloned()
            }
        }
    }

    /// Get all buy orders at a specific price level
    pub fn get_bids_at_price(&self, price: Decimal) -> Vec<OrderEntry> {
        let price_level = PriceLevel::from_decimal(price);
        let bids = self.bids.read();
        bids.get(&price_level)
            .map(|q| q.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Get all sell orders at a specific price level
    pub fn get_asks_at_price(&self, price: Decimal) -> Vec<OrderEntry> {
        let price_level = PriceLevel::from_decimal(price);
        let asks = self.asks.read();
        asks.get(&price_level)
            .map(|q| q.iter().cloned().collect())
            .unwrap_or_default()
    }

    // ========================================================================
    // Mint/Merge Matching Support
    // ========================================================================

    /// Get buy orders with price >= min_price for Mint matching
    ///
    /// Returns orders sorted by price descending (best price first)
    /// Used when matching against complement orderbook's buy orders
    pub fn get_matching_buy_orders(&self, min_price: Decimal) -> Vec<OrderEntry> {
        let min_level = PriceLevel::from_decimal(min_price);
        let bids = self.bids.read();

        let mut orders = Vec::new();
        // Iterate from highest to lowest price
        for (price_level, queue) in bids.iter().rev() {
            if *price_level >= min_level {
                for order in queue.iter() {
                    orders.push(order.clone());
                }
            } else {
                // Since we're iterating in descending order, we can break early
                break;
            }
        }

        orders
    }

    /// Get sell orders with price <= max_price for Merge matching
    ///
    /// Returns orders sorted by price ascending (best price first)
    /// Used when matching against complement orderbook's sell orders
    pub fn get_matching_sell_orders(&self, max_price: Decimal) -> Vec<OrderEntry> {
        let max_level = PriceLevel::from_decimal(max_price);
        let asks = self.asks.read();

        let mut orders = Vec::new();
        // Iterate from lowest to highest price
        for (price_level, queue) in asks.iter() {
            if *price_level <= max_level {
                for order in queue.iter() {
                    orders.push(order.clone());
                }
            } else {
                // Since we're iterating in ascending order, we can break early
                break;
            }
        }

        orders
    }

    /// Fill an order by a specific amount
    ///
    /// Used by Mint/Merge matching to update maker orders in the complement orderbook
    pub fn fill_order(&self, order_id: Uuid, fill_amount: Decimal) -> bool {
        // Find the order in index
        let entry = match self.order_index.get(&order_id) {
            Some(e) => e.clone(),
            None => return false,
        };

        let (side, price_level) = entry;

        match side {
            Side::Buy => {
                let mut bids = self.bids.write();
                if let Some(queue) = bids.get_mut(&price_level) {
                    for order in queue.iter_mut() {
                        if order.id == order_id {
                            order.remaining_amount -= fill_amount;

                            // Remove if fully filled
                            if order.remaining_amount <= Decimal::ZERO {
                                let pos = queue.iter().position(|o| o.id == order_id);
                                if let Some(pos) = pos {
                                    queue.remove(pos);
                                }
                                self.order_index.remove(&order_id);
                                self.order_count.fetch_sub(1, AtomicOrdering::Relaxed);

                                if queue.is_empty() {
                                    bids.remove(&price_level);
                                }
                            }
                            return true;
                        }
                    }
                }
            }
            Side::Sell => {
                let mut asks = self.asks.write();
                if let Some(queue) = asks.get_mut(&price_level) {
                    for order in queue.iter_mut() {
                        if order.id == order_id {
                            order.remaining_amount -= fill_amount;

                            // Remove if fully filled
                            if order.remaining_amount <= Decimal::ZERO {
                                let pos = queue.iter().position(|o| o.id == order_id);
                                if let Some(pos) = pos {
                                    queue.remove(pos);
                                }
                                self.order_index.remove(&order_id);
                                self.order_count.fetch_sub(1, AtomicOrdering::Relaxed);

                                if queue.is_empty() {
                                    asks.remove(&price_level);
                                }
                            }
                            return true;
                        }
                    }
                }
            }
        }

        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    fn create_market_key() -> (String, Uuid, Uuid) {
        let market_id = Uuid::new_v4();
        let outcome_id = Uuid::new_v4();
        let market_key = format!("{}:{}:yes", market_id, outcome_id);
        (market_key, market_id, outcome_id)
    }

    fn create_test_order(
        id: Uuid,
        price: Decimal,
        amount: Decimal,
        side: Side,
    ) -> OrderEntry {
        OrderEntry {
            id,
            user_address: "0x1234".to_string(),
            price,
            original_amount: amount,
            remaining_amount: amount,
            side,
            time_in_force: TimeInForce::GTC,
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }

    #[test]
    fn test_price_validation() {
        let (market_key, _, _) = create_market_key();
        let book = Orderbook::new(market_key);

        // Valid price
        let valid_order = create_test_order(
            Uuid::new_v4(),
            dec!(0.65),
            dec!(100),
            Side::Buy,
        );
        assert!(book.add_order(valid_order).is_ok());

        // Invalid price (0)
        let invalid_order = create_test_order(
            Uuid::new_v4(),
            dec!(0),
            dec!(100),
            Side::Buy,
        );
        assert!(book.add_order(invalid_order).is_err());

        // Invalid price (1)
        let invalid_order = create_test_order(
            Uuid::new_v4(),
            dec!(1),
            dec!(100),
            Side::Buy,
        );
        assert!(book.add_order(invalid_order).is_err());

        // Invalid price (> 1)
        let invalid_order = create_test_order(
            Uuid::new_v4(),
            dec!(1.5),
            dec!(100),
            Side::Buy,
        );
        assert!(book.add_order(invalid_order).is_err());
    }

    #[test]
    fn test_add_and_cancel_order() {
        let (market_key, _, _) = create_market_key();
        let book = Orderbook::new(market_key);
        let order_id = Uuid::new_v4();
        let order = create_test_order(
            order_id,
            dec!(0.65),
            dec!(100),
            Side::Buy,
        );

        book.add_order(order).unwrap();
        assert_eq!(book.order_count(), 1);
        assert!(book.has_order(&order_id));

        let cancelled = book.cancel_order(order_id);
        assert!(cancelled.is_some());
        assert_eq!(book.order_count(), 0);
        assert!(!book.has_order(&order_id));
    }

    #[test]
    fn test_best_bid_ask() {
        let (market_key, _, _) = create_market_key();
        let book = Orderbook::new(market_key);

        // Add bids
        book.add_order(create_test_order(
            Uuid::new_v4(),
            dec!(0.60),
            dec!(100),
            Side::Buy,
        ))
        .unwrap();
        book.add_order(create_test_order(
            Uuid::new_v4(),
            dec!(0.65),
            dec!(100),
            Side::Buy,
        ))
        .unwrap();

        // Add asks
        book.add_order(create_test_order(
            Uuid::new_v4(),
            dec!(0.70),
            dec!(100),
            Side::Sell,
        ))
        .unwrap();
        book.add_order(create_test_order(
            Uuid::new_v4(),
            dec!(0.75),
            dec!(100),
            Side::Sell,
        ))
        .unwrap();

        assert_eq!(book.best_bid(), Some(dec!(0.65)));
        assert_eq!(book.best_ask(), Some(dec!(0.70)));
        assert_eq!(book.spread(), Some(dec!(0.05)));
    }

    #[test]
    fn test_match_buy_order() {
        let (market_key, _, _) = create_market_key();
        let book = Orderbook::new(market_key);
        let fee_config = FeeConfig::default();

        // Add sell orders (asks)
        let ask1_id = Uuid::new_v4();
        book.add_order(create_test_order(
            ask1_id,
            dec!(0.60),
            dec!(100),
            Side::Sell,
        ))
        .unwrap();

        let ask2_id = Uuid::new_v4();
        book.add_order(create_test_order(
            ask2_id,
            dec!(0.65),
            dec!(200),
            Side::Sell,
        ))
        .unwrap();

        // Match a buy order
        let taker_id = Uuid::new_v4();
        let (trades, remaining) = book.match_order(
            taker_id,
            "0x5678",
            Side::Buy,
            dec!(150),
            Some(dec!(0.65)),
            &fee_config,
        );

        assert_eq!(trades.len(), 2);
        assert_eq!(remaining, dec!(0));

        // First trade should be at 0.60
        assert_eq!(trades[0].price, dec!(0.60));
        assert_eq!(trades[0].amount, dec!(100));
        assert_eq!(trades[0].match_type, MatchType::Normal);
        assert_eq!(trades[0].share_type, ShareType::Yes);

        // Second trade should be at 0.65
        assert_eq!(trades[1].price, dec!(0.65));
        assert_eq!(trades[1].amount, dec!(50));

        // Check remaining ask
        assert!(!book.has_order(&ask1_id)); // Fully filled
        assert!(book.has_order(&ask2_id)); // Partially filled
    }

    #[test]
    fn test_symmetric_fee_in_trades() {
        let (market_key, _, _) = create_market_key();
        let book = Orderbook::new(market_key);
        let fee_config = FeeConfig::default();

        // Add a sell order at 0.90
        book.add_order(create_test_order(
            Uuid::new_v4(),
            dec!(0.90),
            dec!(100),
            Side::Sell,
        ))
        .unwrap();

        // Match with a buy order
        let (trades, _) = book.match_order(
            Uuid::new_v4(),
            "0x5678",
            Side::Buy,
            dec!(100),
            Some(dec!(0.95)),
            &fee_config,
        );

        assert_eq!(trades.len(), 1);

        // Fee should be based on min(0.90, 0.10) = 0.10
        // fee = 0.02 * 0.10 * 100 = 0.2 (for taker)
        let expected_taker_fee = fee_config.calculate_taker_fee(dec!(0.90), dec!(100));
        assert_eq!(trades[0].taker_fee, expected_taker_fee);
    }

    #[test]
    fn test_snapshot() {
        let (market_key, market_id, outcome_id) = create_market_key();
        let book = Orderbook::new(market_key.clone());

        book.add_order(create_test_order(
            Uuid::new_v4(),
            dec!(0.60),
            dec!(100),
            Side::Buy,
        ))
        .unwrap();
        book.add_order(create_test_order(
            Uuid::new_v4(),
            dec!(0.60),
            dec!(200),
            Side::Buy,
        ))
        .unwrap();
        book.add_order(create_test_order(
            Uuid::new_v4(),
            dec!(0.70),
            dec!(150),
            Side::Sell,
        ))
        .unwrap();

        let snapshot = book.snapshot(10);

        // Check symbol contains market_id and outcome_id
        assert!(snapshot.symbol.contains(&market_id.to_string()));
        assert!(snapshot.symbol.contains(&outcome_id.to_string()));
        assert_eq!(snapshot.bids.len(), 1);
        assert_eq!(snapshot.asks.len(), 1);
        assert_eq!(snapshot.bids[0][1], "300"); // Total bid at 0.60 (100 + 200)
        assert_eq!(snapshot.asks[0][1], "150");
    }
}
