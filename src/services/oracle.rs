//! Price Oracle Service for Prediction Markets
//!
//! Provides probability updates from multiple sources:
//! - Orderbook-based: Calculate weighted mid price from orderbook
//! - External oracle: Fetch from external price feeds (Chainlink, UMA, etc.)
//! - Manual: Admin can set probability directly

#![allow(dead_code)]

use rust_decimal::Decimal;
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::services::chainlink::{ChainlinkClient, ThresholdComparison};
use crate::services::matching::MatchingEngine;

/// Oracle error types
#[derive(Debug, thiserror::Error)]
pub enum OracleError {
    #[error("Market not found: {0}")]
    MarketNotFound(Uuid),

    #[error("Outcome not found: {0}")]
    OutcomeNotFound(Uuid),

    #[error("Market not active: {0}")]
    MarketNotActive(Uuid),

    #[error("Invalid probability: {0}. Must be between 0.01 and 0.99")]
    InvalidProbability(Decimal),

    #[error("Database error: {0}")]
    DatabaseError(#[from] sqlx::Error),

    #[error("External oracle error: {0}")]
    ExternalOracleError(String),
}

/// Price update event for WebSocket broadcast
#[derive(Debug, Clone)]
pub struct PriceUpdateEvent {
    pub market_id: Uuid,
    pub outcome_id: Uuid,
    pub probability: Decimal,
    pub source: PriceSource,
    pub timestamp: i64,
}

/// Source of price/probability update
#[derive(Debug, Clone, PartialEq)]
pub enum PriceSource {
    /// Calculated from orderbook
    Orderbook,
    /// From external oracle (Chainlink, UMA, etc.)
    External(String),
    /// Manually set by admin
    Manual,
    /// From trade execution
    Trade,
}

impl std::fmt::Display for PriceSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PriceSource::Orderbook => write!(f, "orderbook"),
            PriceSource::External(name) => write!(f, "external:{}", name),
            PriceSource::Manual => write!(f, "manual"),
            PriceSource::Trade => write!(f, "trade"),
        }
    }
}

/// Price Oracle Service
pub struct PriceOracle {
    pool: PgPool,
    matching_engine: Arc<MatchingEngine>,
    price_sender: broadcast::Sender<PriceUpdateEvent>,
    chainlink_client: Option<Arc<ChainlinkClient>>,
}

impl PriceOracle {
    /// Create a new PriceOracle
    pub fn new(pool: PgPool, matching_engine: Arc<MatchingEngine>) -> Self {
        let (price_sender, _) = broadcast::channel(1000);
        Self {
            pool,
            matching_engine,
            price_sender,
            chainlink_client: None,
        }
    }

    /// Create a new PriceOracle with Chainlink integration
    pub fn with_chainlink(
        pool: PgPool,
        matching_engine: Arc<MatchingEngine>,
        chainlink_client: ChainlinkClient,
    ) -> Self {
        let (price_sender, _) = broadcast::channel(1000);
        Self {
            pool,
            matching_engine,
            price_sender,
            chainlink_client: Some(Arc::new(chainlink_client)),
        }
    }

    /// Set Chainlink client
    pub fn set_chainlink_client(&mut self, client: ChainlinkClient) {
        self.chainlink_client = Some(Arc::new(client));
    }

    /// Check if Chainlink is available
    pub fn has_chainlink(&self) -> bool {
        self.chainlink_client.is_some()
    }

    /// Subscribe to price updates
    pub fn subscribe(&self) -> broadcast::Receiver<PriceUpdateEvent> {
        self.price_sender.subscribe()
    }

    /// Update probability from orderbook data
    ///
    /// Calculates weighted mid price from best bid/ask
    pub async fn update_from_orderbook(
        &self,
        market_id: Uuid,
        outcome_id: Uuid,
    ) -> Result<Decimal, OracleError> {
        // Build orderbook key
        let orderbook_key = format!("{}:{}:yes", market_id, outcome_id);

        // Get orderbook snapshot
        let snapshot = self.matching_engine.get_orderbook(&orderbook_key, 5);

        let probability = match snapshot {
            Ok(snap) => {
                // Parse best bid and ask
                let best_bid = snap.bids.first()
                    .and_then(|[price, _]| price.parse::<Decimal>().ok())
                    .unwrap_or(Decimal::ZERO);
                let best_ask = snap.asks.first()
                    .and_then(|[price, _]| price.parse::<Decimal>().ok())
                    .unwrap_or(Decimal::ONE);

                // Calculate weighted mid price
                if best_bid > Decimal::ZERO && best_ask < Decimal::ONE {
                    // Get volumes for weighting
                    let bid_vol = snap.bids.first()
                        .and_then(|[_, vol]| vol.parse::<Decimal>().ok())
                        .unwrap_or(Decimal::ONE);
                    let ask_vol = snap.asks.first()
                        .and_then(|[_, vol]| vol.parse::<Decimal>().ok())
                        .unwrap_or(Decimal::ONE);

                    // Weighted mid price: (bid * ask_vol + ask * bid_vol) / (bid_vol + ask_vol)
                    let total_vol = bid_vol + ask_vol;
                    if total_vol > Decimal::ZERO {
                        (best_bid * ask_vol + best_ask * bid_vol) / total_vol
                    } else {
                        (best_bid + best_ask) / Decimal::TWO
                    }
                } else if best_bid > Decimal::ZERO {
                    best_bid
                } else if best_ask < Decimal::ONE {
                    best_ask
                } else {
                    // No orderbook data, keep current probability
                    return self.get_current_probability(outcome_id).await;
                }
            }
            Err(_) => {
                // No orderbook, keep current probability
                return self.get_current_probability(outcome_id).await;
            }
        };

        // Clamp to valid range (0.01 to 0.99)
        let min_prob = Decimal::new(1, 2);  // 0.01
        let max_prob = Decimal::new(99, 2); // 0.99
        let probability = probability.max(min_prob).min(max_prob);

        // Update database
        self.update_probability(market_id, outcome_id, probability, PriceSource::Orderbook).await?;

        Ok(probability)
    }

    /// Update probability from trade execution
    pub async fn update_from_trade(
        &self,
        market_id: Uuid,
        outcome_id: Uuid,
        trade_price: Decimal,
    ) -> Result<Decimal, OracleError> {
        // Trade price is the new probability for Yes shares
        let min_prob = Decimal::new(1, 2);  // 0.01
        let max_prob = Decimal::new(99, 2); // 0.99
        let probability = trade_price.max(min_prob).min(max_prob);

        self.update_probability(market_id, outcome_id, probability, PriceSource::Trade).await?;

        Ok(probability)
    }

    /// Set probability manually (admin only)
    pub async fn set_probability_manual(
        &self,
        market_id: Uuid,
        outcome_id: Uuid,
        probability: Decimal,
    ) -> Result<(), OracleError> {
        // Validate probability range
        let min_prob = Decimal::new(1, 2);  // 0.01
        let max_prob = Decimal::new(99, 2); // 0.99
        if probability < min_prob || probability > max_prob {
            return Err(OracleError::InvalidProbability(probability));
        }

        // Verify market is active
        self.verify_market_active(market_id).await?;

        self.update_probability(market_id, outcome_id, probability, PriceSource::Manual).await
    }

    /// Fetch probability from external oracle
    ///
    /// For Chainlink, the resolution_source should be in format:
    /// - "chainlink:BTC/USD>100000" - Price threshold comparison
    /// - "chainlink:ETH/USD<2000" - Price below threshold
    ///
    /// Returns probability based on current price vs threshold
    pub async fn fetch_from_external(
        &self,
        market_id: Uuid,
        oracle_name: &str,
    ) -> Result<Decimal, OracleError> {
        // Verify market exists and get resolution source
        let market: Option<(Uuid, String)> = sqlx::query_as(
            "SELECT id, resolution_source FROM markets WHERE id = $1"
        )
        .bind(market_id)
        .fetch_optional(&self.pool)
        .await?;

        let (_, resolution_source) = market.ok_or(OracleError::MarketNotFound(market_id))?;

        match oracle_name.to_lowercase().as_str() {
            "chainlink" => {
                self.fetch_from_chainlink(market_id, &resolution_source).await
            }
            "uma" => {
                warn!("UMA oracle not yet implemented for market {}", market_id);
                Err(OracleError::ExternalOracleError(
                    "UMA integration not yet implemented".to_string()
                ))
            }
            "pyth" => {
                warn!("Pyth oracle not yet implemented for market {}", market_id);
                Err(OracleError::ExternalOracleError(
                    "Pyth integration not yet implemented".to_string()
                ))
            }
            _ => {
                Err(OracleError::ExternalOracleError(
                    format!("Unknown oracle: {}. Supported: chainlink, uma, pyth", oracle_name)
                ))
            }
        }
    }

    /// Fetch price data from Chainlink and calculate probability
    ///
    /// Resolution source format: "chainlink:FEED>THRESHOLD" or "chainlink:FEED<THRESHOLD"
    /// Examples:
    /// - "chainlink:BTC/USD>100000" -> Will BTC exceed $100,000?
    /// - "chainlink:ETH/USD<2000"   -> Will ETH drop below $2,000?
    async fn fetch_from_chainlink(
        &self,
        market_id: Uuid,
        resolution_source: &str,
    ) -> Result<Decimal, OracleError> {
        let client = self.chainlink_client.as_ref().ok_or_else(|| {
            OracleError::ExternalOracleError("Chainlink client not configured".to_string())
        })?;

        // Parse resolution source: "chainlink:BTC/USD>100000"
        let source = resolution_source.trim().to_lowercase();

        // Remove "chainlink:" prefix if present
        let criteria = if source.starts_with("chainlink:") {
            &source[10..]
        } else {
            &source
        };

        // Parse the criteria: FEED>THRESHOLD or FEED<THRESHOLD
        let (feed, threshold, comparison) = if let Some(pos) = criteria.find('>') {
            let feed = criteria[..pos].trim().to_uppercase();
            let threshold_str = criteria[pos + 1..].trim();
            let threshold: Decimal = threshold_str.parse().map_err(|_| {
                OracleError::ExternalOracleError(
                    format!("Invalid threshold value: {}", threshold_str)
                )
            })?;
            (feed, threshold, ThresholdComparison::Greater)
        } else if let Some(pos) = criteria.find('<') {
            let feed = criteria[..pos].trim().to_uppercase();
            let threshold_str = criteria[pos + 1..].trim();
            let threshold: Decimal = threshold_str.parse().map_err(|_| {
                OracleError::ExternalOracleError(
                    format!("Invalid threshold value: {}", threshold_str)
                )
            })?;
            (feed, threshold, ThresholdComparison::Less)
        } else {
            return Err(OracleError::ExternalOracleError(
                format!("Invalid resolution source format: {}. Expected format: FEED>THRESHOLD or FEED<THRESHOLD", resolution_source)
            ));
        };

        info!(
            "Fetching Chainlink price for market {}: {} {:?} {}",
            market_id, &feed, comparison, threshold
        );

        // Fetch price from Chainlink (try any available network)
        let price_data = client.get_price_any_network(&feed).await.map_err(|e| {
            error!("Chainlink price fetch failed for {}: {}", &feed, e);
            OracleError::ExternalOracleError(format!("Chainlink error: {}", e))
        })?;

        info!(
            "Chainlink price for {}: {} USD (from {})",
            &feed, price_data.price, price_data.network
        );

        // Check threshold condition and return probability
        // If condition is met -> high probability (0.95)
        // If condition is not met -> calculate probability based on distance from threshold
        let probability = match comparison {
            ThresholdComparison::Greater => {
                if price_data.price > threshold {
                    Decimal::new(95, 2) // 0.95 - very likely
                } else {
                    // Calculate probability based on how close we are to threshold
                    // Closer to threshold = higher probability
                    let ratio = price_data.price / threshold;
                    let base_prob = ratio * Decimal::new(50, 2); // Scale to 0-50%
                    base_prob.max(Decimal::new(5, 2)).min(Decimal::new(50, 2))
                }
            }
            ThresholdComparison::Less => {
                if price_data.price < threshold {
                    Decimal::new(95, 2) // 0.95 - very likely
                } else {
                    // Calculate inverse probability
                    let ratio = threshold / price_data.price;
                    let base_prob = ratio * Decimal::new(50, 2);
                    base_prob.max(Decimal::new(5, 2)).min(Decimal::new(50, 2))
                }
            }
            ThresholdComparison::GreaterOrEqual => {
                if price_data.price >= threshold {
                    Decimal::new(95, 2)
                } else {
                    let ratio = price_data.price / threshold;
                    let base_prob = ratio * Decimal::new(50, 2);
                    base_prob.max(Decimal::new(5, 2)).min(Decimal::new(50, 2))
                }
            }
            ThresholdComparison::LessOrEqual => {
                if price_data.price <= threshold {
                    Decimal::new(95, 2)
                } else {
                    let ratio = threshold / price_data.price;
                    let base_prob = ratio * Decimal::new(50, 2);
                    base_prob.max(Decimal::new(5, 2)).min(Decimal::new(50, 2))
                }
            }
            ThresholdComparison::Equal => {
                // Exact equality is rare with prices, use a small range
                let diff = (price_data.price - threshold).abs();
                let tolerance = threshold * Decimal::new(1, 3); // 0.1% tolerance
                if diff <= tolerance {
                    Decimal::new(95, 2)
                } else {
                    Decimal::new(5, 2)
                }
            }
        };

        debug!(
            "Market {} probability from Chainlink: {} (price={}, threshold={}, {:?})",
            market_id, probability, price_data.price, threshold, comparison
        );

        Ok(probability)
    }

    /// Get Chainlink price data directly (for API exposure)
    pub async fn get_chainlink_price(&self, feed: &str) -> Result<Decimal, OracleError> {
        let client = self.chainlink_client.as_ref().ok_or_else(|| {
            OracleError::ExternalOracleError("Chainlink client not configured".to_string())
        })?;

        let price_data = client.get_price_any_network(feed).await.map_err(|e| {
            OracleError::ExternalOracleError(format!("Chainlink error: {}", e))
        })?;

        Ok(price_data.price)
    }

    /// Batch update all market probabilities from orderbook
    pub async fn refresh_all_from_orderbook(&self) -> Result<usize, OracleError> {
        // Get all active markets with outcomes
        let markets: Vec<(Uuid, Uuid)> = sqlx::query_as(
            r#"
            SELECT m.id, o.id
            FROM markets m
            JOIN outcomes o ON o.market_id = m.id
            WHERE m.status = 'active' AND o.share_type = 'yes'
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        let mut updated_count = 0;
        for (market_id, outcome_id) in markets {
            match self.update_from_orderbook(market_id, outcome_id).await {
                Ok(_) => updated_count += 1,
                Err(e) => {
                    debug!("Failed to update probability for market {}: {}", market_id, e);
                }
            }
        }

        info!("Refreshed {} market probabilities from orderbook", updated_count);
        Ok(updated_count)
    }

    // =========================================================================
    // Private helpers
    // =========================================================================

    /// Update probability in database and broadcast
    async fn update_probability(
        &self,
        market_id: Uuid,
        outcome_id: Uuid,
        probability: Decimal,
        source: PriceSource,
    ) -> Result<(), OracleError> {
        // Update Yes outcome probability
        sqlx::query(
            "UPDATE outcomes SET probability = $1 WHERE id = $2"
        )
        .bind(probability)
        .bind(outcome_id)
        .execute(&self.pool)
        .await?;

        // Update complement (No) outcome probability
        let complement_prob = Decimal::ONE - probability;
        sqlx::query(
            r#"
            UPDATE outcomes
            SET probability = $1
            WHERE market_id = $2 AND id != $3
            "#
        )
        .bind(complement_prob)
        .bind(market_id)
        .bind(outcome_id)
        .execute(&self.pool)
        .await?;

        // Broadcast price update event
        let event = PriceUpdateEvent {
            market_id,
            outcome_id,
            probability,
            source: source.clone(),
            timestamp: chrono::Utc::now().timestamp_millis(),
        };

        if let Err(e) = self.price_sender.send(event) {
            debug!("No subscribers for price update: {}", e);
        }

        debug!(
            "Updated probability: market={}, outcome={}, prob={}, source={}",
            market_id, outcome_id, probability, source
        );

        Ok(())
    }

    /// Get current probability for an outcome
    async fn get_current_probability(&self, outcome_id: Uuid) -> Result<Decimal, OracleError> {
        let result: Option<(Decimal,)> = sqlx::query_as(
            "SELECT probability FROM outcomes WHERE id = $1"
        )
        .bind(outcome_id)
        .fetch_optional(&self.pool)
        .await?;

        match result {
            Some((prob,)) => Ok(prob),
            None => Err(OracleError::OutcomeNotFound(outcome_id)),
        }
    }

    /// Verify market is active
    async fn verify_market_active(&self, market_id: Uuid) -> Result<(), OracleError> {
        let result: Option<(String,)> = sqlx::query_as(
            "SELECT status::text FROM markets WHERE id = $1"
        )
        .bind(market_id)
        .fetch_optional(&self.pool)
        .await?;

        match result {
            Some((status,)) if status == "active" => Ok(()),
            Some(_) => Err(OracleError::MarketNotActive(market_id)),
            None => Err(OracleError::MarketNotFound(market_id)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_price_source_display() {
        assert_eq!(PriceSource::Orderbook.to_string(), "orderbook");
        assert_eq!(PriceSource::Manual.to_string(), "manual");
        assert_eq!(PriceSource::Trade.to_string(), "trade");
        assert_eq!(PriceSource::External("chainlink".to_string()).to_string(), "external:chainlink");
    }

    #[test]
    fn test_probability_bounds() {
        let min_prob = Decimal::new(1, 2);  // 0.01
        let max_prob = Decimal::new(99, 2); // 0.99

        // Test that probabilities are clamped to valid range
        let low = Decimal::new(1, 3).max(min_prob).min(max_prob); // 0.001
        assert_eq!(low, min_prob);

        let high = Decimal::new(999, 3).max(min_prob).min(max_prob); // 0.999
        assert_eq!(high, max_prob);

        let valid = Decimal::new(55, 2).max(min_prob).min(max_prob); // 0.55
        assert_eq!(valid, Decimal::new(55, 2));
    }
}
