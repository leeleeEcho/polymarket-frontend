//! Settlement types

use ethers::types::{Address, Bytes, H256, U256};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::blockchain::types::{OnChainOrder, OrderSide, SignatureType};
use crate::models::market::ShareType;

// ============================================================================
// Share Settlement Types (for market resolution/cancellation)
// ============================================================================

/// Settlement service errors
#[derive(Debug, thiserror::Error)]
pub enum SettlementError {
    #[error("Market not found: {0}")]
    MarketNotFound(Uuid),

    #[error("Market not resolved or cancelled: {0}")]
    MarketNotSettleable(Uuid),

    #[error("No winning outcome set for market: {0}")]
    NoWinningOutcome(Uuid),

    #[error("User has no shares to settle in market: {0}")]
    NoSharesToSettle(Uuid),

    #[error("Shares already settled for user in market: {0}")]
    AlreadySettled(Uuid),

    #[error("Database error: {0}")]
    DatabaseError(#[from] sqlx::Error),
}

/// Result of a share settlement operation
#[derive(Debug, Clone)]
pub struct ShareSettlementResult {
    pub market_id: Uuid,
    #[allow(dead_code)]
    pub user_address: String,
    pub settlement_type: ShareSettlementType,
    pub shares_settled: Vec<ShareSettlement>,
    pub total_payout: Decimal,
}

/// Type of share settlement
#[derive(Debug, Clone, PartialEq)]
pub enum ShareSettlementType {
    /// Market resolved with a winning outcome
    Resolution,
    /// Market was cancelled
    Cancellation,
}

/// Individual share settlement details
#[derive(Debug, Clone)]
pub struct ShareSettlement {
    pub outcome_id: Uuid,
    pub share_type: ShareType,
    pub amount: Decimal,
    pub payout_per_share: Decimal,
    pub total_payout: Decimal,
}

/// Settlement status for a user's shares in a market
#[derive(Debug, Clone)]
pub struct UserSettlementStatus {
    pub market_id: Uuid,
    pub user_address: String,
    pub is_settled: bool,
    pub market_status: String,
    pub winning_outcome_id: Option<Uuid>,
    pub total_shares: Decimal,
    pub potential_payout: Decimal,
    /// Whether the user can settle (market resolved/cancelled and has shares)
    pub can_settle: bool,
    /// Alias for total_shares
    pub share_count: Decimal,
}

/// Type alias for backwards compatibility
pub type SettlementType = ShareSettlementType;

// ============================================================================
// On-Chain Trade Settlement Types (for CTFExchange matchOrders)
// ============================================================================

/// Signed order from user (Polymarket format)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedOrder {
    // Order identifiers (internal)
    pub order_id: Uuid,
    pub market_id: Uuid,
    pub outcome_id: Uuid,

    // On-chain order fields
    pub maker: Address,
    pub taker: Address,
    pub token_id: U256,
    pub maker_amount: U256,
    pub taker_amount: U256,
    pub expiration: U256,
    pub nonce: U256,
    pub fee_rate_bps: U256,
    pub side: OrderSide,
    pub sig_type: SignatureType,

    // Signature
    pub signature: Bytes,
}

impl SignedOrder {
    /// Convert to OnChainOrder for blockchain submission
    pub fn to_onchain_order(&self) -> OnChainOrder {
        OnChainOrder {
            maker: self.maker,
            taker: self.taker,
            token_id: self.token_id,
            maker_amount: self.maker_amount,
            taker_amount: self.taker_amount,
            expiration: self.expiration,
            nonce: self.nonce,
            fee_rate_bps: self.fee_rate_bps,
            side: self.side,
            sig_type: self.sig_type,
        }
    }
}

/// Matched orders ready for settlement
#[derive(Debug, Clone)]
pub struct MatchedOrders {
    pub trade_id: Uuid,
    pub maker_order: SignedOrder,
    pub taker_order: SignedOrder,
    pub maker_fill_amount: U256,
    pub taker_fill_amount: U256,
    pub match_type: MatchType,
}

/// Match type (Normal/Mint/Merge)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MatchType {
    Normal,
    Mint,
    Merge,
}

/// Settlement result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettlementResult {
    pub trade_id: Uuid,
    pub tx_hash: H256,
    pub status: SettlementStatus,
    pub block_number: Option<u64>,
    pub gas_used: Option<U256>,
    pub error: Option<String>,
}

/// Settlement status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SettlementStatus {
    Pending,
    Submitted,
    Confirmed,
    Failed,
}

/// Settlement configuration
#[derive(Debug, Clone)]
pub struct SettlementConfig {
    /// Whether on-chain settlement is enabled
    pub enabled: bool,
    /// Maximum gas price (in gwei) to use for settlement
    pub max_gas_price_gwei: u64,
    /// Number of confirmations to wait for
    pub confirmations: u64,
    /// Retry attempts for failed settlements
    pub max_retries: u32,
    /// Delay between retries (in seconds)
    pub retry_delay_secs: u64,
}

impl Default for SettlementConfig {
    fn default() -> Self {
        Self {
            enabled: false, // Disabled by default, enable when ready
            max_gas_price_gwei: 100,
            confirmations: 2,
            max_retries: 3,
            retry_delay_secs: 5,
        }
    }
}

/// Token ID calculation helper
pub struct TokenIdCalculator;

impl TokenIdCalculator {
    /// Calculate token ID from condition and index set
    /// tokenId = getPositionId(collateral, getCollectionId(parentCollectionId, conditionId, indexSet))
    /// For Yes outcome: indexSet = 1 (binary 01)
    /// For No outcome: indexSet = 2 (binary 10)
    pub fn calculate_index_set(is_yes: bool) -> U256 {
        if is_yes {
            U256::from(1)
        } else {
            U256::from(2)
        }
    }
}
