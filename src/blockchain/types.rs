//! Blockchain types and structures

use ethers::types::{Address, H256, U256};
use serde::{Deserialize, Serialize};

/// Order side (BUY or SELL)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum OrderSide {
    Buy = 0,
    Sell = 1,
}

/// Signature type for order verification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum SignatureType {
    EOA = 0,
    PolyProxy = 1,
    PolyGnosisSafe = 2,
}

impl From<u8> for SignatureType {
    fn from(v: u8) -> Self {
        match v {
            0 => SignatureType::EOA,
            1 => SignatureType::PolyProxy,
            2 => SignatureType::PolyGnosisSafe,
            _ => SignatureType::EOA,
        }
    }
}

/// Match type for order matching
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum MatchType {
    Normal = 0,
    Mint = 1,
    Merge = 2,
}

/// On-chain order structure matching CTFExchange.Order
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnChainOrder {
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
}

/// Deposit event data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepositEvent {
    pub user: Address,
    pub amount: U256,
    pub tx_hash: H256,
    pub block_number: u64,
}

/// Withdrawal event data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WithdrawEvent {
    pub user: Address,
    pub amount: U256,
    pub tx_hash: H256,
    pub block_number: u64,
}

/// Position split event data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionSplitEvent {
    pub stakeholder: Address,
    pub collateral_token: Address,
    pub parent_collection_id: H256,
    pub condition_id: H256,
    pub partition: Vec<U256>,
    pub amount: U256,
    pub tx_hash: H256,
    pub block_number: u64,
}

/// Position merge event data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionMergeEvent {
    pub stakeholder: Address,
    pub collateral_token: Address,
    pub parent_collection_id: H256,
    pub condition_id: H256,
    pub partition: Vec<U256>,
    pub amount: U256,
    pub tx_hash: H256,
    pub block_number: u64,
}

/// Condition preparation event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditionPreparationEvent {
    pub condition_id: H256,
    pub oracle: Address,
    pub question_id: H256,
    pub outcome_slot_count: U256,
    pub tx_hash: H256,
    pub block_number: u64,
}

/// Condition resolution event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditionResolutionEvent {
    pub condition_id: H256,
    pub oracle: Address,
    pub question_id: H256,
    pub outcome_slot_count: U256,
    pub payout_numerators: Vec<U256>,
    pub tx_hash: H256,
    pub block_number: u64,
}

/// Order filled event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderFilledEvent {
    pub order_hash: H256,
    pub maker: Address,
    pub taker: Address,
    pub token_id: U256,
    pub maker_amount_filled: U256,
    pub taker_amount_filled: U256,
    pub fee: U256,
    pub tx_hash: H256,
    pub block_number: u64,
}

/// Trade event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeEvent {
    pub token_id: U256,
    pub maker: Address,
    pub taker: Address,
    pub price: U256,
    pub amount: U256,
    pub taker_side: OrderSide,
    pub match_type: MatchType,
    pub tx_hash: H256,
    pub block_number: u64,
}

/// Transaction status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TxStatus {
    Pending,
    Confirmed,
    Failed,
}

/// Transaction result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxResult {
    pub tx_hash: H256,
    pub status: TxStatus,
    pub block_number: Option<u64>,
    pub gas_used: Option<U256>,
    pub error: Option<String>,
}

/// Verified USDC transfer result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifiedTransfer {
    pub tx_hash: H256,
    pub from: Address,
    pub to: Address,
    pub amount: U256,
    pub block_number: u64,
    pub confirmations: u64,
    pub token_address: Address,
}

/// UMA Assertion Made event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssertionMadeEvent {
    pub assertion_id: H256,
    pub domain_id: H256,
    pub claim: Vec<u8>,
    pub asserter: Address,
    pub callback_recipient: Address,
    pub escalation_manager: Address,
    pub caller: Address,
    pub expiration_time: u64,
    pub currency: Address,
    pub bond: U256,
    pub identifier: H256,
    pub tx_hash: H256,
    pub block_number: u64,
}

/// UMA Assertion Disputed event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssertionDisputedEvent {
    pub assertion_id: H256,
    pub caller: Address,
    pub disputer: Address,
    pub tx_hash: H256,
    pub block_number: u64,
}

/// UMA Assertion Settled event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssertionSettledEvent {
    pub assertion_id: H256,
    pub bond_recipient: Address,
    pub disputed: bool,
    pub settlement_resolution: bool,
    pub settle_caller: Address,
    pub tx_hash: H256,
    pub block_number: u64,
}

/// Contract addresses configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractAddresses {
    pub usdc: Address,
    pub conditional_tokens: Address,
    pub ctf_exchange: Address,
    pub uma_oracle: Option<Address>,
}

impl Default for ContractAddresses {
    fn default() -> Self {
        Self {
            // Sepolia testnet addresses
            usdc: "0x43954707B63e4bbb777c81771A5853031cFB901d"
                .parse()
                .unwrap(),
            conditional_tokens: "0xd7a05df3CD0f963DA444c7FB251Ea7ebb541E2F2"
                .parse()
                .unwrap(),
            ctf_exchange: "0x15b0d7db6137F6cAaB4c4E8CA8318Cb46e46C19B"
                .parse()
                .unwrap(),
            uma_oracle: Some(
                "0xFd9e2642a170aDD10F53Ee14a93FcF2F31924944"
                    .parse()
                    .unwrap(),
            ),
        }
    }
}
