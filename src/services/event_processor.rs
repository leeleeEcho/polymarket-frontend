//! Event Processor Service
//!
//! Processes blockchain events and syncs state to the database.
//! - Syncs on-chain balances (USDC, CTF positions)
//! - Updates trade settlement status
//! - Tracks condition preparation/resolution
//! - Pushes updates via WebSocket

use std::sync::Arc;

use ethers::types::{Address, H256, U256};
use rust_decimal::Decimal;
use sqlx::PgPool;
use tokio::sync::{broadcast, mpsc};
use tracing::{error, info, warn};

use crate::blockchain::events::{BlockchainEvent, EventListener};
use crate::blockchain::types::ContractAddresses;
use crate::BalanceUpdateEvent;

/// Event processor configuration
#[derive(Debug, Clone)]
pub struct EventProcessorConfig {
    /// Whether to process events
    pub enabled: bool,
    /// Starting block for event scanning
    pub start_block: u64,
    /// Vault address for deposit/withdrawal tracking
    pub vault_address: Address,
}

impl Default for EventProcessorConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            start_block: 0,
            vault_address: Address::zero(),
        }
    }
}

/// Event processor service
pub struct EventProcessor {
    pool: PgPool,
    config: EventProcessorConfig,
    addresses: ContractAddresses,
    balance_sender: broadcast::Sender<BalanceUpdateEvent>,
}

impl EventProcessor {
    /// Create a new event processor
    pub fn new(
        pool: PgPool,
        config: EventProcessorConfig,
        addresses: ContractAddresses,
        balance_sender: broadcast::Sender<BalanceUpdateEvent>,
    ) -> Self {
        Self {
            pool,
            config,
            addresses,
            balance_sender,
        }
    }

    /// Start the event processor
    /// This spawns a background task that listens for events
    pub fn start(
        self,
        event_listener: Arc<EventListener>,
    ) -> mpsc::Sender<BlockchainEvent> {
        let (tx, mut rx) = mpsc::channel::<BlockchainEvent>(1000);

        // Spawn the event listener
        let tx_clone = tx.clone();
        let listener = event_listener.clone();
        tokio::spawn(async move {
            info!("Event listener starting...");
            if let Err(e) = listener.start(tx_clone).await {
                error!("Event listener error: {}", e);
            }
        });

        // Spawn the event processor
        tokio::spawn(async move {
            info!(
                "Event processor started (enabled: {}, from_block: {})",
                self.config.enabled, self.config.start_block
            );

            while let Some(event) = rx.recv().await {
                if !self.config.enabled {
                    continue;
                }

                if let Err(e) = self.process_event(event).await {
                    error!("Failed to process event: {}", e);
                }
            }

            warn!("Event processor stopped");
        });

        tx
    }

    /// Process a single blockchain event
    async fn process_event(
        &self,
        event: BlockchainEvent,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        match event {
            BlockchainEvent::USDCTransfer {
                from,
                to,
                amount,
                tx_hash,
                block_number,
            } => {
                self.handle_usdc_transfer(from, to, amount, tx_hash, block_number)
                    .await?;
            }
            BlockchainEvent::OrderFilled(event) => {
                self.handle_order_filled(event).await?;
            }
            BlockchainEvent::Trade(event) => {
                self.handle_trade(event).await?;
            }
            BlockchainEvent::PositionSplit(event) => {
                self.handle_position_split(event).await?;
            }
            BlockchainEvent::PositionMerged(event) => {
                self.handle_position_merge(event).await?;
            }
            BlockchainEvent::ConditionPrepared(event) => {
                self.handle_condition_prepared(event).await?;
            }
            BlockchainEvent::ConditionResolved(event) => {
                self.handle_condition_resolved(event).await?;
            }
            BlockchainEvent::NewBlock { number, hash } => {
                // Just log for now, could be used for confirmations
                info!("New block: {} ({})", number, hash);
            }
        }

        Ok(())
    }

    /// Handle USDC transfer events (deposits/withdrawals)
    async fn handle_usdc_transfer(
        &self,
        from: Address,
        to: Address,
        amount: U256,
        tx_hash: H256,
        block_number: u64,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let amount_decimal = u256_to_decimal(amount);
        let tx_hash_str = format!("{:?}", tx_hash);

        // Check if this is a deposit to CTFExchange
        if to == self.addresses.ctf_exchange {
            let user_address = format!("{:?}", from).to_lowercase();
            info!(
                "Deposit detected: {} USDC from {} (block {})",
                amount_decimal, user_address, block_number
            );

            // Update or insert balance
            self.upsert_balance(&user_address, "USDC", amount_decimal)
                .await?;

            // Record deposit in history
            sqlx::query(
                r#"
                INSERT INTO deposits (user_address, amount, tx_hash, status, created_at)
                VALUES ($1, $2, $3, 'confirmed', NOW())
                ON CONFLICT (tx_hash) DO NOTHING
                "#,
            )
            .bind(&user_address)
            .bind(amount_decimal)
            .bind(&tx_hash_str)
            .execute(&self.pool)
            .await?;

            // Push balance update
            self.push_balance_update(&user_address, "USDC", "deposit")
                .await?;
        }

        // Check if this is a withdrawal from CTFExchange
        if from == self.addresses.ctf_exchange {
            let user_address = format!("{:?}", to).to_lowercase();
            info!(
                "Withdrawal detected: {} USDC to {} (block {})",
                amount_decimal, user_address, block_number
            );

            // Update withdrawal status
            sqlx::query(
                r#"
                UPDATE withdrawals
                SET status = 'completed', tx_hash = $1, completed_at = NOW()
                WHERE user_address = $2 AND amount = $3 AND status = 'processing'
                "#,
            )
            .bind(&tx_hash_str)
            .bind(&user_address)
            .bind(amount_decimal)
            .execute(&self.pool)
            .await?;

            // Push balance update
            self.push_balance_update(&user_address, "USDC", "withdrawal")
                .await?;
        }

        Ok(())
    }

    /// Handle order filled events
    async fn handle_order_filled(
        &self,
        event: crate::blockchain::types::OrderFilledEvent,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let tx_hash_str = format!("{:?}", event.tx_hash);
        let order_hash_str = format!("0x{}", hex::encode(event.order_hash));

        info!(
            "Order filled: {} (tx: {}, block: {})",
            order_hash_str, tx_hash_str, event.block_number
        );

        // Update trade settlement status by tx_hash
        sqlx::query(
            r#"
            UPDATE trades
            SET settlement_status = 'confirmed',
                settlement_tx_hash = $1,
                settlement_block = $2,
                settled_at = NOW(),
                updated_at = NOW()
            WHERE settlement_tx_hash = $1 OR settlement_status = 'submitted'
            "#,
        )
        .bind(&tx_hash_str)
        .bind(event.block_number as i64)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Handle trade events from CTFExchange
    async fn handle_trade(
        &self,
        event: crate::blockchain::types::TradeEvent,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let tx_hash_str = format!("{:?}", event.tx_hash);
        let maker_address = format!("{:?}", event.maker).to_lowercase();
        let taker_address = format!("{:?}", event.taker).to_lowercase();
        let amount = u256_to_decimal(event.amount);
        let price = u256_to_decimal(event.price);

        info!(
            "On-chain trade: {} @ {} (maker: {}, taker: {}, type: {:?})",
            amount, price, maker_address, taker_address, event.match_type
        );

        // Record on-chain trade if not already exists
        sqlx::query(
            r#"
            INSERT INTO onchain_trades (
                token_id, maker_address, taker_address, price, amount,
                taker_side, match_type, tx_hash, block_number, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (tx_hash) DO NOTHING
            "#,
        )
        .bind(event.token_id.to_string())
        .bind(&maker_address)
        .bind(&taker_address)
        .bind(price)
        .bind(amount)
        .bind(format!("{:?}", event.taker_side))
        .bind(format!("{:?}", event.match_type))
        .bind(&tx_hash_str)
        .bind(event.block_number as i64)
        .execute(&self.pool)
        .await?;

        // Update balances for both parties
        self.push_balance_update(&maker_address, "USDC", "trade")
            .await?;
        self.push_balance_update(&taker_address, "USDC", "trade")
            .await?;

        Ok(())
    }

    /// Handle position split (minting) events
    async fn handle_position_split(
        &self,
        event: crate::blockchain::types::PositionSplitEvent,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let user_address = format!("{:?}", event.stakeholder).to_lowercase();
        let amount = u256_to_decimal(event.amount);
        let condition_id = format!("0x{}", hex::encode(event.condition_id));

        info!(
            "Position split: {} tokens for condition {} by {}",
            amount, condition_id, user_address
        );

        // Record position mint
        sqlx::query(
            r#"
            INSERT INTO position_changes (
                user_address, condition_id, change_type, amount,
                tx_hash, block_number, created_at
            )
            VALUES ($1, $2, 'mint', $3, $4, $5, NOW())
            "#,
        )
        .bind(&user_address)
        .bind(&condition_id)
        .bind(amount)
        .bind(format!("{:?}", event.tx_hash))
        .bind(event.block_number as i64)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Handle position merge (burning) events
    async fn handle_position_merge(
        &self,
        event: crate::blockchain::types::PositionMergeEvent,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let user_address = format!("{:?}", event.stakeholder).to_lowercase();
        let amount = u256_to_decimal(event.amount);
        let condition_id = format!("0x{}", hex::encode(event.condition_id));

        info!(
            "Position merge: {} tokens for condition {} by {}",
            amount, condition_id, user_address
        );

        // Record position burn
        sqlx::query(
            r#"
            INSERT INTO position_changes (
                user_address, condition_id, change_type, amount,
                tx_hash, block_number, created_at
            )
            VALUES ($1, $2, 'burn', $3, $4, $5, NOW())
            "#,
        )
        .bind(&user_address)
        .bind(&condition_id)
        .bind(-amount) // Negative for burn
        .bind(format!("{:?}", event.tx_hash))
        .bind(event.block_number as i64)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Handle condition prepared events
    async fn handle_condition_prepared(
        &self,
        event: crate::blockchain::types::ConditionPreparationEvent,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let condition_id = format!("0x{}", hex::encode(event.condition_id));
        let question_id = format!("0x{}", hex::encode(event.question_id));
        let oracle_address = format!("{:?}", event.oracle).to_lowercase();

        info!(
            "Condition prepared: {} (oracle: {}, outcomes: {})",
            condition_id,
            oracle_address,
            event.outcome_slot_count
        );

        // Update market with condition ID
        sqlx::query(
            r#"
            UPDATE markets
            SET condition_id = $1, condition_prepared = true, updated_at = NOW()
            WHERE question_id = $2
            "#,
        )
        .bind(&condition_id)
        .bind(&question_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Handle condition resolved events
    async fn handle_condition_resolved(
        &self,
        event: crate::blockchain::types::ConditionResolutionEvent,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let condition_id = format!("0x{}", hex::encode(event.condition_id));
        let question_id = format!("0x{}", hex::encode(event.question_id));

        info!(
            "Condition resolved: {} (payouts: {:?})",
            condition_id, event.payout_numerators
        );

        // Determine winning outcome based on payouts
        // Payout [1, 0] means outcome 0 wins (Yes)
        // Payout [0, 1] means outcome 1 wins (No)
        let winning_index = event
            .payout_numerators
            .iter()
            .position(|p| *p > U256::zero());

        if let Some(idx) = winning_index {
            // Update market as resolved
            sqlx::query(
                r#"
                UPDATE markets
                SET status = 'resolved',
                    resolved_at = NOW(),
                    resolution_tx_hash = $1,
                    updated_at = NOW()
                WHERE condition_id = $2 OR question_id = $3
                "#,
            )
            .bind(format!("{:?}", event.tx_hash))
            .bind(&condition_id)
            .bind(&question_id)
            .execute(&self.pool)
            .await?;

            info!("Market resolved: winning outcome index = {}", idx);
        }

        Ok(())
    }

    /// Upsert user balance
    async fn upsert_balance(
        &self,
        user_address: &str,
        token: &str,
        amount: Decimal,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        sqlx::query(
            r#"
            INSERT INTO balances (user_address, token, available, frozen, updated_at)
            VALUES ($1, $2, $3, 0, NOW())
            ON CONFLICT (user_address, token)
            DO UPDATE SET available = balances.available + $3, updated_at = NOW()
            "#,
        )
        .bind(user_address)
        .bind(token)
        .bind(amount)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Push balance update via WebSocket
    async fn push_balance_update(
        &self,
        user_address: &str,
        token: &str,
        event_type: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Get current balance
        let balance: Option<(Decimal, Decimal)> = sqlx::query_as(
            "SELECT available, frozen FROM balances WHERE user_address = $1 AND token = $2",
        )
        .bind(user_address)
        .bind(token)
        .fetch_optional(&self.pool)
        .await?;

        if let Some((available, frozen)) = balance {
            let total = available + frozen;
            let _ = self.balance_sender.send(BalanceUpdateEvent {
                user_address: user_address.to_string(),
                token: token.to_string(),
                available: available.to_string(),
                frozen: frozen.to_string(),
                total: total.to_string(),
                event_type: event_type.to_string(),
            });
        }

        Ok(())
    }
}

/// Convert U256 to Decimal (assuming 6 decimals for USDC)
fn u256_to_decimal(value: U256) -> Decimal {
    let raw = value.as_u128();
    Decimal::new(raw as i64, 6)
}

/// Create migration for on-chain tracking tables
pub fn get_migration_sql() -> &'static str {
    r#"
    -- On-chain trades tracking
    CREATE TABLE IF NOT EXISTS onchain_trades (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token_id VARCHAR(78) NOT NULL,
        maker_address VARCHAR(42) NOT NULL,
        taker_address VARCHAR(42) NOT NULL,
        price DECIMAL(20, 8) NOT NULL,
        amount DECIMAL(20, 8) NOT NULL,
        taker_side VARCHAR(10) NOT NULL,
        match_type VARCHAR(10) NOT NULL,
        tx_hash VARCHAR(66) UNIQUE NOT NULL,
        block_number BIGINT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_onchain_trades_maker ON onchain_trades(maker_address);
    CREATE INDEX IF NOT EXISTS idx_onchain_trades_taker ON onchain_trades(taker_address);
    CREATE INDEX IF NOT EXISTS idx_onchain_trades_block ON onchain_trades(block_number);

    -- Position changes tracking
    CREATE TABLE IF NOT EXISTS position_changes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_address VARCHAR(42) NOT NULL,
        condition_id VARCHAR(66) NOT NULL,
        change_type VARCHAR(10) NOT NULL,
        amount DECIMAL(20, 8) NOT NULL,
        tx_hash VARCHAR(66) NOT NULL,
        block_number BIGINT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_position_changes_user ON position_changes(user_address);
    CREATE INDEX IF NOT EXISTS idx_position_changes_condition ON position_changes(condition_id);

    -- Add condition tracking to markets
    ALTER TABLE markets
    ADD COLUMN IF NOT EXISTS condition_prepared BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS resolution_tx_hash VARCHAR(66);
    "#
}
