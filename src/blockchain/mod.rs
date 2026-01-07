//! Blockchain integration module for Polymarket prediction markets
//!
//! This module provides:
//! - Contract bindings for MockUSDC, ConditionalTokens, and CTFExchange
//! - Blockchain client for interacting with contracts
//! - Event listener for monitoring on-chain events
//! - Transaction management utilities

pub mod client;
pub mod contracts;
pub mod events;
pub mod types;

pub use client::BlockchainClient;
pub use events::{BlockchainEvent, EventListener};
pub use types::ContractAddresses;
