//! Blockchain client for interacting with prediction market contracts

use std::sync::Arc;

use ethers::prelude::*;
use ethers::providers::{Http, Provider};
use ethers::signers::{LocalWallet, Signer};
use ethers::types::{Address, Bytes, H256, U256};

use crate::blockchain::contracts::{
    ConditionalTokensContract, CTFExchangeContract, MockUSDCContract,
};
use crate::blockchain::types::{ContractAddresses, OnChainOrder, TxResult, TxStatus, VerifiedTransfer};

type SignerMiddleware = ethers::middleware::SignerMiddleware<Provider<Http>, LocalWallet>;

/// Blockchain client for interacting with prediction market contracts
#[derive(Clone)]
pub struct BlockchainClient {
    provider: Arc<Provider<Http>>,
    signer: Option<Arc<SignerMiddleware>>,
    addresses: ContractAddresses,
    chain_id: u64,
}

impl BlockchainClient {
    /// Create a new blockchain client (read-only)
    pub fn new(rpc_url: &str, addresses: ContractAddresses, chain_id: u64) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let provider = Provider::<Http>::try_from(rpc_url)?;
        Ok(Self {
            provider: Arc::new(provider),
            signer: None,
            addresses,
            chain_id,
        })
    }

    /// Create a new blockchain client with signing capability
    pub fn new_with_signer(
        rpc_url: &str,
        private_key: &str,
        addresses: ContractAddresses,
        chain_id: u64,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let provider = Provider::<Http>::try_from(rpc_url)?;
        let wallet: LocalWallet = private_key.parse::<LocalWallet>()?.with_chain_id(chain_id);
        let signer = SignerMiddleware::new(provider.clone(), wallet);

        Ok(Self {
            provider: Arc::new(provider),
            signer: Some(Arc::new(signer)),
            addresses,
            chain_id,
        })
    }

    /// Get the provider
    pub fn provider(&self) -> &Provider<Http> {
        &self.provider
    }

    /// Get contract addresses
    pub fn addresses(&self) -> &ContractAddresses {
        &self.addresses
    }

    /// Get chain ID
    pub fn chain_id(&self) -> u64 {
        self.chain_id
    }

    /// Get signer middleware
    fn get_signer(&self) -> Result<Arc<SignerMiddleware>, &'static str> {
        self.signer.clone().ok_or("No signer configured")
    }

    // ============ USDC Contract Methods ============

    /// Get USDC contract instance (read-only)
    pub fn usdc(&self) -> MockUSDCContract<Provider<Http>> {
        MockUSDCContract::new(self.addresses.usdc, self.provider.clone())
    }

    /// Get USDC balance for an address
    pub async fn get_usdc_balance(&self, address: Address) -> Result<U256, Box<dyn std::error::Error + Send + Sync>> {
        let balance = self.usdc().balance_of(address).call().await?;
        Ok(balance)
    }

    /// Get USDC allowance
    pub async fn get_usdc_allowance(
        &self,
        owner: Address,
        spender: Address,
    ) -> Result<U256, Box<dyn std::error::Error + Send + Sync>> {
        let allowance = self.usdc().allowance(owner, spender).call().await?;
        Ok(allowance)
    }

    /// Approve USDC spending
    pub async fn approve_usdc(
        &self,
        spender: Address,
        amount: U256,
    ) -> Result<TxResult, Box<dyn std::error::Error + Send + Sync>> {
        let signer = self.get_signer()?;
        let contract = MockUSDCContract::new(self.addresses.usdc, signer);
        let call = contract.approve(spender, amount);
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(self.parse_receipt(receipt))
    }

    /// Transfer USDC
    pub async fn transfer_usdc(
        &self,
        to: Address,
        amount: U256,
    ) -> Result<TxResult, Box<dyn std::error::Error + Send + Sync>> {
        let signer = self.get_signer()?;
        let contract = MockUSDCContract::new(self.addresses.usdc, signer);
        let call = contract.transfer(to, amount);
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(self.parse_receipt(receipt))
    }

    /// Mint USDC from faucet (testnet only)
    pub async fn faucet_usdc(&self) -> Result<TxResult, Box<dyn std::error::Error + Send + Sync>> {
        let signer = self.get_signer()?;
        let contract = MockUSDCContract::new(self.addresses.usdc, signer);
        let call = contract.faucet();
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(self.parse_receipt(receipt))
    }

    // ============ ConditionalTokens Contract Methods ============

    /// Get ConditionalTokens contract instance (read-only)
    pub fn ctf(&self) -> ConditionalTokensContract<Provider<Http>> {
        ConditionalTokensContract::new(self.addresses.conditional_tokens, self.provider.clone())
    }

    /// Get condition ID
    pub async fn get_condition_id(
        &self,
        oracle: Address,
        question_id: [u8; 32],
        outcome_slot_count: U256,
    ) -> Result<[u8; 32], Box<dyn std::error::Error + Send + Sync>> {
        let condition_id = self
            .ctf()
            .get_condition_id(oracle, question_id, outcome_slot_count)
            .call()
            .await?;
        Ok(condition_id)
    }

    /// Get position ID (ERC1155 token ID)
    pub async fn get_position_id(
        &self,
        collateral_token: Address,
        collection_id: [u8; 32],
    ) -> Result<U256, Box<dyn std::error::Error + Send + Sync>> {
        let position_id = self
            .ctf()
            .get_position_id(collateral_token, collection_id)
            .call()
            .await?;
        Ok(position_id)
    }

    /// Get collection ID
    pub async fn get_collection_id(
        &self,
        parent_collection_id: [u8; 32],
        condition_id: [u8; 32],
        index_set: U256,
    ) -> Result<[u8; 32], Box<dyn std::error::Error + Send + Sync>> {
        let collection_id = self
            .ctf()
            .get_collection_id(parent_collection_id, condition_id, index_set)
            .call()
            .await?;
        Ok(collection_id)
    }

    /// Get outcome slot count for a condition
    pub async fn get_outcome_slot_count(
        &self,
        condition_id: [u8; 32],
    ) -> Result<U256, Box<dyn std::error::Error + Send + Sync>> {
        let count = self.ctf().get_outcome_slot_count(condition_id).call().await?;
        Ok(count)
    }

    /// Get payout denominator (non-zero means condition is resolved)
    pub async fn get_payout_denominator(
        &self,
        condition_id: [u8; 32],
    ) -> Result<U256, Box<dyn std::error::Error + Send + Sync>> {
        let denominator = self.ctf().payout_denominator(condition_id).call().await?;
        Ok(denominator)
    }

    /// Get ERC1155 balance for a position
    pub async fn get_position_balance(
        &self,
        account: Address,
        position_id: U256,
    ) -> Result<U256, Box<dyn std::error::Error + Send + Sync>> {
        let balance = self.ctf().balance_of(account, position_id).call().await?;
        Ok(balance)
    }

    /// Prepare a new condition
    pub async fn prepare_condition(
        &self,
        oracle: Address,
        question_id: [u8; 32],
        outcome_slot_count: U256,
    ) -> Result<TxResult, Box<dyn std::error::Error + Send + Sync>> {
        let signer = self.get_signer()?;
        let contract = ConditionalTokensContract::new(self.addresses.conditional_tokens, signer);
        let call = contract.prepare_condition(oracle, question_id, outcome_slot_count);
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(self.parse_receipt(receipt))
    }

    /// Report payouts (resolve condition) - caller must be the oracle
    pub async fn report_payouts(
        &self,
        question_id: [u8; 32],
        payouts: Vec<U256>,
    ) -> Result<TxResult, Box<dyn std::error::Error + Send + Sync>> {
        let signer = self.get_signer()?;
        let contract = ConditionalTokensContract::new(self.addresses.conditional_tokens, signer);
        let call = contract.report_payouts(question_id, payouts);
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(self.parse_receipt(receipt))
    }

    /// Split position (mint outcome tokens from collateral)
    pub async fn split_position(
        &self,
        collateral_token: Address,
        parent_collection_id: [u8; 32],
        condition_id: [u8; 32],
        partition: Vec<U256>,
        amount: U256,
    ) -> Result<TxResult, Box<dyn std::error::Error + Send + Sync>> {
        let signer = self.get_signer()?;
        let contract = ConditionalTokensContract::new(self.addresses.conditional_tokens, signer);
        let call = contract.split_position(collateral_token, parent_collection_id, condition_id, partition, amount);
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(self.parse_receipt(receipt))
    }

    /// Merge positions (burn outcome tokens back to collateral)
    pub async fn merge_positions(
        &self,
        collateral_token: Address,
        parent_collection_id: [u8; 32],
        condition_id: [u8; 32],
        partition: Vec<U256>,
        amount: U256,
    ) -> Result<TxResult, Box<dyn std::error::Error + Send + Sync>> {
        let signer = self.get_signer()?;
        let contract = ConditionalTokensContract::new(self.addresses.conditional_tokens, signer);
        let call = contract.merge_positions(collateral_token, parent_collection_id, condition_id, partition, amount);
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(self.parse_receipt(receipt))
    }

    /// Redeem positions after condition resolution
    pub async fn redeem_positions(
        &self,
        collateral_token: Address,
        parent_collection_id: [u8; 32],
        condition_id: [u8; 32],
        index_sets: Vec<U256>,
    ) -> Result<TxResult, Box<dyn std::error::Error + Send + Sync>> {
        let signer = self.get_signer()?;
        let contract = ConditionalTokensContract::new(self.addresses.conditional_tokens, signer);
        let call = contract.redeem_positions(collateral_token, parent_collection_id, condition_id, index_sets);
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(self.parse_receipt(receipt))
    }

    // ============ CTFExchange Contract Methods ============

    /// Get CTFExchange contract instance (read-only)
    pub fn exchange(&self) -> CTFExchangeContract<Provider<Http>> {
        CTFExchangeContract::new(self.addresses.ctf_exchange, self.provider.clone())
    }

    /// Check if exchange is paused
    pub async fn is_exchange_paused(&self) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let paused = self.exchange().paused().call().await?;
        Ok(paused)
    }

    /// Get order hash for an order
    pub async fn get_order_hash(
        &self,
        order: &OnChainOrder,
    ) -> Result<[u8; 32], Box<dyn std::error::Error + Send + Sync>> {
        let contract_order = self.to_contract_order(order);
        let hash = self.exchange().get_order_hash(contract_order).call().await?;
        Ok(hash)
    }

    /// Get filled amount for an order
    pub async fn get_order_filled(
        &self,
        order_hash: [u8; 32],
    ) -> Result<U256, Box<dyn std::error::Error + Send + Sync>> {
        let filled = self.exchange().orders_filled(order_hash).call().await?;
        Ok(filled)
    }

    /// Check if order is cancelled
    pub async fn is_order_cancelled(
        &self,
        order_hash: [u8; 32],
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let cancelled = self.exchange().orders_cancelled(order_hash).call().await?;
        Ok(cancelled)
    }

    /// Fill an order
    pub async fn fill_order(
        &self,
        order: &OnChainOrder,
        signature: Bytes,
        fill_amount: U256,
    ) -> Result<TxResult, Box<dyn std::error::Error + Send + Sync>> {
        let signer = self.get_signer()?;
        let contract = CTFExchangeContract::new(self.addresses.ctf_exchange, signer);
        let contract_order = self.to_contract_order(order);
        let call = contract.fill_order(contract_order, signature, fill_amount);
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(self.parse_receipt(receipt))
    }

    /// Match two orders
    pub async fn match_orders(
        &self,
        maker_order: &OnChainOrder,
        taker_order: &OnChainOrder,
        maker_signature: Bytes,
        taker_signature: Bytes,
        maker_fill_amount: U256,
        taker_fill_amount: U256,
    ) -> Result<TxResult, Box<dyn std::error::Error + Send + Sync>> {
        let signer = self.get_signer()?;
        let contract = CTFExchangeContract::new(self.addresses.ctf_exchange, signer);
        let maker = self.to_contract_order(maker_order);
        let taker = self.to_contract_order(taker_order);
        let call = contract.match_orders(maker, taker, maker_signature, taker_signature, maker_fill_amount, taker_fill_amount);
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(self.parse_receipt(receipt))
    }

    /// Cancel an order
    pub async fn cancel_order(
        &self,
        order: &OnChainOrder,
    ) -> Result<TxResult, Box<dyn std::error::Error + Send + Sync>> {
        let signer = self.get_signer()?;
        let contract = CTFExchangeContract::new(self.addresses.ctf_exchange, signer);
        let contract_order = self.to_contract_order(order);
        let call = contract.cancel_order(contract_order);
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(self.parse_receipt(receipt))
    }

    /// Increment nonce to cancel all orders with lower nonce
    pub async fn increment_nonce(&self) -> Result<TxResult, Box<dyn std::error::Error + Send + Sync>> {
        let signer = self.get_signer()?;
        let contract = CTFExchangeContract::new(self.addresses.ctf_exchange, signer);
        let call = contract.increment_nonce();
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;
        Ok(self.parse_receipt(receipt))
    }

    // ============ Utility Methods ============

    /// Get current block number
    pub async fn get_block_number(&self) -> Result<u64, Box<dyn std::error::Error + Send + Sync>> {
        let block = self.provider.get_block_number().await?;
        Ok(block.as_u64())
    }

    /// Get ETH balance
    pub async fn get_eth_balance(&self, address: Address) -> Result<U256, Box<dyn std::error::Error + Send + Sync>> {
        let balance = self.provider.get_balance(address, None).await?;
        Ok(balance)
    }

    /// Get transaction receipt
    pub async fn get_transaction_receipt(
        &self,
        tx_hash: H256,
    ) -> Result<Option<TransactionReceipt>, Box<dyn std::error::Error + Send + Sync>> {
        let receipt = self.provider.get_transaction_receipt(tx_hash).await?;
        Ok(receipt)
    }

    /// Verify a USDC transfer transaction
    ///
    /// This method verifies that a transaction:
    /// 1. Exists and is confirmed
    /// 2. Contains a valid ERC20 Transfer event
    /// 3. Transfers to the expected address
    /// 4. Transfers at least the minimum amount
    /// 5. Has sufficient confirmations
    pub async fn verify_usdc_transfer(
        &self,
        tx_hash: H256,
        expected_to: Address,
        min_amount: U256,
        min_confirmations: u64,
    ) -> Result<VerifiedTransfer, Box<dyn std::error::Error + Send + Sync>> {
        // Get transaction receipt
        let receipt = self.provider.get_transaction_receipt(tx_hash).await?
            .ok_or("Transaction not found")?;

        // Check transaction was successful
        if receipt.status != Some(1.into()) {
            return Err("Transaction failed".into());
        }

        let tx_block = receipt.block_number
            .ok_or("Transaction not yet mined")?
            .as_u64();

        // Check confirmations
        let current_block = self.provider.get_block_number().await?.as_u64();
        let confirmations = current_block.saturating_sub(tx_block);

        if confirmations < min_confirmations {
            return Err(format!(
                "Insufficient confirmations: {} < {}",
                confirmations, min_confirmations
            ).into());
        }

        // ERC20 Transfer event signature: Transfer(address,address,uint256)
        // keccak256("Transfer(address,address,uint256)") = 0xddf252ad...
        let transfer_topic: H256 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
            .parse()
            .unwrap();

        // Find Transfer event in logs
        let mut found_transfer: Option<VerifiedTransfer> = None;

        for log in &receipt.logs {
            // Check if this is a Transfer event from USDC contract
            if log.address != self.addresses.usdc {
                continue;
            }

            if log.topics.is_empty() || log.topics[0] != transfer_topic {
                continue;
            }

            // Parse Transfer event: Transfer(from indexed, to indexed, value)
            if log.topics.len() < 3 {
                continue;
            }

            let from = Address::from(log.topics[1]);
            let to = Address::from(log.topics[2]);
            let amount = U256::from_big_endian(&log.data);

            // Verify recipient matches expected
            if to != expected_to {
                continue;
            }

            // Verify amount is sufficient
            if amount < min_amount {
                return Err(format!(
                    "Insufficient amount: {} < {}",
                    amount, min_amount
                ).into());
            }

            found_transfer = Some(VerifiedTransfer {
                tx_hash,
                from,
                to,
                amount,
                block_number: tx_block,
                confirmations,
                token_address: log.address,
            });
            break;
        }

        found_transfer.ok_or_else(|| {
            "No valid USDC Transfer event found to expected address".into()
        })
    }

    /// Verify USDC transfer by tx hash string
    pub async fn verify_usdc_transfer_by_hash(
        &self,
        tx_hash_str: &str,
        expected_to: Address,
        min_amount: U256,
        min_confirmations: u64,
    ) -> Result<VerifiedTransfer, Box<dyn std::error::Error + Send + Sync>> {
        let tx_hash: H256 = tx_hash_str.parse()
            .map_err(|_| "Invalid transaction hash format")?;

        self.verify_usdc_transfer(tx_hash, expected_to, min_amount, min_confirmations).await
    }

    /// Send USDC from the vault (signer) to a recipient
    /// Used for processing withdrawals
    pub async fn send_usdc(
        &self,
        to: Address,
        amount: U256,
    ) -> Result<TxResult, Box<dyn std::error::Error + Send + Sync>> {
        let signer = self.get_signer()?;
        let contract = MockUSDCContract::new(self.addresses.usdc, signer);

        tracing::info!(
            "Sending {} USDC (raw units) to {:?}",
            amount,
            to
        );

        let call = contract.transfer(to, amount);
        let pending_tx = call.send().await?;
        let receipt = pending_tx.await?;

        Ok(self.parse_receipt(receipt))
    }

    /// Get the signer's address (vault address)
    pub fn get_signer_address(&self) -> Result<Address, &'static str> {
        let signer = self.signer.as_ref().ok_or("No signer configured")?;
        Ok(signer.address())
    }

    /// Convert OnChainOrder to contract Order struct
    fn to_contract_order(&self, order: &OnChainOrder) -> crate::blockchain::contracts::Order {
        crate::blockchain::contracts::Order {
            maker: order.maker,
            taker: order.taker,
            token_id: order.token_id,
            maker_amount: order.maker_amount,
            taker_amount: order.taker_amount,
            expiration: order.expiration,
            nonce: order.nonce,
            fee_rate_bps: order.fee_rate_bps,
            side: order.side as u8,
            sig_type: order.sig_type as u8,
        }
    }

    /// Parse transaction receipt into TxResult
    fn parse_receipt(&self, receipt: Option<TransactionReceipt>) -> TxResult {
        match receipt {
            Some(r) => TxResult {
                tx_hash: r.transaction_hash,
                status: if r.status == Some(1.into()) {
                    TxStatus::Confirmed
                } else {
                    TxStatus::Failed
                },
                block_number: r.block_number.map(|b| b.as_u64()),
                gas_used: r.gas_used,
                error: None,
            },
            None => TxResult {
                tx_hash: H256::zero(),
                status: TxStatus::Pending,
                block_number: None,
                gas_used: None,
                error: Some("No receipt".to_string()),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_contract_addresses_default() {
        let addresses = ContractAddresses::default();
        assert_eq!(
            format!("{:?}", addresses.usdc),
            "0x43954707b63e4bbb777c81771a5853031cfb901d"
        );
    }
}
