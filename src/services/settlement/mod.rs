//! On-Chain Settlement Service
//!
//! Handles the submission of matched orders to the CTFExchange contract.
//! Implements Polymarket-style settlement where:
//! 1. Users sign orders off-chain (EIP-712)
//! 2. Backend matches orders
//! 3. Operator submits matched orders to chain
//! 4. CTFExchange handles minting/merging automatically

mod service;
mod types;

pub use service::SettlementService;
pub use types::*;
