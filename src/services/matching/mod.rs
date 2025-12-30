//! Order Matching Engine Module for Prediction Markets
//!
//! High-performance order matching with price-time priority.
//!
//! # Architecture
//!
//! ```text
//! API Handler
//!   ↓
//! OrderFlowOrchestrator
//!   ├→ MatchingEngine (in-memory matching)
//!   │    └→ Orderbook (per market:outcome:share_type)
//!   ├→ HistoryManager (in-memory history)
//!   └→ Database (async persistence)
//! ```
//!
//! # Features
//!
//! - **Concurrent Access**: Uses DashMap for lock-free orderbook access
//! - **Price-Time Priority**: Orders are matched by best price, then oldest first
//! - **Async Persistence**: Database operations are non-blocking
//! - **History Tracking**: Keeps recent trades and orders in memory
//! - **WebSocket Integration**: Broadcasts trade events in real-time
//!
//! # Prediction Market Keys
//!
//! For prediction markets, we use market keys in the format:
//! `{market_id}:{outcome_id}:{share_type}`
//!
//! For example: `550e8400-e29b-41d4-a716-446655440000:660e8400-e29b-41d4-a716-446655440001:Yes`

mod engine;
mod history;
mod orderbook;
mod orchestrator;
mod types;

// Re-export main types
pub use engine::{EngineStats, MatchingEngine};
pub use history::{HistoryManager, HistoryStats};
pub use orderbook::Orderbook;
pub use orchestrator::OrderFlowOrchestrator;
pub use types::*;

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    #[test]
    fn test_price_level() {
        let price = dec!(0.55);
        let level = PriceLevel::from_decimal(price);
        let back = level.to_decimal();

        // Should preserve 8 decimal places
        assert_eq!(price, back);
    }

    #[test]
    fn test_engine_basic() {
        let engine = MatchingEngine::new();

        // For prediction markets, use market_key format with valid UUIDs
        let market_id = uuid::Uuid::new_v4();
        let outcome_id = uuid::Uuid::new_v4();
        let market_key = format!("{}:{}:yes", market_id, outcome_id);

        // Submit a buy order (buy Yes shares at 0.55)
        let result = engine.submit_order(
            uuid::Uuid::new_v4(),
            &market_key,
            "0x1234",
            Side::Buy,
            OrderType::Limit,
            dec!(100.0), // 100 shares
            Some(dec!(0.55)), // at 0.55 probability
            1, // leverage not used in prediction markets
        );

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result.status, OrderStatus::Open);
    }
}
