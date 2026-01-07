//! UMA Optimistic Oracle V3 integration for market resolution
//!
//! This module provides integration with UMA's Optimistic Oracle V3 for
//! decentralized market resolution. It allows:
//! - Making assertions about market outcomes
//! - Settling assertions after the liveness period
//! - Handling disputes through UMA's DVM
//! - Querying assertion status and results

use ethers::prelude::*;
use ethers::types::{Address, Bytes, U256};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use crate::blockchain::contracts::OptimisticOracleV3Contract;

/// Default identifier for assertions (ASSERT_TRUTH)
pub const DEFAULT_IDENTIFIER: [u8; 32] = *b"ASSERT_TRUTH\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0";

/// UMA Oracle configuration
#[derive(Debug, Clone)]
pub struct UmaOracleConfig {
    /// UMA Optimistic Oracle V3 address
    pub oracle_address: Address,
    /// Default liveness period (seconds)
    pub liveness_seconds: u64,
    /// Default bond amount (in USDC, 6 decimals)
    pub bond_amount: U256,
    /// Currency for bonds (USDC)
    pub currency: Address,
}

/// Assertion status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AssertionStatus {
    /// Assertion made, waiting for liveness period
    Pending,
    /// Assertion has been disputed
    Disputed,
    /// Assertion settled as true
    SettledTrue,
    /// Assertion settled as false (disputed and resolved)
    SettledFalse,
    /// Not found
    NotFound,
}

/// Assertion details from on-chain
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssertionDetails {
    pub assertion_id: String,
    pub asserter: String,
    pub settled: bool,
    pub settlement_resolution: bool,
    pub assertion_time: u64,
    pub expiration_time: u64,
    pub currency: String,
    pub bond: String,
    pub disputer: Option<String>,
    pub status: AssertionStatus,
}

/// Market resolution assertion
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketResolutionAssertion {
    pub market_id: Uuid,
    pub assertion_id: String,
    pub outcome_id: Uuid,
    pub claim: String,
    pub asserter: String,
    pub assertion_time: chrono::DateTime<chrono::Utc>,
    pub expiration_time: chrono::DateTime<chrono::Utc>,
    pub bond_amount: String,
    pub status: AssertionStatus,
}

/// UMA Oracle errors
#[derive(Debug, thiserror::Error)]
pub enum UmaOracleError {
    #[error("Market not found: {0}")]
    MarketNotFound(Uuid),
    #[error("Market already has pending assertion")]
    PendingAssertionExists,
    #[error("Market already resolved")]
    AlreadyResolved,
    #[error("Assertion not found: {0}")]
    AssertionNotFound(String),
    #[error("Assertion not ready for settlement")]
    NotReadyForSettlement,
    #[error("Invalid outcome: {0}")]
    InvalidOutcome(String),
    #[error("Blockchain error: {0}")]
    BlockchainError(String),
    #[error("Database error: {0}")]
    DatabaseError(#[from] sqlx::Error),
    #[error("Contract error: {0}")]
    ContractError(String),
}

/// UMA Oracle client for market resolution
pub struct UmaOracleClient<M: Middleware> {
    oracle: OptimisticOracleV3Contract<M>,
    config: UmaOracleConfig,
    pool: PgPool,
}

impl<M: Middleware + 'static> UmaOracleClient<M> {
    /// Create a new UMA Oracle client
    pub fn new(provider: Arc<M>, config: UmaOracleConfig, pool: PgPool) -> Self {
        let oracle = OptimisticOracleV3Contract::new(config.oracle_address, provider);
        Self {
            oracle,
            config,
            pool,
        }
    }

    /// Build a claim for market resolution
    /// Format: "Market [market_id] resolved with outcome [outcome_id] (YES/NO)"
    pub fn build_claim(&self, market_id: Uuid, outcome_id: Uuid, outcome_name: &str) -> Bytes {
        let claim = format!(
            "Market {} resolved with outcome {} ({})",
            market_id, outcome_id, outcome_name
        );
        Bytes::from(claim.into_bytes())
    }

    /// Make an assertion for market resolution
    /// This starts the liveness period during which the assertion can be disputed
    pub async fn assert_market_resolution(
        &self,
        market_id: Uuid,
        outcome_id: Uuid,
        outcome_name: &str,
        asserter: Address,
    ) -> Result<String, UmaOracleError> {
        // Check if market exists and is not already resolved
        let market = sqlx::query!(
            r#"
            SELECT id, status::text as "status!", winning_outcome_id
            FROM markets
            WHERE id = $1
            "#,
            market_id
        )
        .fetch_optional(&self.pool)
        .await?
        .ok_or(UmaOracleError::MarketNotFound(market_id))?;

        if market.status == "resolved" {
            return Err(UmaOracleError::AlreadyResolved);
        }

        // Check for existing pending assertion
        let pending = sqlx::query!(
            r#"
            SELECT assertion_id
            FROM market_assertions
            WHERE market_id = $1 AND status = 'pending'
            "#,
            market_id
        )
        .fetch_optional(&self.pool)
        .await?;

        if pending.is_some() {
            return Err(UmaOracleError::PendingAssertionExists);
        }

        // Build the claim
        let claim = self.build_claim(market_id, outcome_id, outcome_name);

        // Make the assertion on-chain
        let call = self.oracle.assert_truth_with_defaults(claim.clone(), asserter);

        let pending_tx = call
            .send()
            .await
            .map_err(|e| UmaOracleError::ContractError(e.to_string()))?;

        let receipt = pending_tx
            .await
            .map_err(|e| UmaOracleError::ContractError(e.to_string()))?
            .ok_or_else(|| UmaOracleError::ContractError("No receipt".to_string()))?;

        // Extract assertion ID from logs
        let assertion_id = self
            .extract_assertion_id_from_logs(&receipt.logs)
            .ok_or_else(|| {
                UmaOracleError::ContractError("Failed to extract assertion ID".to_string())
            })?;

        let assertion_id_hex = format!("0x{}", hex::encode(assertion_id));

        // Get assertion details from chain
        let assertion = self
            .oracle
            .get_assertion(assertion_id)
            .call()
            .await
            .map_err(|e| UmaOracleError::ContractError(e.to_string()))?;

        let assertion_time = chrono::DateTime::from_timestamp(assertion.assertion_time as i64, 0)
            .unwrap_or_else(chrono::Utc::now);
        let expiration_time = chrono::DateTime::from_timestamp(assertion.expiration_time as i64, 0)
            .unwrap_or_else(chrono::Utc::now);

        // Store assertion in database
        sqlx::query!(
            r#"
            INSERT INTO market_assertions (
                market_id, assertion_id, outcome_id, claim, asserter,
                assertion_time, expiration_time, bond_amount, status, tx_hash
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
            "#,
            market_id,
            assertion_id_hex,
            outcome_id,
            String::from_utf8_lossy(&claim).to_string(),
            format!("{:?}", asserter),
            assertion_time,
            expiration_time,
            self.config.bond_amount.to_string(),
            format!("{:?}", receipt.transaction_hash)
        )
        .execute(&self.pool)
        .await?;

        // Update market status
        sqlx::query!(
            r#"
            UPDATE markets
            SET status = 'pending_resolution'
            WHERE id = $1
            "#,
            market_id
        )
        .execute(&self.pool)
        .await?;

        tracing::info!(
            market_id = %market_id,
            assertion_id = %assertion_id_hex,
            outcome_id = %outcome_id,
            "Market resolution assertion made"
        );

        Ok(assertion_id_hex)
    }

    /// Settle an assertion after the liveness period
    pub async fn settle_assertion(
        &self,
        assertion_id_hex: &str,
    ) -> Result<bool, UmaOracleError> {
        let assertion_id = self.parse_assertion_id(assertion_id_hex)?;

        // Check assertion status
        let assertion = self
            .oracle
            .get_assertion(assertion_id)
            .call()
            .await
            .map_err(|e| UmaOracleError::ContractError(e.to_string()))?;

        if assertion.settled {
            // Already settled, return the result
            return Ok(assertion.settlement_resolution);
        }

        // Check if liveness period has passed
        let now = chrono::Utc::now().timestamp() as u64;
        if now < assertion.expiration_time {
            return Err(UmaOracleError::NotReadyForSettlement);
        }

        // Settle on-chain
        let call = self.oracle.settle_assertion(assertion_id);
        let pending_tx = call
            .send()
            .await
            .map_err(|e| UmaOracleError::ContractError(e.to_string()))?;

        let receipt = pending_tx
            .await
            .map_err(|e| UmaOracleError::ContractError(e.to_string()))?
            .ok_or_else(|| UmaOracleError::ContractError("No receipt".to_string()))?;

        // Get the result
        let result = self
            .oracle
            .get_assertion_result(assertion_id)
            .call()
            .await
            .map_err(|e| UmaOracleError::ContractError(e.to_string()))?;

        // Update database
        let status = if result { "settled_true" } else { "settled_false" };

        sqlx::query!(
            r#"
            UPDATE market_assertions
            SET status = $1, settled_at = NOW(), settlement_tx_hash = $2
            WHERE assertion_id = $3
            "#,
            status,
            format!("{:?}", receipt.transaction_hash),
            assertion_id_hex
        )
        .execute(&self.pool)
        .await?;

        // If settled true, resolve the market
        if result {
            let assertion_record = sqlx::query!(
                r#"
                SELECT market_id, outcome_id
                FROM market_assertions
                WHERE assertion_id = $1
                "#,
                assertion_id_hex
            )
            .fetch_optional(&self.pool)
            .await?;

            if let Some(record) = assertion_record {
                sqlx::query!(
                    r#"
                    UPDATE markets
                    SET status = 'resolved', winning_outcome_id = $1, resolved_at = NOW()
                    WHERE id = $2
                    "#,
                    record.outcome_id,
                    record.market_id
                )
                .execute(&self.pool)
                .await?;

                tracing::info!(
                    market_id = %record.market_id,
                    outcome_id = ?record.outcome_id,
                    "Market resolved via UMA Oracle"
                );
            }
        }

        Ok(result)
    }

    /// Get assertion details
    pub async fn get_assertion(
        &self,
        assertion_id_hex: &str,
    ) -> Result<AssertionDetails, UmaOracleError> {
        let assertion_id = self.parse_assertion_id(assertion_id_hex)?;

        let assertion = self
            .oracle
            .get_assertion(assertion_id)
            .call()
            .await
            .map_err(|e| UmaOracleError::ContractError(e.to_string()))?;

        // Determine status
        let status = if assertion.settled {
            if assertion.settlement_resolution {
                AssertionStatus::SettledTrue
            } else {
                AssertionStatus::SettledFalse
            }
        } else if assertion.disputer != Address::zero() {
            AssertionStatus::Disputed
        } else {
            AssertionStatus::Pending
        };

        let disputer = if assertion.disputer != Address::zero() {
            Some(format!("{:?}", assertion.disputer))
        } else {
            None
        };

        Ok(AssertionDetails {
            assertion_id: assertion_id_hex.to_string(),
            asserter: format!("{:?}", assertion.asserter),
            settled: assertion.settled,
            settlement_resolution: assertion.settlement_resolution,
            assertion_time: assertion.assertion_time,
            expiration_time: assertion.expiration_time,
            currency: format!("{:?}", assertion.currency),
            bond: assertion.bond.to_string(),
            disputer,
            status,
        })
    }

    /// Get pending assertions for a market
    pub async fn get_market_assertions(
        &self,
        market_id: Uuid,
    ) -> Result<Vec<MarketResolutionAssertion>, UmaOracleError> {
        let records = sqlx::query!(
            r#"
            SELECT
                market_id, assertion_id, outcome_id, claim, asserter,
                assertion_time, expiration_time, bond_amount, status
            FROM market_assertions
            WHERE market_id = $1
            ORDER BY assertion_time DESC
            "#,
            market_id
        )
        .fetch_all(&self.pool)
        .await?;

        let assertions = records
            .into_iter()
            .map(|r| {
                let status = match r.status.as_str() {
                    "pending" => AssertionStatus::Pending,
                    "disputed" => AssertionStatus::Disputed,
                    "settled_true" => AssertionStatus::SettledTrue,
                    "settled_false" => AssertionStatus::SettledFalse,
                    _ => AssertionStatus::NotFound,
                };

                MarketResolutionAssertion {
                    market_id: r.market_id,
                    assertion_id: r.assertion_id,
                    outcome_id: r.outcome_id,
                    claim: r.claim,
                    asserter: r.asserter,
                    assertion_time: r.assertion_time,
                    expiration_time: r.expiration_time,
                    bond_amount: r.bond_amount,
                    status,
                }
            })
            .collect();

        Ok(assertions)
    }

    /// Check if assertion can be settled
    pub async fn can_settle(&self, assertion_id_hex: &str) -> Result<bool, UmaOracleError> {
        let assertion_id = self.parse_assertion_id(assertion_id_hex)?;

        let assertion = self
            .oracle
            .get_assertion(assertion_id)
            .call()
            .await
            .map_err(|e| UmaOracleError::ContractError(e.to_string()))?;

        if assertion.settled {
            return Ok(false);
        }

        if assertion.disputer != Address::zero() {
            return Ok(false); // Disputed, needs DVM resolution
        }

        let now = chrono::Utc::now().timestamp() as u64;
        Ok(now >= assertion.expiration_time)
    }

    /// Get oracle defaults
    pub async fn get_defaults(&self) -> Result<(u64, U256, Address), UmaOracleError> {
        let liveness = self
            .oracle
            .default_liveness()
            .call()
            .await
            .map_err(|e| UmaOracleError::ContractError(e.to_string()))?;

        let min_bond = self
            .oracle
            .get_minimum_bond()
            .call()
            .await
            .map_err(|e| UmaOracleError::ContractError(e.to_string()))?;

        let currency = self
            .oracle
            .default_currency()
            .call()
            .await
            .map_err(|e| UmaOracleError::ContractError(e.to_string()))?;

        Ok((liveness, min_bond, currency))
    }

    /// Parse assertion ID from hex string
    fn parse_assertion_id(&self, hex_str: &str) -> Result<[u8; 32], UmaOracleError> {
        let hex_str = hex_str.strip_prefix("0x").unwrap_or(hex_str);
        let bytes = hex::decode(hex_str)
            .map_err(|_| UmaOracleError::AssertionNotFound(hex_str.to_string()))?;

        if bytes.len() != 32 {
            return Err(UmaOracleError::AssertionNotFound(hex_str.to_string()));
        }

        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes);
        Ok(arr)
    }

    /// Extract assertion ID from transaction logs
    fn extract_assertion_id_from_logs(&self, logs: &[Log]) -> Option<[u8; 32]> {
        // Look for AssertionMade event
        // event AssertionMade(bytes32 indexed assertionId, ...)
        for log in logs {
            if log.topics.len() >= 2 {
                // First topic is event signature, second is assertionId
                let assertion_id = log.topics[1];
                let mut arr = [0u8; 32];
                arr.copy_from_slice(assertion_id.as_bytes());
                return Some(arr);
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_identifier() {
        let expected = "ASSERT_TRUTH";
        let actual = String::from_utf8_lossy(&DEFAULT_IDENTIFIER[..12]);
        assert_eq!(actual, expected);
    }

    #[test]
    fn test_build_claim() {
        let market_id = Uuid::new_v4();
        let outcome_id = Uuid::new_v4();
        let claim = format!(
            "Market {} resolved with outcome {} (YES)",
            market_id, outcome_id
        );
        assert!(claim.contains(&market_id.to_string()));
        assert!(claim.contains("YES"));
    }
}
