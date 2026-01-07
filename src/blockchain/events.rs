//! Event listener for monitoring on-chain events

use std::sync::Arc;

use ethers::prelude::*;
use ethers::providers::{Http, Provider};
use ethers::types::{Address, Filter, H256, Log, U256};
use tokio::sync::mpsc;
use tracing::{error, info};

use crate::blockchain::types::{
    ConditionPreparationEvent, ConditionResolutionEvent, ContractAddresses,
    DepositEvent, OrderFilledEvent, PositionMergeEvent, PositionSplitEvent,
    TradeEvent, WithdrawEvent,
};

/// Event types emitted by the listener
#[derive(Debug, Clone)]
pub enum BlockchainEvent {
    /// USDC Transfer event (for deposits/withdrawals)
    USDCTransfer {
        from: Address,
        to: Address,
        amount: U256,
        tx_hash: H256,
        block_number: u64,
    },
    /// Condition prepared
    ConditionPrepared(ConditionPreparationEvent),
    /// Condition resolved
    ConditionResolved(ConditionResolutionEvent),
    /// Position split (minted)
    PositionSplit(PositionSplitEvent),
    /// Position merged
    PositionMerged(PositionMergeEvent),
    /// Order filled on exchange
    OrderFilled(OrderFilledEvent),
    /// Trade occurred
    Trade(TradeEvent),
    /// New block
    NewBlock { number: u64, hash: H256 },
}

/// Event listener for blockchain events
pub struct EventListener {
    provider: Arc<Provider<Http>>,
    addresses: ContractAddresses,
    from_block: u64,
}

impl EventListener {
    /// Create a new event listener
    pub fn new(
        provider: Arc<Provider<Http>>,
        addresses: ContractAddresses,
        from_block: u64,
    ) -> Self {
        Self {
            provider,
            addresses,
            from_block,
        }
    }

    /// Start listening for events and send them to the channel
    pub async fn start(
        &self,
        tx: mpsc::Sender<BlockchainEvent>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        info!("Starting event listener from block {}", self.from_block);

        let mut current_block = self.from_block;

        loop {
            // Get latest block
            let latest = match self.provider.get_block_number().await {
                Ok(n) => n.as_u64(),
                Err(e) => {
                    error!("Failed to get block number: {}", e);
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                    continue;
                }
            };

            // Process new blocks
            if latest > current_block {
                for block_num in (current_block + 1)..=latest {
                    if let Err(e) = self.process_block(block_num, &tx).await {
                        error!("Failed to process block {}: {}", block_num, e);
                    }
                }
                current_block = latest;
            }

            // Wait for next poll
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        }
    }

    /// Process a single block for events
    async fn process_block(
        &self,
        block_number: u64,
        tx: &mpsc::Sender<BlockchainEvent>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Get block info
        if let Ok(Some(block)) = self.provider.get_block(block_number).await {
            let _ = tx
                .send(BlockchainEvent::NewBlock {
                    number: block_number,
                    hash: block.hash.unwrap_or_default(),
                })
                .await;
        }

        // Fetch logs for all contracts
        let filter = Filter::new()
            .from_block(block_number)
            .to_block(block_number)
            .address(vec![
                self.addresses.usdc,
                self.addresses.conditional_tokens,
                self.addresses.ctf_exchange,
            ]);

        let logs = self.provider.get_logs(&filter).await?;

        for log in logs {
            self.process_log(log, tx).await?;
        }

        Ok(())
    }

    /// Process a single log event
    async fn process_log(
        &self,
        log: Log,
        tx: &mpsc::Sender<BlockchainEvent>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let tx_hash = log.transaction_hash.unwrap_or_default();
        let block_number = log.block_number.map(|b| b.as_u64()).unwrap_or(0);

        // Identify which contract emitted the event
        if log.address == self.addresses.usdc {
            self.process_usdc_log(log, tx_hash, block_number, tx).await?;
        } else if log.address == self.addresses.conditional_tokens {
            self.process_ctf_log(log, tx_hash, block_number, tx).await?;
        } else if log.address == self.addresses.ctf_exchange {
            self.process_exchange_log(log, tx_hash, block_number, tx).await?;
        }

        Ok(())
    }

    /// Process USDC contract logs
    async fn process_usdc_log(
        &self,
        log: Log,
        tx_hash: H256,
        block_number: u64,
        tx: &mpsc::Sender<BlockchainEvent>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // ERC20 Transfer event signature
        let transfer_sig = H256::from(ethers::utils::keccak256("Transfer(address,address,uint256)"));

        if log.topics.first() == Some(&transfer_sig) {
            if log.topics.len() >= 3 {
                let from = Address::from(log.topics[1]);
                let to = Address::from(log.topics[2]);
                let amount = U256::from_big_endian(&log.data);

                let _ = tx
                    .send(BlockchainEvent::USDCTransfer {
                        from,
                        to,
                        amount,
                        tx_hash,
                        block_number,
                    })
                    .await;
            }
        }

        Ok(())
    }

    /// Process ConditionalTokens contract logs
    async fn process_ctf_log(
        &self,
        log: Log,
        tx_hash: H256,
        block_number: u64,
        tx: &mpsc::Sender<BlockchainEvent>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Event signatures
        let condition_prep_sig = H256::from(ethers::utils::keccak256(
            "ConditionPreparation(bytes32,address,bytes32,uint256)",
        ));
        let condition_res_sig = H256::from(ethers::utils::keccak256(
            "ConditionResolution(bytes32,address,bytes32,uint256,uint256[])",
        ));
        let position_split_sig = H256::from(ethers::utils::keccak256(
            "PositionSplit(address,address,bytes32,bytes32,uint256[],uint256)",
        ));
        let position_merge_sig = H256::from(ethers::utils::keccak256(
            "PositionsMerge(address,address,bytes32,bytes32,uint256[],uint256)",
        ));

        let topic0 = log.topics.first();

        if topic0 == Some(&condition_prep_sig) && log.topics.len() >= 4 {
            let event = ConditionPreparationEvent {
                condition_id: log.topics[1].into(),
                oracle: Address::from(log.topics[2]),
                question_id: log.topics[3].into(),
                outcome_slot_count: U256::from_big_endian(&log.data[0..32]),
                tx_hash,
                block_number,
            };
            let _ = tx.send(BlockchainEvent::ConditionPrepared(event)).await;
        } else if topic0 == Some(&condition_res_sig) && log.topics.len() >= 4 {
            // Parse payout numerators from data
            let payouts = self.parse_uint256_array(&log.data[32..]);
            let event = ConditionResolutionEvent {
                condition_id: log.topics[1].into(),
                oracle: Address::from(log.topics[2]),
                question_id: log.topics[3].into(),
                outcome_slot_count: U256::from_big_endian(&log.data[0..32]),
                payout_numerators: payouts,
                tx_hash,
                block_number,
            };
            let _ = tx.send(BlockchainEvent::ConditionResolved(event)).await;
        } else if topic0 == Some(&position_split_sig) && log.topics.len() >= 4 {
            let event = PositionSplitEvent {
                stakeholder: Address::from(log.topics[1]),
                collateral_token: Address::from_slice(&log.data[12..32]),
                parent_collection_id: log.topics[2].into(),
                condition_id: log.topics[3].into(),
                partition: self.parse_uint256_array(&log.data[64..]),
                amount: U256::from_big_endian(&log.data[32..64]),
                tx_hash,
                block_number,
            };
            let _ = tx.send(BlockchainEvent::PositionSplit(event)).await;
        } else if topic0 == Some(&position_merge_sig) && log.topics.len() >= 4 {
            let event = PositionMergeEvent {
                stakeholder: Address::from(log.topics[1]),
                collateral_token: Address::from_slice(&log.data[12..32]),
                parent_collection_id: log.topics[2].into(),
                condition_id: log.topics[3].into(),
                partition: self.parse_uint256_array(&log.data[64..]),
                amount: U256::from_big_endian(&log.data[32..64]),
                tx_hash,
                block_number,
            };
            let _ = tx.send(BlockchainEvent::PositionMerged(event)).await;
        }

        Ok(())
    }

    /// Process CTFExchange contract logs
    async fn process_exchange_log(
        &self,
        log: Log,
        tx_hash: H256,
        block_number: u64,
        tx: &mpsc::Sender<BlockchainEvent>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Event signatures
        let order_filled_sig = H256::from(ethers::utils::keccak256(
            "OrderFilled(bytes32,address,address,uint256,uint256,uint256,uint256)",
        ));
        let trade_sig = H256::from(ethers::utils::keccak256(
            "Trade(uint256,address,address,uint256,uint256,uint8,uint8)",
        ));

        let topic0 = log.topics.first();

        if topic0 == Some(&order_filled_sig) && log.topics.len() >= 4 {
            let event = OrderFilledEvent {
                order_hash: log.topics[1].into(),
                maker: Address::from(log.topics[2]),
                taker: Address::from(log.topics[3]),
                token_id: U256::from_big_endian(&log.data[0..32]),
                maker_amount_filled: U256::from_big_endian(&log.data[32..64]),
                taker_amount_filled: U256::from_big_endian(&log.data[64..96]),
                fee: U256::from_big_endian(&log.data[96..128]),
                tx_hash,
                block_number,
            };
            let _ = tx.send(BlockchainEvent::OrderFilled(event)).await;
        } else if topic0 == Some(&trade_sig) && log.topics.len() >= 4 {
            use crate::blockchain::types::{MatchType, OrderSide};

            let taker_side_byte = log.data[128 + 31];
            let match_type_byte = log.data[160 + 31];

            let event = TradeEvent {
                token_id: U256::from_big_endian(log.topics[1].as_bytes()),
                maker: Address::from(log.topics[2]),
                taker: Address::from(log.topics[3]),
                price: U256::from_big_endian(&log.data[0..32]),
                amount: U256::from_big_endian(&log.data[32..64]),
                taker_side: if taker_side_byte == 0 {
                    OrderSide::Buy
                } else {
                    OrderSide::Sell
                },
                match_type: match match_type_byte {
                    0 => MatchType::Normal,
                    1 => MatchType::Mint,
                    _ => MatchType::Merge,
                },
                tx_hash,
                block_number,
            };
            let _ = tx.send(BlockchainEvent::Trade(event)).await;
        }

        Ok(())
    }

    /// Parse a dynamic array of uint256 from bytes
    fn parse_uint256_array(&self, data: &[u8]) -> Vec<U256> {
        if data.len() < 64 {
            return vec![];
        }

        // First 32 bytes is the offset, next 32 is the length
        let length = U256::from_big_endian(&data[32..64]).as_usize();
        let mut result = Vec::with_capacity(length);

        for i in 0..length {
            let start = 64 + i * 32;
            let end = start + 32;
            if end <= data.len() {
                result.push(U256::from_big_endian(&data[start..end]));
            }
        }

        result
    }

    /// Get historical events from a range of blocks
    pub async fn get_historical_events(
        &self,
        from_block: u64,
        to_block: u64,
    ) -> Result<Vec<Log>, Box<dyn std::error::Error + Send + Sync>> {
        let filter = Filter::new()
            .from_block(from_block)
            .to_block(to_block)
            .address(vec![
                self.addresses.usdc,
                self.addresses.conditional_tokens,
                self.addresses.ctf_exchange,
            ]);

        let logs = self.provider.get_logs(&filter).await?;
        Ok(logs)
    }

    /// Watch for USDC transfers to a specific address (deposits)
    pub async fn watch_deposits(
        &self,
        to_address: Address,
        from_block: u64,
    ) -> Result<Vec<DepositEvent>, Box<dyn std::error::Error + Send + Sync>> {
        let transfer_sig = H256::from(ethers::utils::keccak256("Transfer(address,address,uint256)"));
        let to_topic = H256::from(to_address);

        let filter = Filter::new()
            .from_block(from_block)
            .address(self.addresses.usdc)
            .topic0(transfer_sig)
            .topic2(to_topic);

        let logs = self.provider.get_logs(&filter).await?;

        let deposits: Vec<DepositEvent> = logs
            .into_iter()
            .filter_map(|log| {
                if log.topics.len() >= 3 {
                    Some(DepositEvent {
                        user: Address::from(log.topics[1]),
                        amount: U256::from_big_endian(&log.data),
                        tx_hash: log.transaction_hash?,
                        block_number: log.block_number?.as_u64(),
                    })
                } else {
                    None
                }
            })
            .collect();

        Ok(deposits)
    }

    /// Watch for USDC transfers from a specific address (withdrawals)
    pub async fn watch_withdrawals(
        &self,
        from_address: Address,
        from_block: u64,
    ) -> Result<Vec<WithdrawEvent>, Box<dyn std::error::Error + Send + Sync>> {
        let transfer_sig = H256::from(ethers::utils::keccak256("Transfer(address,address,uint256)"));
        let from_topic = H256::from(from_address);

        let filter = Filter::new()
            .from_block(from_block)
            .address(self.addresses.usdc)
            .topic0(transfer_sig)
            .topic1(from_topic);

        let logs = self.provider.get_logs(&filter).await?;

        let withdrawals: Vec<WithdrawEvent> = logs
            .into_iter()
            .filter_map(|log| {
                if log.topics.len() >= 3 {
                    Some(WithdrawEvent {
                        user: Address::from(log.topics[2]),
                        amount: U256::from_big_endian(&log.data),
                        tx_hash: log.transaction_hash?,
                        block_number: log.block_number?.as_u64(),
                    })
                } else {
                    None
                }
            })
            .collect();

        Ok(withdrawals)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_event_signature() {
        let sig = ethers::utils::keccak256("Transfer(address,address,uint256)");
        assert_eq!(sig.len(), 32);
    }
}
