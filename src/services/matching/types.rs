//! Matching Engine Types
//!
//! Shared types and DTOs for the prediction market matching engine.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use uuid::Uuid;

use crate::models::market::ShareType;

// ============================================================================
// Price Level
// ============================================================================

/// Price level with 8 decimal precision for exact comparison
/// For prediction markets, price is always between 0 and 1
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PriceLevel(i64);

impl PriceLevel {
    /// Create a PriceLevel from a Decimal price
    pub fn from_decimal(price: Decimal) -> Self {
        let scaled = price * Decimal::from(100_000_000);
        let truncated = scaled.trunc();
        let value = truncated.mantissa() / 10i128.pow(truncated.scale() as u32);
        PriceLevel(value as i64)
    }

    /// Convert back to Decimal
    pub fn to_decimal(&self) -> Decimal {
        Decimal::from(self.0) / Decimal::from(100_000_000)
    }

    /// Get raw value
    pub fn raw(&self) -> i64 {
        self.0
    }

    /// Get the complement price level (1 - price)
    /// For prediction markets: Yes_price + No_price = 1
    pub fn complement(&self) -> Self {
        let one = 100_000_000i64; // 1.0 in scaled form
        PriceLevel(one - self.0)
    }

    /// Check if price is valid for prediction markets (0 < price < 1)
    pub fn is_valid_probability(&self) -> bool {
        self.0 > 0 && self.0 < 100_000_000
    }
}

impl Ord for PriceLevel {
    fn cmp(&self, other: &Self) -> Ordering {
        self.0.cmp(&other.0)
    }
}

impl PartialOrd for PriceLevel {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

// ============================================================================
// Order Types
// ============================================================================

/// Order side
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Buy,
    Sell,
}

impl Side {
    /// Get the opposite side
    pub fn opposite(&self) -> Self {
        match self {
            Side::Buy => Side::Sell,
            Side::Sell => Side::Buy,
        }
    }
}

impl std::fmt::Display for Side {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Side::Buy => write!(f, "buy"),
            Side::Sell => write!(f, "sell"),
        }
    }
}

/// Order type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OrderType {
    Limit,
    Market,
}

impl std::fmt::Display for OrderType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OrderType::Limit => write!(f, "limit"),
            OrderType::Market => write!(f, "market"),
        }
    }
}

/// Time in force
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum TimeInForce {
    /// Good Till Cancel
    GTC,
    /// Immediate or Cancel
    IOC,
    /// Fill or Kill
    FOK,
}

impl Default for TimeInForce {
    fn default() -> Self {
        TimeInForce::GTC
    }
}

/// Order status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OrderStatus {
    /// Order is active in the orderbook
    Open,
    /// Order is partially filled
    PartiallyFilled,
    /// Order is completely filled
    Filled,
    /// Order was cancelled
    Cancelled,
    /// Order was rejected
    Rejected,
}

impl std::fmt::Display for OrderStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OrderStatus::Open => write!(f, "open"),
            OrderStatus::PartiallyFilled => write!(f, "partially_filled"),
            OrderStatus::Filled => write!(f, "filled"),
            OrderStatus::Cancelled => write!(f, "cancelled"),
            OrderStatus::Rejected => write!(f, "rejected"),
        }
    }
}

// ============================================================================
// Match Type (Prediction Market Specific)
// ============================================================================

/// Match type for prediction markets
///
/// In prediction markets, there are three types of matches:
/// - Normal: Same share type, opposite sides (Yes buy vs Yes sell)
/// - Mint: Two buy orders for complementary shares (Yes buy + No buy)
/// - Merge: Two sell orders for complementary shares (Yes sell + No sell)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MatchType {
    /// Normal match: Same share type, opposite sides
    /// Example: Yes buy matches Yes sell
    Normal,

    /// Mint match: Two buys for complementary shares create new shares
    /// Example: Yes buy + No buy = mint 1 Yes + 1 No (costs 1 USDC)
    Mint,

    /// Merge match: Two sells for complementary shares redeem for collateral
    /// Example: Yes sell + No sell = merge to 1 USDC
    Merge,
}

impl MatchType {
    /// Derive the match type from order characteristics
    pub fn derive(
        taker_share_type: ShareType,
        taker_side: Side,
        maker_share_type: ShareType,
        maker_side: Side,
    ) -> Self {
        // Same share type = Normal matching
        if taker_share_type == maker_share_type {
            return MatchType::Normal;
        }

        // Different share types (complementary)
        match (taker_side, maker_side) {
            // Two buys for complementary shares = Mint
            (Side::Buy, Side::Buy) => MatchType::Mint,
            // Two sells for complementary shares = Merge
            (Side::Sell, Side::Sell) => MatchType::Merge,
            // Buy vs Sell for complementary shares = Normal
            _ => MatchType::Normal,
        }
    }

    /// Check if this match type requires minting new shares
    pub fn requires_mint(&self) -> bool {
        matches!(self, MatchType::Mint)
    }

    /// Check if this match type results in collateral redemption
    pub fn redeems_collateral(&self) -> bool {
        matches!(self, MatchType::Merge)
    }
}

impl std::fmt::Display for MatchType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MatchType::Normal => write!(f, "normal"),
            MatchType::Mint => write!(f, "mint"),
            MatchType::Merge => write!(f, "merge"),
        }
    }
}

// ============================================================================
// Order Entry (in orderbook)
// ============================================================================

/// An order entry in the orderbook
#[derive(Debug, Clone)]
pub struct OrderEntry {
    /// Order ID
    pub id: Uuid,

    /// User wallet address
    pub user_address: String,

    /// Probability price (0-1)
    pub price: Decimal,

    /// Original order amount
    pub original_amount: Decimal,

    /// Remaining unfilled amount
    pub remaining_amount: Decimal,

    /// Order side (Buy/Sell)
    pub side: Side,

    /// Time in force
    pub time_in_force: TimeInForce,

    /// Order timestamp (milliseconds)
    pub timestamp: i64,
}

impl OrderEntry {
    /// Get the complement price (1 - price)
    pub fn complement_price(&self) -> Decimal {
        Decimal::ONE - self.price
    }
}

// ============================================================================
// Trade Execution
// ============================================================================

/// A trade execution result
#[derive(Debug, Clone, Serialize)]
pub struct TradeExecution {
    /// Trade ID
    pub trade_id: Uuid,

    /// Market ID
    pub market_id: Uuid,

    /// Outcome ID
    pub outcome_id: Uuid,

    /// Share type
    pub share_type: ShareType,

    /// Match type
    pub match_type: MatchType,

    /// Maker order ID
    pub maker_order_id: Uuid,

    /// Taker order ID
    pub taker_order_id: Uuid,

    /// Maker address
    pub maker_address: String,

    /// Trade price
    pub price: Decimal,

    /// Trade amount (shares)
    pub amount: Decimal,

    /// Maker fee
    pub maker_fee: Decimal,

    /// Taker fee
    pub taker_fee: Decimal,

    /// Trade timestamp
    pub timestamp: i64,
}

/// Trade event for broadcasting
#[derive(Debug, Clone, Serialize)]
pub struct TradeEvent {
    /// Market key (format: market_id:outcome_id:share_type)
    pub symbol: String,

    /// Market ID (parsed from symbol)
    pub market_id: Uuid,

    /// Outcome ID (parsed from symbol)
    pub outcome_id: Uuid,

    /// Share type (parsed from symbol)
    pub share_type: ShareType,

    /// Match type (Normal, Mint, or Merge)
    pub match_type: MatchType,

    /// Trade ID
    pub trade_id: Uuid,

    /// Maker order ID
    pub maker_order_id: Uuid,

    /// Taker order ID
    pub taker_order_id: Uuid,

    /// Maker address
    pub maker_address: String,

    /// Taker address
    pub taker_address: String,

    /// Taker side
    pub side: String,

    /// Trade price
    pub price: Decimal,

    /// Trade amount
    pub amount: Decimal,

    /// Maker fee
    pub maker_fee: Decimal,

    /// Taker fee
    pub taker_fee: Decimal,

    /// Trade timestamp
    pub timestamp: i64,
}

impl TradeEvent {
    /// Create a TradeEvent from symbol and other fields
    pub fn new(
        symbol: String,
        trade_id: Uuid,
        maker_order_id: Uuid,
        taker_order_id: Uuid,
        maker_address: String,
        taker_address: String,
        side: Side,
        price: Decimal,
        amount: Decimal,
        maker_fee: Decimal,
        taker_fee: Decimal,
    ) -> Self {
        let (market_id, outcome_id, share_type) = OrderbookSnapshot::parse_market_key(&symbol)
            .unwrap_or((Uuid::nil(), Uuid::nil(), ShareType::Yes));

        Self {
            symbol,
            market_id,
            outcome_id,
            share_type,
            match_type: MatchType::Normal,
            trade_id,
            maker_order_id,
            taker_order_id,
            maker_address,
            taker_address,
            side: side.to_string(),
            price,
            amount,
            maker_fee,
            taker_fee,
            timestamp: chrono::Utc::now().timestamp_millis(),
        }
    }
}

// ============================================================================
// Match Result
// ============================================================================

/// Result of order matching
#[derive(Debug, Clone)]
pub struct MatchResult {
    pub order_id: Uuid,
    pub status: OrderStatus,
    pub filled_amount: Decimal,
    pub remaining_amount: Decimal,
    pub average_price: Option<Decimal>,
    pub trades: Vec<TradeExecution>,
}

// ============================================================================
// Orderbook Snapshot
// ============================================================================

/// Orderbook snapshot for API response
#[derive(Debug, Clone, Serialize)]
pub struct OrderbookSnapshot {
    /// Market key (format: market_id:outcome_id:share_type)
    pub symbol: String,

    /// Bid levels [price, amount]
    pub bids: Vec<[String; 2]>,

    /// Ask levels [price, amount]
    pub asks: Vec<[String; 2]>,

    /// Last trade price
    pub last_price: Option<Decimal>,

    /// Snapshot timestamp
    pub timestamp: i64,
}

impl OrderbookSnapshot {
    /// Parse market key into components
    pub fn parse_market_key(market_key: &str) -> Option<(Uuid, Uuid, ShareType)> {
        let parts: Vec<&str> = market_key.split(':').collect();
        if parts.len() != 3 {
            return None;
        }
        let market_id = Uuid::parse_str(parts[0]).ok()?;
        let outcome_id = Uuid::parse_str(parts[1]).ok()?;
        let share_type: ShareType = parts[2].parse().ok()?;
        Some((market_id, outcome_id, share_type))
    }
}

/// Orderbook update event for broadcasting
#[derive(Debug, Clone, Serialize)]
pub struct OrderbookUpdate {
    /// Market key (format: market_id:outcome_id:share_type)
    pub symbol: String,

    /// Updated bid levels
    pub bids: Vec<[String; 2]>,

    /// Updated ask levels
    pub asks: Vec<[String; 2]>,

    /// Update timestamp
    pub timestamp: i64,
}

// ============================================================================
// Trade Record (for history)
// ============================================================================

/// Trade record for history storage
#[derive(Debug, Clone, Serialize)]
pub struct TradeRecord {
    pub trade_id: String,
    pub market_id: String,
    pub outcome_id: String,
    pub share_type: String,
    pub match_type: String,
    pub side: String,
    pub price: String,
    pub amount: String,
    pub maker_order_id: String,
    pub taker_order_id: String,
    pub maker_address: String,
    pub taker_address: String,
    pub maker_fee: String,
    pub taker_fee: String,
    pub timestamp: i64,
}

impl From<&TradeEvent> for TradeRecord {
    fn from(event: &TradeEvent) -> Self {
        TradeRecord {
            trade_id: event.trade_id.to_string(),
            market_id: event.market_id.to_string(),
            outcome_id: event.outcome_id.to_string(),
            share_type: event.share_type.to_string(),
            match_type: event.match_type.to_string(),
            side: event.side.clone(),
            price: event.price.to_string(),
            amount: event.amount.to_string(),
            maker_order_id: event.maker_order_id.to_string(),
            taker_order_id: event.taker_order_id.to_string(),
            maker_address: event.maker_address.clone(),
            taker_address: event.taker_address.clone(),
            maker_fee: event.maker_fee.to_string(),
            taker_fee: event.taker_fee.to_string(),
            timestamp: event.timestamp,
        }
    }
}

// ============================================================================
// Order History Record
// ============================================================================

/// Order history record for storage
#[derive(Debug, Clone, Serialize)]
pub struct OrderHistoryRecord {
    pub order_id: String,
    pub user_address: String,
    /// Market key (format: market_id:outcome_id:share_type or just symbol for legacy)
    pub symbol: String,
    pub side: String,
    pub order_type: String,
    pub price: String,
    pub original_amount: String,
    pub filled_amount: String,
    pub remaining_amount: String,
    pub status: String,
    pub leverage: u32,
    pub created_at: i64,
    pub updated_at: i64,
    pub avg_fill_price: Option<String>,
    pub trade_ids: Vec<String>,
}

// ============================================================================
// Query Types
// ============================================================================

/// Trade history query parameters
#[derive(Debug, Clone, Deserialize, Default)]
pub struct TradeHistoryQuery {
    pub market_id: Option<Uuid>,
    pub share_type: Option<String>,
    pub limit: Option<usize>,
    pub before: Option<i64>,
    pub after: Option<i64>,
}

impl TradeHistoryQuery {
    pub fn get_limit(&self) -> usize {
        self.limit.unwrap_or(50).min(100).max(1)
    }
}

/// Trade history response
#[derive(Debug, Clone, Serialize)]
pub struct TradeHistoryResponse {
    pub trades: Vec<TradeRecord>,
    pub total_count: usize,
    pub has_more: bool,
}

/// Order history query parameters
#[derive(Debug, Clone, Deserialize, Default)]
pub struct OrderHistoryQuery {
    pub status: Option<String>,
    pub market_id: Option<Uuid>,
    pub share_type: Option<String>,
    pub limit: Option<usize>,
    pub before: Option<i64>,
    pub after: Option<i64>,
}

impl OrderHistoryQuery {
    pub fn get_limit(&self) -> usize {
        self.limit.unwrap_or(50).min(100).max(1)
    }

    pub fn matches_status(&self, status: &str) -> bool {
        match &self.status {
            None => true,
            Some(filter) => filter == "all" || status == filter,
        }
    }

    pub fn matches_market(&self, market_id: &Uuid) -> bool {
        match &self.market_id {
            None => true,
            Some(filter) => market_id == filter,
        }
    }

    pub fn matches_share_type(&self, share_type: &str) -> bool {
        match &self.share_type {
            None => true,
            Some(filter) => share_type == filter,
        }
    }

    pub fn matches_time(&self, timestamp: i64) -> bool {
        let matches_before = self.before.map_or(true, |ts| timestamp < ts);
        let matches_after = self.after.map_or(true, |ts| timestamp > ts);
        matches_before && matches_after
    }

    /// Match symbol/market_key against query
    /// Supports both legacy symbol format and market_key format
    pub fn matches_symbol(&self, symbol: &str) -> bool {
        // If no market_id filter, match everything
        let market_id = match &self.market_id {
            None => return true,
            Some(id) => id,
        };

        // Check if symbol contains the market_id
        if symbol.contains(&market_id.to_string()) {
            // Also check share_type if specified
            if let Some(st) = &self.share_type {
                return symbol.to_lowercase().contains(&st.to_lowercase());
            }
            return true;
        }

        false
    }
}

/// Order history response
#[derive(Debug, Clone, Serialize)]
pub struct OrderHistoryResponse {
    pub orders: Vec<OrderHistoryRecord>,
    pub total_count: usize,
    pub has_more: bool,
}

// ============================================================================
// Error Types
// ============================================================================

/// Matching engine errors
#[derive(Debug, thiserror::Error)]
pub enum MatchingError {
    #[error("Symbol/Market not found: {0}")]
    SymbolNotFound(String),

    #[error("Market not found: {0}")]
    MarketNotFound(String),

    #[error("Outcome not found: {0}")]
    OutcomeNotFound(String),

    #[error("Order not found: {0}")]
    OrderNotFound(String),

    #[error("Invalid price: {0}")]
    InvalidPrice(String),

    #[error("Invalid amount: {0}")]
    InvalidAmount(String),

    #[error("Invalid side: {0}")]
    InvalidSide(String),

    #[error("Market not active: {0}")]
    MarketNotActive(String),

    #[error("Insufficient liquidity")]
    InsufficientLiquidity,

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Internal error: {0}")]
    InternalError(String),
}

// ============================================================================
// Fee Configuration (Prediction Market Symmetric Fee)
// ============================================================================

/// Prediction market fee configuration
///
/// Uses symmetric fee formula: fee = base_rate * min(price, 1-price) * amount
/// This ensures that buying 100 shares of Yes @ 0.99 costs the same fee as
/// buying 100 shares of No @ 0.01
#[derive(Debug, Clone)]
pub struct FeeConfig {
    /// Base fee rate in basis points (1 bp = 0.01%)
    pub base_fee_bps: u32,

    /// Maximum fee rate in basis points
    pub max_fee_bps: u32,

    /// Maker fee discount rate (0-100, percentage)
    pub maker_discount_pct: u32,
}

impl Default for FeeConfig {
    fn default() -> Self {
        Self {
            base_fee_bps: 200,       // 2%
            max_fee_bps: 1000,       // 10%
            maker_discount_pct: 50,  // 50% discount for makers
        }
    }
}

impl FeeConfig {
    /// Calculate symmetric fee for prediction market orders
    ///
    /// Formula: fee = base_rate * min(price, 1-price) * amount
    ///
    /// This ensures that:
    /// - Buying Yes @ 0.90 has same fee as buying No @ 0.10
    /// - Fee is highest at price = 0.50
    /// - Fee approaches zero as price approaches 0 or 1
    pub fn calculate_fee(&self, price: Decimal, amount: Decimal, is_maker: bool) -> Decimal {
        // Convert basis points to decimal (200 bps = 0.02)
        let base_rate = Decimal::new(self.base_fee_bps as i64, 4);

        // Calculate complement price
        let complement_price = Decimal::ONE - price;

        // Use minimum of price and complement price for symmetric fee
        let min_price = price.min(complement_price);

        // Calculate base fee
        let mut fee = base_rate * min_price * amount;

        // Apply maker discount
        if is_maker {
            let discount = Decimal::new(self.maker_discount_pct as i64, 2);
            fee = fee * (Decimal::ONE - discount);
        }

        // Apply maximum fee cap
        let max_rate = Decimal::new(self.max_fee_bps as i64, 4);
        let max_fee = max_rate * amount;
        fee.min(max_fee)
    }

    /// Calculate taker fee
    pub fn calculate_taker_fee(&self, price: Decimal, amount: Decimal) -> Decimal {
        self.calculate_fee(price, amount, false)
    }

    /// Calculate maker fee
    pub fn calculate_maker_fee(&self, price: Decimal, amount: Decimal) -> Decimal {
        self.calculate_fee(price, amount, true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    #[test]
    fn test_price_level_conversion() {
        let price = dec!(0.65);
        let level = PriceLevel::from_decimal(price);
        let back = level.to_decimal();
        assert_eq!(price, back);
    }

    #[test]
    fn test_price_level_complement() {
        let price = dec!(0.65);
        let level = PriceLevel::from_decimal(price);
        let complement = level.complement();
        assert_eq!(complement.to_decimal(), dec!(0.35));
    }

    #[test]
    fn test_price_level_valid_probability() {
        assert!(PriceLevel::from_decimal(dec!(0.50)).is_valid_probability());
        assert!(PriceLevel::from_decimal(dec!(0.01)).is_valid_probability());
        assert!(PriceLevel::from_decimal(dec!(0.99)).is_valid_probability());
        assert!(!PriceLevel::from_decimal(dec!(0)).is_valid_probability());
        assert!(!PriceLevel::from_decimal(dec!(1)).is_valid_probability());
    }

    #[test]
    fn test_match_type_derive() {
        // Normal: Yes buy vs Yes sell
        assert_eq!(
            MatchType::derive(ShareType::Yes, Side::Buy, ShareType::Yes, Side::Sell),
            MatchType::Normal
        );

        // Mint: Yes buy + No buy
        assert_eq!(
            MatchType::derive(ShareType::Yes, Side::Buy, ShareType::No, Side::Buy),
            MatchType::Mint
        );

        // Merge: Yes sell + No sell
        assert_eq!(
            MatchType::derive(ShareType::Yes, Side::Sell, ShareType::No, Side::Sell),
            MatchType::Merge
        );
    }

    #[test]
    fn test_symmetric_fee() {
        let config = FeeConfig::default();

        // Fee for buying at 0.90 should equal fee for buying at 0.10
        let fee_high = config.calculate_taker_fee(dec!(0.90), dec!(100));
        let fee_low = config.calculate_taker_fee(dec!(0.10), dec!(100));
        assert_eq!(fee_high, fee_low);

        // Fee is highest at 0.50
        let fee_mid = config.calculate_taker_fee(dec!(0.50), dec!(100));
        assert!(fee_mid > fee_high);
    }

    #[test]
    fn test_maker_discount() {
        let config = FeeConfig::default();
        let taker_fee = config.calculate_taker_fee(dec!(0.50), dec!(100));
        let maker_fee = config.calculate_maker_fee(dec!(0.50), dec!(100));

        // Maker fee should be less than taker fee
        assert!(maker_fee < taker_fee);
    }

    #[test]
    fn test_order_history_query() {
        let query = OrderHistoryQuery {
            status: Some("filled".to_string()),
            market_id: Some(Uuid::new_v4()),
            share_type: Some("yes".to_string()),
            limit: Some(10),
            before: None,
            after: None,
        };

        assert_eq!(query.get_limit(), 10);
        assert!(query.matches_status("filled"));
        assert!(!query.matches_status("open"));
    }
}
