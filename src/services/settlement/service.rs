//! Settlement Service
//!
//! Responsible for:
//! 1. Submitting matched orders to the CTFExchange contract (on-chain trade settlement)
//! 2. Settling user shares when markets are resolved/cancelled (share settlement)

use std::sync::Arc;

use ethers::types::U256;
use rust_decimal::Decimal;
use sqlx::PgPool;
use tokio::sync::mpsc;
use tracing::{error, info};
use uuid::Uuid;

use crate::blockchain::client::BlockchainClient;
use crate::blockchain::types::TxStatus;
use crate::models::market::ShareType;

use super::types::*;

/// Settlement service for on-chain order settlement
pub struct SettlementService {
    /// Blockchain client
    blockchain: Arc<BlockchainClient>,
    /// Database pool
    pool: PgPool,
    /// Configuration
    config: SettlementConfig,
    /// Settlement queue sender
    queue_tx: mpsc::Sender<MatchedOrders>,
    /// Settlement queue receiver (for worker)
    queue_rx: Option<mpsc::Receiver<MatchedOrders>>,
}

impl SettlementService {
    /// Create a new settlement service
    pub fn new(
        blockchain: Arc<BlockchainClient>,
        pool: PgPool,
        config: SettlementConfig,
    ) -> Self {
        let (queue_tx, queue_rx) = mpsc::channel(1000);

        Self {
            blockchain,
            pool,
            config,
            queue_tx,
            queue_rx: Some(queue_rx),
        }
    }

    /// Check if settlement is enabled
    pub fn is_enabled(&self) -> bool {
        self.config.enabled
    }

    /// Get the queue sender for submitting settlements
    pub fn queue_sender(&self) -> mpsc::Sender<MatchedOrders> {
        self.queue_tx.clone()
    }

    /// Start the settlement worker
    /// Returns the queue sender for submitting settlements
    pub fn start_worker(mut self) -> mpsc::Sender<MatchedOrders> {
        let queue_tx = self.queue_tx.clone();
        let mut queue_rx = self.queue_rx.take().expect("Worker already started");

        tokio::spawn(async move {
            info!("Settlement worker started (enabled: {})", self.config.enabled);

            while let Some(matched) = queue_rx.recv().await {
                if !self.config.enabled {
                    info!(
                        "On-chain settlement disabled, skipping trade {}",
                        matched.trade_id
                    );
                    continue;
                }

                match self.settle_matched_orders(&matched).await {
                    Ok(result) => {
                        info!(
                            "Trade {} settled on-chain: tx={:?}, status={:?}",
                            matched.trade_id, result.tx_hash, result.status
                        );

                        // Update database with settlement result
                        if let Err(e) = self.update_trade_settlement(&matched.trade_id, &result).await {
                            error!("Failed to update trade settlement: {}", e);
                        }
                    }
                    Err(e) => {
                        error!("Failed to settle trade {}: {}", matched.trade_id, e);

                        // Mark trade as settlement failed
                        if let Err(e) = self.mark_settlement_failed(&matched.trade_id, &e.to_string()).await {
                            error!("Failed to mark settlement failed: {}", e);
                        }
                    }
                }
            }

            info!("Settlement worker stopped");
        });

        queue_tx
    }

    /// Settle matched orders on-chain
    async fn settle_matched_orders(
        &self,
        matched: &MatchedOrders,
    ) -> Result<SettlementResult, Box<dyn std::error::Error + Send + Sync>> {
        info!(
            "Settling trade {} on-chain: match_type={:?}, maker_fill={}, taker_fill={}",
            matched.trade_id,
            matched.match_type,
            matched.maker_fill_amount,
            matched.taker_fill_amount
        );

        // Convert to on-chain orders
        let maker_order = matched.maker_order.to_onchain_order();
        let taker_order = matched.taker_order.to_onchain_order();

        // Submit to CTFExchange.matchOrders
        let result = self
            .blockchain
            .match_orders(
                &maker_order,
                &taker_order,
                matched.maker_order.signature.clone(),
                matched.taker_order.signature.clone(),
                matched.maker_fill_amount,
                matched.taker_fill_amount,
            )
            .await?;

        let status = match result.status {
            TxStatus::Confirmed => SettlementStatus::Confirmed,
            TxStatus::Failed => SettlementStatus::Failed,
            TxStatus::Pending => SettlementStatus::Submitted,
        };

        Ok(SettlementResult {
            trade_id: matched.trade_id,
            tx_hash: result.tx_hash,
            status,
            block_number: result.block_number,
            gas_used: result.gas_used,
            error: result.error,
        })
    }

    /// Update trade with settlement result
    async fn update_trade_settlement(
        &self,
        trade_id: &uuid::Uuid,
        result: &SettlementResult,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE trades
            SET
                settlement_tx_hash = $1,
                settlement_status = $2,
                settlement_block = $3,
                updated_at = NOW()
            WHERE id = $4
            "#,
        )
        .bind(format!("{:?}", result.tx_hash))
        .bind(format!("{:?}", result.status))
        .bind(result.block_number.map(|b| b as i64))
        .bind(trade_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Mark trade settlement as failed
    async fn mark_settlement_failed(
        &self,
        trade_id: &uuid::Uuid,
        error: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE trades
            SET
                settlement_status = 'failed',
                settlement_error = $1,
                updated_at = NOW()
            WHERE id = $2
            "#,
        )
        .bind(error)
        .bind(trade_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Calculate token ID for a market outcome
    /// This requires calling the ConditionalTokens contract
    pub async fn get_token_id(
        &self,
        condition_id: [u8; 32],
        is_yes: bool,
    ) -> Result<U256, Box<dyn std::error::Error + Send + Sync>> {
        // Get collateral address (USDC)
        let collateral = self.blockchain.addresses().usdc;

        // Calculate collection ID
        // parentCollectionId = 0x0 (no parent)
        let parent_collection_id = [0u8; 32];
        let index_set = TokenIdCalculator::calculate_index_set(is_yes);

        let collection_id = self
            .blockchain
            .get_collection_id(parent_collection_id, condition_id, index_set)
            .await?;

        // Get position ID (token ID)
        let token_id = self
            .blockchain
            .get_position_id(collateral, collection_id)
            .await?;

        Ok(token_id)
    }

    /// Verify that a condition is prepared on-chain
    pub async fn is_condition_prepared(
        &self,
        condition_id: [u8; 32],
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let outcome_count = self.blockchain.get_outcome_slot_count(condition_id).await?;
        Ok(outcome_count > U256::zero())
    }

    // ========================================================================
    // Share Settlement Methods (for market resolution/cancellation)
    // ========================================================================

    /// Settle a user's shares for a resolved or cancelled market
    pub async fn settle_user_shares(
        pool: &PgPool,
        market_id: Uuid,
        user_address: &str,
    ) -> Result<ShareSettlementResult, SettlementError> {
        let user_address = user_address.to_lowercase();

        // 1. Get market status and winning outcome
        let market: Option<(String, Option<Uuid>)> = sqlx::query_as(
            r#"
            SELECT status::text, winning_outcome_id
            FROM markets
            WHERE id = $1
            "#
        )
        .bind(market_id)
        .fetch_optional(pool)
        .await?;

        let (status, winning_outcome_id) = market.ok_or(SettlementError::MarketNotFound(market_id))?;

        // 2. Determine settlement type
        let settlement_type = match status.as_str() {
            "resolved" => {
                if winning_outcome_id.is_none() {
                    return Err(SettlementError::NoWinningOutcome(market_id));
                }
                ShareSettlementType::Resolution
            }
            "cancelled" => ShareSettlementType::Cancellation,
            _ => return Err(SettlementError::MarketNotSettleable(market_id)),
        };

        // 3. Check if user has already settled
        let already_settled: Option<(i64,)> = sqlx::query_as(
            r#"
            SELECT COUNT(*) as count
            FROM share_changes
            WHERE user_address = $1 AND market_id = $2 AND change_type = 'redeem'
            "#
        )
        .bind(&user_address)
        .bind(market_id)
        .fetch_optional(pool)
        .await?;

        if let Some((count,)) = already_settled {
            if count > 0 {
                return Err(SettlementError::AlreadySettled(market_id));
            }
        }

        // 4. Get user's shares for this market
        let shares: Vec<(Uuid, Uuid, String, Decimal, Decimal)> = sqlx::query_as(
            r#"
            SELECT id, outcome_id, share_type::text, amount, avg_cost
            FROM shares
            WHERE user_address = $1 AND market_id = $2 AND amount > 0
            "#
        )
        .bind(&user_address)
        .bind(market_id)
        .fetch_all(pool)
        .await?;

        if shares.is_empty() {
            return Err(SettlementError::NoSharesToSettle(market_id));
        }

        // 5. Calculate payouts and execute settlement
        let mut share_settlements = Vec::new();
        let mut total_payout = Decimal::ZERO;

        // Begin transaction
        let mut tx = pool.begin().await?;

        for (share_id, outcome_id, share_type_str, amount, avg_cost) in shares {
            let share_type: ShareType = share_type_str.parse().unwrap_or(ShareType::Yes);

            let (payout_per_share, share_payout) = match &settlement_type {
                ShareSettlementType::Resolution => {
                    // For resolved markets:
                    // - Winning YES shares pay 1.0 USDC each
                    // - Winning NO shares (when NO wins) pay 1.0 USDC each
                    // - Losing shares pay 0
                    let is_winning = outcome_id == winning_outcome_id.unwrap()
                        && share_type == ShareType::Yes;
                    let is_winning_no = outcome_id != winning_outcome_id.unwrap()
                        && share_type == ShareType::No;

                    if is_winning || is_winning_no {
                        (Decimal::ONE, amount)
                    } else {
                        (Decimal::ZERO, Decimal::ZERO)
                    }
                }
                ShareSettlementType::Cancellation => {
                    // For cancelled markets: refund at avg_cost
                    (avg_cost, amount * avg_cost)
                }
            };

            if amount > Decimal::ZERO {
                // Record share change (redeem)
                sqlx::query(
                    r#"
                    INSERT INTO share_changes (
                        user_address, market_id, outcome_id, share_type,
                        change_type, amount, price, trade_id, order_id
                    )
                    VALUES ($1, $2, $3, $4::share_type, 'redeem', $5, $6, NULL, NULL)
                    "#
                )
                .bind(&user_address)
                .bind(market_id)
                .bind(outcome_id)
                .bind(share_type.to_string())
                .bind(-amount)  // Negative because we're removing shares
                .bind(payout_per_share)
                .execute(&mut *tx)
                .await?;

                // Zero out user's shares
                sqlx::query(
                    r#"
                    UPDATE shares
                    SET amount = 0, updated_at = NOW()
                    WHERE id = $1
                    "#
                )
                .bind(share_id)
                .execute(&mut *tx)
                .await?;

                // Add payout to user's balance
                if share_payout > Decimal::ZERO {
                    sqlx::query(
                        r#"
                        INSERT INTO balances (user_address, token, available, frozen, updated_at)
                        VALUES ($1, 'USDC', $2, 0, NOW())
                        ON CONFLICT (user_address, token)
                        DO UPDATE SET available = balances.available + $2, updated_at = NOW()
                        "#
                    )
                    .bind(&user_address)
                    .bind(share_payout)
                    .execute(&mut *tx)
                    .await?;
                }

                share_settlements.push(ShareSettlement {
                    outcome_id,
                    share_type,
                    amount,
                    payout_per_share,
                    total_payout: share_payout,
                });

                total_payout += share_payout;
            }
        }

        // Commit transaction
        tx.commit().await?;

        info!(
            "Settled shares for user {} in market {}: {} USDC payout",
            user_address, market_id, total_payout
        );

        Ok(ShareSettlementResult {
            market_id,
            user_address,
            settlement_type,
            shares_settled: share_settlements,
            total_payout,
        })
    }

    /// Get settlement status for a user's shares in a market
    pub async fn get_settlement_status(
        pool: &PgPool,
        market_id: Uuid,
        user_address: &str,
    ) -> Result<UserSettlementStatus, SettlementError> {
        let user_address = user_address.to_lowercase();

        // Get market info
        let market: Option<(String, Option<Uuid>)> = sqlx::query_as(
            r#"
            SELECT status::text, winning_outcome_id
            FROM markets
            WHERE id = $1
            "#
        )
        .bind(market_id)
        .fetch_optional(pool)
        .await?;

        let (status, winning_outcome_id) = market.ok_or(SettlementError::MarketNotFound(market_id))?;

        // Check if already settled
        let already_settled: Option<(i64,)> = sqlx::query_as(
            r#"
            SELECT COUNT(*) as count
            FROM share_changes
            WHERE user_address = $1 AND market_id = $2 AND change_type = 'redeem'
            "#
        )
        .bind(&user_address)
        .bind(market_id)
        .fetch_optional(pool)
        .await?;

        let is_settled = already_settled.map(|(c,)| c > 0).unwrap_or(false);

        // Get user's shares and calculate potential payout
        let shares: Vec<(Uuid, String, Decimal, Decimal)> = sqlx::query_as(
            r#"
            SELECT outcome_id, share_type::text, amount, avg_cost
            FROM shares
            WHERE user_address = $1 AND market_id = $2 AND amount > 0
            "#
        )
        .bind(&user_address)
        .bind(market_id)
        .fetch_all(pool)
        .await?;

        let total_shares: Decimal = shares.iter().map(|(_, _, a, _)| *a).sum();

        let potential_payout = if status == "resolved" && winning_outcome_id.is_some() {
            // Calculate payout for winning shares
            shares
                .iter()
                .filter(|(oid, st, _, _)| {
                    let share_type: ShareType = st.parse().unwrap_or(ShareType::Yes);
                    let is_winning = *oid == winning_outcome_id.unwrap() && share_type == ShareType::Yes;
                    let is_winning_no = *oid != winning_outcome_id.unwrap() && share_type == ShareType::No;
                    is_winning || is_winning_no
                })
                .map(|(_, _, a, _)| *a)
                .sum()
        } else if status == "cancelled" {
            // For cancelled markets, refund at avg_cost
            shares.iter().map(|(_, _, a, c)| *a * *c).sum()
        } else {
            Decimal::ZERO
        };

        // Can settle if market is resolved/cancelled, not already settled, and has shares
        let can_settle = !is_settled
            && (status == "resolved" || status == "cancelled")
            && total_shares > Decimal::ZERO;

        Ok(UserSettlementStatus {
            market_id,
            user_address,
            is_settled,
            market_status: status,
            winning_outcome_id,
            total_shares,
            potential_payout,
            can_settle,
            share_count: total_shares,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_index_set_calculation() {
        assert_eq!(TokenIdCalculator::calculate_index_set(true), U256::from(1));
        assert_eq!(TokenIdCalculator::calculate_index_set(false), U256::from(2));
    }
}
