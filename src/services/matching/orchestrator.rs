//! Order Flow Orchestrator
//!
//! Orchestrates the complete order processing flow for prediction markets:
//! 1. Receive order from API
//! 2. Execute matching via MatchingEngine
//! 3. Process match results (including Mint/Merge logic)
//! 4. Update share positions
//! 5. Persist to database asynchronously
//! 6. Broadcast updates via WebSocket

#![allow(dead_code)]

use super::engine::MatchingEngine;
use super::types::*;
use crate::models::market::ShareType;
use rust_decimal::Decimal;
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// Order flow orchestrator for prediction markets
///
/// Connects matching engine with database persistence and WebSocket broadcasting.
/// All database operations are async and non-blocking.
pub struct OrderFlowOrchestrator {
    /// The matching engine
    engine: Arc<MatchingEngine>,

    /// Database connection pool
    pool: PgPool,

    /// Trade event receiver for persistence
    trade_receiver: Option<broadcast::Receiver<TradeEvent>>,
}

impl OrderFlowOrchestrator {
    /// Create a new orchestrator
    pub fn new(engine: Arc<MatchingEngine>, pool: PgPool) -> Self {
        let trade_receiver = Some(engine.subscribe_trades());

        info!("OrderFlowOrchestrator initialized");

        Self {
            engine,
            pool,
            trade_receiver,
        }
    }

    /// Get reference to matching engine
    pub fn engine(&self) -> &Arc<MatchingEngine> {
        &self.engine
    }

    /// Start the background persistence worker
    pub fn start_persistence_worker(mut self) -> Arc<MatchingEngine> {
        let pool = self.pool.clone();
        let engine = Arc::clone(&self.engine);
        let receiver = self.trade_receiver.take();

        if let Some(mut rx) = receiver {
            tokio::spawn(async move {
                info!("Trade persistence worker started");

                loop {
                    match rx.recv().await {
                        Ok(trade) => {
                            if let Err(e) = Self::persist_trade(&pool, &trade).await {
                                error!("Failed to persist trade: {}", e);
                            }
                        }
                        Err(broadcast::error::RecvError::Lagged(n)) => {
                            warn!("Trade persistence lagged {} messages", n);
                        }
                        Err(broadcast::error::RecvError::Closed) => {
                            info!("Trade channel closed, stopping persistence worker");
                            break;
                        }
                    }
                }
            });
        }

        engine
    }

    /// Process a new order for prediction market
    pub async fn process_order(
        &self,
        market_id: Uuid,
        outcome_id: Uuid,
        share_type: ShareType,
        user_address: &str,
        side: Side,
        order_type: OrderType,
        amount: Decimal,
        price: Decimal,
    ) -> Result<MatchResult, MatchingError> {
        debug!(
            "Processing order: market={}, outcome={}, share_type={:?}, user={}, side={:?}, type={:?}, amount={}, price={}",
            market_id, outcome_id, share_type, user_address, side, order_type, amount, price
        );

        // Validate price range (0 < price < 1)
        if price <= Decimal::ZERO || price >= Decimal::ONE {
            return Err(MatchingError::InvalidPrice(format!(
                "Price must be between 0 and 1, got {}",
                price
            )));
        }

        // Generate order ID
        let order_id = Uuid::new_v4();

        // Build market key for orderbook: market_id:outcome_id:share_type
        let market_key = format!("{}:{}:{}", market_id, outcome_id, share_type);

        // Submit to matching engine (use market_key as "symbol" and leverage=1 for prediction markets)
        let result = self.engine.submit_order(
            order_id,
            &market_key,
            user_address,
            side,
            order_type,
            amount,
            Some(price),
            1, // No leverage in prediction markets
        )?;

        // Spawn async task for database persistence
        let pool = self.pool.clone();
        let user_address = user_address.to_string();
        let result_clone = result.clone();
        let share_type_clone = share_type.clone();

        tokio::spawn(async move {
            if let Err(e) = Self::persist_order(
                &pool,
                market_id,
                outcome_id,
                share_type_clone,
                &user_address,
                &result_clone,
                side,
                order_type,
                amount,
                price,
            ).await {
                error!("Failed to persist order {}: {}", order_id, e);
            }
        });

        info!(
            "Order processed: id={}, status={:?}, filled={}",
            result.order_id, result.status, result.filled_amount
        );

        Ok(result)
    }

    /// Cancel an order
    pub async fn cancel_order(
        &self,
        market_id: Uuid,
        outcome_id: Uuid,
        share_type: ShareType,
        order_id: Uuid,
        user_address: &str,
    ) -> Result<bool, MatchingError> {
        debug!("Cancelling order: id={}, market={}", order_id, market_id);

        // Build market key for orderbook
        let market_key = format!("{}:{}:{}", market_id, outcome_id, share_type);

        // Cancel in matching engine
        let cancelled = self.engine.cancel_order(&market_key, order_id, user_address)?;

        if cancelled {
            // Update database asynchronously
            let pool = self.pool.clone();

            tokio::spawn(async move {
                if let Err(e) = Self::update_order_status(&pool, order_id, "cancelled").await {
                    error!("Failed to update order status: {}", e);
                }
            });

            info!("Order cancelled: id={}", order_id);
        }

        Ok(cancelled)
    }

    /// Get orderbook for an outcome
    pub fn get_orderbook(
        &self,
        market_id: Uuid,
        outcome_id: Uuid,
        share_type: ShareType,
        depth: usize,
    ) -> Result<OrderbookSnapshot, MatchingError> {
        // Build market key for orderbook
        let market_key = format!("{}:{}:{}", market_id, outcome_id, share_type);
        self.engine.get_orderbook(&market_key, depth)
    }

    /// Get trade history
    pub fn get_trades(&self, market_id: Uuid, query: &TradeHistoryQuery) -> TradeHistoryResponse {
        // Use market_id as the symbol prefix for trade lookup
        self.engine.get_trades(&market_id.to_string(), query)
    }

    /// Get order history
    pub fn get_orders(&self, user_address: &str, query: &OrderHistoryQuery) -> OrderHistoryResponse {
        self.engine.get_orders(user_address, query)
    }

    // ========================================================================
    // Database Persistence
    // ========================================================================

    /// Persist a trade to database and update share positions
    pub async fn persist_trade(pool: &PgPool, trade: &TradeEvent) -> Result<(), sqlx::Error> {
        // Use the fees calculated by the matching engine
        let maker_fee = trade.maker_fee;
        let taker_fee = trade.taker_fee;
        let _trade_value = trade.amount * trade.price;

        // 1. Save trade record
        sqlx::query(
            r#"
            INSERT INTO trades (
                id, symbol, market_id, outcome_id, share_type, match_type,
                maker_order_id, taker_order_id, maker_address, taker_address,
                side, price, amount, maker_fee, taker_fee, created_at
            )
            VALUES (
                $1, $2, $3, $4, $5::share_type, $6::match_type,
                $7, $8, $9, $10,
                $11::order_side, $12, $13, $14, $15, to_timestamp($16::double precision / 1000)
            )
            ON CONFLICT (id) DO NOTHING
            "#
        )
        .bind(trade.trade_id)
        .bind(&trade.symbol)
        .bind(trade.market_id)
        .bind(trade.outcome_id)
        .bind(trade.share_type.to_string())
        .bind(trade.match_type.to_string())
        .bind(trade.maker_order_id)
        .bind(trade.taker_order_id)
        .bind(&trade.maker_address)
        .bind(&trade.taker_address)
        .bind(trade.side.to_string())
        .bind(trade.price)
        .bind(trade.amount)
        .bind(maker_fee)
        .bind(taker_fee)
        .bind(trade.timestamp as f64)
        .execute(pool)
        .await?;

        debug!("Persisted trade: {} (match_type={:?})", trade.trade_id, trade.match_type);

        // 2. Update share positions based on match type
        match trade.match_type {
            MatchType::Normal => {
                // Normal trade: transfer shares between maker and taker
                Self::update_shares_normal(pool, trade).await?;
            }
            MatchType::Mint => {
                // Mint: both parties receive new shares
                Self::update_shares_mint(pool, trade).await?;
            }
            MatchType::Merge => {
                // Merge: both parties redeem shares for collateral
                Self::update_shares_merge(pool, trade).await?;
            }
        }

        // 3. Record share changes for audit trail
        Self::record_share_changes(pool, trade).await?;

        debug!("Updated share positions for trade: {}", trade.trade_id);
        Ok(())
    }

    /// Update shares for normal trade (transfer between parties)
    async fn update_shares_normal(pool: &PgPool, trade: &TradeEvent) -> Result<(), sqlx::Error> {
        // Determine buyer and seller based on taker's side
        let is_buy = trade.side.to_lowercase() == "buy";
        let (buyer_address, seller_address) = if is_buy {
            (&trade.taker_address, &trade.maker_address)
        } else {
            (&trade.maker_address, &trade.taker_address)
        };

        // Decrease seller's shares
        sqlx::query(
            r#"
            INSERT INTO shares (user_address, market_id, outcome_id, share_type, amount, avg_cost)
            VALUES ($1, $2, $3, $4::share_type, -$5, $6)
            ON CONFLICT (user_address, outcome_id) DO UPDATE SET
                amount = shares.amount - $5,
                updated_at = NOW()
            "#
        )
        .bind(seller_address)
        .bind(trade.market_id)
        .bind(trade.outcome_id)
        .bind(trade.share_type.to_string())
        .bind(trade.amount)
        .bind(trade.price)
        .execute(pool)
        .await?;

        // Increase buyer's shares
        sqlx::query(
            r#"
            INSERT INTO shares (user_address, market_id, outcome_id, share_type, amount, avg_cost)
            VALUES ($1, $2, $3, $4::share_type, $5, $6)
            ON CONFLICT (user_address, outcome_id) DO UPDATE SET
                amount = shares.amount + $5,
                avg_cost = (shares.avg_cost * shares.amount + $6 * $5) / (shares.amount + $5),
                updated_at = NOW()
            "#
        )
        .bind(buyer_address)
        .bind(trade.market_id)
        .bind(trade.outcome_id)
        .bind(trade.share_type.to_string())
        .bind(trade.amount)
        .bind(trade.price)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Update shares for mint trade (create new shares)
    async fn update_shares_mint(pool: &PgPool, trade: &TradeEvent) -> Result<(), sqlx::Error> {
        // Both parties are buyers - each gets shares of their respective type
        // Maker gets shares of the complement type (since match was cross-outcome)
        let maker_share_type = trade.share_type.complement();
        let taker_share_type = trade.share_type.clone();

        // Maker gets complement shares
        sqlx::query(
            r#"
            INSERT INTO shares (user_address, market_id, outcome_id, share_type, amount, avg_cost)
            VALUES ($1, $2, $3, $4::share_type, $5, $6)
            ON CONFLICT (user_address, outcome_id) DO UPDATE SET
                amount = shares.amount + $5,
                avg_cost = (shares.avg_cost * shares.amount + $6 * $5) / (shares.amount + $5),
                updated_at = NOW()
            "#
        )
        .bind(&trade.maker_address)
        .bind(trade.market_id)
        .bind(trade.outcome_id)
        .bind(maker_share_type.to_string())
        .bind(trade.amount)
        .bind(Decimal::ONE - trade.price)  // Complement price
        .execute(pool)
        .await?;

        // Taker gets taker's share type
        sqlx::query(
            r#"
            INSERT INTO shares (user_address, market_id, outcome_id, share_type, amount, avg_cost)
            VALUES ($1, $2, $3, $4::share_type, $5, $6)
            ON CONFLICT (user_address, outcome_id) DO UPDATE SET
                amount = shares.amount + $5,
                avg_cost = (shares.avg_cost * shares.amount + $6 * $5) / (shares.amount + $5),
                updated_at = NOW()
            "#
        )
        .bind(&trade.taker_address)
        .bind(trade.market_id)
        .bind(trade.outcome_id)
        .bind(taker_share_type.to_string())
        .bind(trade.amount)
        .bind(trade.price)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Update shares for merge trade (redeem shares for collateral)
    async fn update_shares_merge(pool: &PgPool, trade: &TradeEvent) -> Result<(), sqlx::Error> {
        // Both parties are sellers - each loses shares, gets collateral back
        let maker_share_type = trade.share_type.complement();
        let taker_share_type = trade.share_type.clone();

        // Decrease maker's shares
        sqlx::query(
            r#"
            INSERT INTO shares (user_address, market_id, outcome_id, share_type, amount, avg_cost)
            VALUES ($1, $2, $3, $4::share_type, -$5, 0)
            ON CONFLICT (user_address, outcome_id) DO UPDATE SET
                amount = shares.amount - $5,
                updated_at = NOW()
            "#
        )
        .bind(&trade.maker_address)
        .bind(trade.market_id)
        .bind(trade.outcome_id)
        .bind(maker_share_type.to_string())
        .bind(trade.amount)
        .execute(pool)
        .await?;

        // Decrease taker's shares
        sqlx::query(
            r#"
            INSERT INTO shares (user_address, market_id, outcome_id, share_type, amount, avg_cost)
            VALUES ($1, $2, $3, $4::share_type, -$5, 0)
            ON CONFLICT (user_address, outcome_id) DO UPDATE SET
                amount = shares.amount - $5,
                updated_at = NOW()
            "#
        )
        .bind(&trade.taker_address)
        .bind(trade.market_id)
        .bind(trade.outcome_id)
        .bind(taker_share_type.to_string())
        .bind(trade.amount)
        .execute(pool)
        .await?;

        // TODO: Credit collateral back to both parties' balances
        // This should be done through the balance service

        Ok(())
    }

    /// Record share changes for audit trail
    async fn record_share_changes(pool: &PgPool, trade: &TradeEvent) -> Result<(), sqlx::Error> {
        let change_type = match trade.match_type {
            MatchType::Normal => if trade.side.to_lowercase() == "buy" { "buy" } else { "sell" },
            MatchType::Mint => "mint",
            MatchType::Merge => "merge",
        };

        // Record maker change
        sqlx::query(
            r#"
            INSERT INTO share_changes (
                user_address, market_id, outcome_id, share_type,
                change_type, amount, price, trade_id, order_id
            )
            VALUES ($1, $2, $3, $4::share_type, $5, $6, $7, $8, $9)
            "#
        )
        .bind(&trade.maker_address)
        .bind(trade.market_id)
        .bind(trade.outcome_id)
        .bind(trade.share_type.to_string())
        .bind(change_type)
        .bind(trade.amount)
        .bind(trade.price)
        .bind(trade.trade_id)
        .bind(trade.maker_order_id)
        .execute(pool)
        .await?;

        // Record taker change
        sqlx::query(
            r#"
            INSERT INTO share_changes (
                user_address, market_id, outcome_id, share_type,
                change_type, amount, price, trade_id, order_id
            )
            VALUES ($1, $2, $3, $4::share_type, $5, $6, $7, $8, $9)
            "#
        )
        .bind(&trade.taker_address)
        .bind(trade.market_id)
        .bind(trade.outcome_id)
        .bind(trade.share_type.to_string())
        .bind(change_type)
        .bind(trade.amount)
        .bind(trade.price)
        .bind(trade.trade_id)
        .bind(trade.taker_order_id)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Persist an order to database
    async fn persist_order(
        pool: &PgPool,
        market_id: Uuid,
        outcome_id: Uuid,
        share_type: ShareType,
        user_address: &str,
        result: &MatchResult,
        side: Side,
        order_type: OrderType,
        amount: Decimal,
        price: Decimal,
    ) -> Result<(), sqlx::Error> {
        let status = match result.status {
            OrderStatus::Open => "open",
            OrderStatus::PartiallyFilled => "partially_filled",
            OrderStatus::Filled => "filled",
            OrderStatus::Cancelled => "cancelled",
            OrderStatus::Rejected => "rejected",
        };

        sqlx::query(
            r#"
            INSERT INTO orders (
                id, market_id, outcome_id, share_type, user_address,
                side, order_type, status, price, amount, filled_amount, created_at
            )
            VALUES (
                $1, $2, $3, $4::share_type, $5,
                $6::order_side, $7::order_type, $8::order_status, $9, $10, $11, NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                status = $8::order_status,
                filled_amount = $11,
                updated_at = NOW()
            "#
        )
        .bind(result.order_id)
        .bind(market_id)
        .bind(outcome_id)
        .bind(share_type.to_string())
        .bind(user_address)
        .bind(side.to_string())
        .bind(order_type.to_string())
        .bind(status)
        .bind(price)
        .bind(amount)
        .bind(result.filled_amount)
        .execute(pool)
        .await?;

        // Update maker orders if there were trades
        for trade in &result.trades {
            sqlx::query(
                r#"
                UPDATE orders
                SET filled_amount = filled_amount + $1,
                    status = CASE
                        WHEN filled_amount + $1 >= amount THEN 'filled'::order_status
                        ELSE 'partially_filled'::order_status
                    END,
                    updated_at = NOW()
                WHERE id = $2
                "#
            )
            .bind(trade.amount)
            .bind(trade.maker_order_id)
            .execute(pool)
            .await?;
        }

        debug!("Persisted order: {}", result.order_id);
        Ok(())
    }

    /// Update order status
    async fn update_order_status(pool: &PgPool, order_id: Uuid, status: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE orders
            SET status = $1::order_status, updated_at = NOW()
            WHERE id = $2
            "#
        )
        .bind(status)
        .bind(order_id)
        .execute(pool)
        .await?;

        debug!("Updated order status: id={}, status={}", order_id, status);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    // Integration tests would require a database connection
}
