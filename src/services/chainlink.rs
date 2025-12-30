//! Chainlink Oracle Client
//!
//! Provides integration with Chainlink Price Feeds for:
//! - Reading real-time asset prices (BTC/USD, ETH/USD, etc.)
//! - Checking price thresholds for market resolution
//! - Supporting multiple networks (Ethereum, Polygon, Sepolia)

use ethers::prelude::*;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use thiserror::Error;
use tracing::{debug, error, info, warn};

/// Chainlink oracle errors
#[derive(Debug, Error)]
pub enum ChainlinkError {
    #[error("RPC error: {0}")]
    RpcError(String),

    #[error("Contract call error: {0}")]
    ContractError(String),

    #[error("Price feed not found: {0}")]
    PriceFeedNotFound(String),

    #[error("Invalid price data: {0}")]
    InvalidPriceData(String),

    #[error("Network not supported: {0}")]
    NetworkNotSupported(String),

    #[error("Stale price data: last updated {0} seconds ago")]
    StalePrice(u64),
}

/// Supported blockchain networks
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Network {
    EthereumMainnet,
    EthereumSepolia,
    PolygonMainnet,
    PolygonMumbai,
}

impl Network {
    /// Get chain ID for the network
    pub fn chain_id(&self) -> u64 {
        match self {
            Network::EthereumMainnet => 1,
            Network::EthereumSepolia => 11155111,
            Network::PolygonMainnet => 137,
            Network::PolygonMumbai => 80001,
        }
    }

    /// Check if this is a testnet
    pub fn is_testnet(&self) -> bool {
        matches!(self, Network::EthereumSepolia | Network::PolygonMumbai)
    }
}

impl std::fmt::Display for Network {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Network::EthereumMainnet => write!(f, "ethereum-mainnet"),
            Network::EthereumSepolia => write!(f, "ethereum-sepolia"),
            Network::PolygonMainnet => write!(f, "polygon-mainnet"),
            Network::PolygonMumbai => write!(f, "polygon-mumbai"),
        }
    }
}

/// Price feed information
#[derive(Debug, Clone)]
pub struct PriceFeedInfo {
    pub address: Address,
    pub decimals: u8,
    pub description: String,
}

/// Price data from Chainlink
#[derive(Debug, Clone, Serialize)]
pub struct PriceData {
    pub price: Decimal,
    pub decimals: u8,
    pub round_id: u128,
    pub updated_at: u64,
    pub network: String,
    pub feed: String,
}

// Chainlink Price Feed Contract ABI
// We only need the latestRoundData function
abigen!(
    ChainlinkAggregator,
    r#"[
        function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
        function decimals() external view returns (uint8)
        function description() external view returns (string)
    ]"#
);

/// Chainlink Oracle Client
pub struct ChainlinkClient {
    /// RPC providers per network
    providers: HashMap<Network, Arc<Provider<Http>>>,
    /// Price feed addresses per network
    price_feeds: HashMap<Network, HashMap<String, PriceFeedInfo>>,
    /// Maximum age of price data (in seconds) before considered stale
    max_price_age: u64,
}

impl ChainlinkClient {
    /// Create a new Chainlink client with RPC URLs
    pub fn new(rpc_urls: HashMap<Network, String>) -> Result<Self, ChainlinkError> {
        let mut providers = HashMap::new();

        for (network, url) in rpc_urls {
            let provider = Provider::<Http>::try_from(url.as_str())
                .map_err(|e| ChainlinkError::RpcError(e.to_string()))?;
            providers.insert(network, Arc::new(provider));
            info!("Chainlink client initialized for {}", network);
        }

        let price_feeds = Self::init_price_feeds();

        Ok(Self {
            providers,
            price_feeds,
            max_price_age: 3600, // 1 hour default
        })
    }

    /// Set maximum price age before considered stale
    pub fn with_max_price_age(mut self, seconds: u64) -> Self {
        self.max_price_age = seconds;
        self
    }

    /// Initialize known price feed addresses
    fn init_price_feeds() -> HashMap<Network, HashMap<String, PriceFeedInfo>> {
        let mut feeds = HashMap::new();

        // Ethereum Mainnet Price Feeds
        let mut eth_mainnet = HashMap::new();
        eth_mainnet.insert(
            "BTC/USD".to_string(),
            PriceFeedInfo {
                address: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c"
                    .parse()
                    .unwrap(),
                decimals: 8,
                description: "BTC / USD".to_string(),
            },
        );
        eth_mainnet.insert(
            "ETH/USD".to_string(),
            PriceFeedInfo {
                address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"
                    .parse()
                    .unwrap(),
                decimals: 8,
                description: "ETH / USD".to_string(),
            },
        );
        eth_mainnet.insert(
            "LINK/USD".to_string(),
            PriceFeedInfo {
                address: "0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c"
                    .parse()
                    .unwrap(),
                decimals: 8,
                description: "LINK / USD".to_string(),
            },
        );
        eth_mainnet.insert(
            "MATIC/USD".to_string(),
            PriceFeedInfo {
                address: "0x7bAC85A8a13A4BcD8abb3eB7d6b4d632c5a57676"
                    .parse()
                    .unwrap(),
                decimals: 8,
                description: "MATIC / USD".to_string(),
            },
        );
        feeds.insert(Network::EthereumMainnet, eth_mainnet);

        // Ethereum Sepolia Testnet Price Feeds
        let mut eth_sepolia = HashMap::new();
        eth_sepolia.insert(
            "BTC/USD".to_string(),
            PriceFeedInfo {
                address: "0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43"
                    .parse()
                    .unwrap(),
                decimals: 8,
                description: "BTC / USD".to_string(),
            },
        );
        eth_sepolia.insert(
            "ETH/USD".to_string(),
            PriceFeedInfo {
                address: "0x694AA1769357215DE4FAC081bf1f309aDC325306"
                    .parse()
                    .unwrap(),
                decimals: 8,
                description: "ETH / USD".to_string(),
            },
        );
        eth_sepolia.insert(
            "LINK/USD".to_string(),
            PriceFeedInfo {
                address: "0xc59E3633BAAC79493d908e63626716e204A45EdF"
                    .parse()
                    .unwrap(),
                decimals: 8,
                description: "LINK / USD".to_string(),
            },
        );
        feeds.insert(Network::EthereumSepolia, eth_sepolia);

        // Polygon Mainnet Price Feeds
        let mut polygon_mainnet = HashMap::new();
        polygon_mainnet.insert(
            "BTC/USD".to_string(),
            PriceFeedInfo {
                address: "0xc907E116054Ad103354f2D350FD2514433D57F6f"
                    .parse()
                    .unwrap(),
                decimals: 8,
                description: "BTC / USD".to_string(),
            },
        );
        polygon_mainnet.insert(
            "ETH/USD".to_string(),
            PriceFeedInfo {
                address: "0xF9680D99D6C9589e2a93a78A04A279e509205945"
                    .parse()
                    .unwrap(),
                decimals: 8,
                description: "ETH / USD".to_string(),
            },
        );
        polygon_mainnet.insert(
            "MATIC/USD".to_string(),
            PriceFeedInfo {
                address: "0xAB594600376Ec9fD91F8e885dADF0CE036862dE0"
                    .parse()
                    .unwrap(),
                decimals: 8,
                description: "MATIC / USD".to_string(),
            },
        );
        polygon_mainnet.insert(
            "LINK/USD".to_string(),
            PriceFeedInfo {
                address: "0xd9FFdb71EbE7496cC440152d43986Aae0AB76665"
                    .parse()
                    .unwrap(),
                decimals: 8,
                description: "LINK / USD".to_string(),
            },
        );
        feeds.insert(Network::PolygonMainnet, polygon_mainnet);

        // Polygon Mumbai Testnet (deprecated, but keeping for reference)
        let polygon_mumbai = HashMap::new();
        feeds.insert(Network::PolygonMumbai, polygon_mumbai);

        feeds
    }

    /// Get list of supported price feeds for a network
    pub fn get_supported_feeds(&self, network: Network) -> Vec<String> {
        self.price_feeds
            .get(&network)
            .map(|feeds| feeds.keys().cloned().collect())
            .unwrap_or_default()
    }

    /// Get list of connected networks
    pub fn get_connected_networks(&self) -> Vec<Network> {
        self.providers.keys().cloned().collect()
    }

    /// Check if a network is connected
    pub fn is_connected(&self, network: Network) -> bool {
        self.providers.contains_key(&network)
    }

    /// Get the latest price from a Chainlink price feed
    pub async fn get_price(
        &self,
        network: Network,
        feed: &str,
    ) -> Result<PriceData, ChainlinkError> {
        // Get provider for network
        let provider = self
            .providers
            .get(&network)
            .ok_or_else(|| ChainlinkError::NetworkNotSupported(network.to_string()))?;

        // Get price feed info
        let feed_info = self
            .price_feeds
            .get(&network)
            .and_then(|feeds| feeds.get(feed))
            .ok_or_else(|| {
                ChainlinkError::PriceFeedNotFound(format!("{} on {}", feed, network))
            })?;

        // Create contract instance
        let contract = ChainlinkAggregator::new(feed_info.address, Arc::clone(provider));

        // Call latestRoundData
        let (round_id, answer, _started_at, updated_at, _answered_in_round) = contract
            .latest_round_data()
            .call()
            .await
            .map_err(|e| ChainlinkError::ContractError(e.to_string()))?;

        // Check if price is stale
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let price_age = now.saturating_sub(updated_at.as_u64());

        if price_age > self.max_price_age {
            warn!(
                "Stale price data for {} on {}: {} seconds old",
                feed, network, price_age
            );
            // Don't fail, just warn - some feeds update less frequently
        }

        // Convert answer to Decimal
        // Chainlink prices are typically in 8 decimals
        let divisor = Decimal::new(10i64.pow(feed_info.decimals as u32), 0);
        let price = Decimal::new(answer.as_i128() as i64, 0) / divisor;

        debug!(
            "Chainlink price: {} = {} USD (updated {} seconds ago)",
            feed, price, price_age
        );

        Ok(PriceData {
            price,
            decimals: feed_info.decimals,
            round_id,
            updated_at: updated_at.as_u64(),
            network: network.to_string(),
            feed: feed.to_string(),
        })
    }

    /// Get price from the best available network (mainnet first, then testnet)
    pub async fn get_price_any_network(&self, feed: &str) -> Result<PriceData, ChainlinkError> {
        // Try networks in priority order
        let priority = [
            Network::EthereumMainnet,
            Network::PolygonMainnet,
            Network::EthereumSepolia,
            Network::PolygonMumbai,
        ];

        for network in priority {
            if self.is_connected(network) {
                match self.get_price(network, feed).await {
                    Ok(price) => return Ok(price),
                    Err(e) => {
                        debug!("Failed to get {} from {}: {}", feed, network, e);
                        continue;
                    }
                }
            }
        }

        Err(ChainlinkError::PriceFeedNotFound(format!(
            "{} not available on any connected network",
            feed
        )))
    }

    /// Check if a price threshold is met (for market resolution)
    ///
    /// Returns:
    /// - `Some(true)` if price >= threshold
    /// - `Some(false)` if price < threshold
    /// - `None` if price couldn't be fetched
    pub async fn check_price_threshold(
        &self,
        network: Network,
        feed: &str,
        threshold: Decimal,
        comparison: ThresholdComparison,
    ) -> Option<bool> {
        match self.get_price(network, feed).await {
            Ok(price_data) => {
                let result = match comparison {
                    ThresholdComparison::GreaterOrEqual => price_data.price >= threshold,
                    ThresholdComparison::Greater => price_data.price > threshold,
                    ThresholdComparison::LessOrEqual => price_data.price <= threshold,
                    ThresholdComparison::Less => price_data.price < threshold,
                    ThresholdComparison::Equal => price_data.price == threshold,
                };

                info!(
                    "Price check: {} {} {} {} = {}",
                    feed,
                    price_data.price,
                    comparison,
                    threshold,
                    result
                );

                Some(result)
            }
            Err(e) => {
                error!("Failed to check price threshold: {}", e);
                None
            }
        }
    }

    /// Register a custom price feed address
    pub fn register_price_feed(
        &mut self,
        network: Network,
        name: String,
        address: Address,
        decimals: u8,
    ) {
        let feeds = self.price_feeds.entry(network).or_insert_with(HashMap::new);
        feeds.insert(
            name.clone(),
            PriceFeedInfo {
                address,
                decimals,
                description: name,
            },
        );
    }
}

/// Comparison type for price threshold checks
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ThresholdComparison {
    GreaterOrEqual, // >=
    Greater,        // >
    LessOrEqual,    // <=
    Less,           // <
    Equal,          // ==
}

impl std::fmt::Display for ThresholdComparison {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ThresholdComparison::GreaterOrEqual => write!(f, ">="),
            ThresholdComparison::Greater => write!(f, ">"),
            ThresholdComparison::LessOrEqual => write!(f, "<="),
            ThresholdComparison::Less => write!(f, "<"),
            ThresholdComparison::Equal => write!(f, "=="),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_network_chain_id() {
        assert_eq!(Network::EthereumMainnet.chain_id(), 1);
        assert_eq!(Network::EthereumSepolia.chain_id(), 11155111);
        assert_eq!(Network::PolygonMainnet.chain_id(), 137);
    }

    #[test]
    fn test_network_is_testnet() {
        assert!(!Network::EthereumMainnet.is_testnet());
        assert!(Network::EthereumSepolia.is_testnet());
        assert!(!Network::PolygonMainnet.is_testnet());
        assert!(Network::PolygonMumbai.is_testnet());
    }

    #[test]
    fn test_network_display() {
        assert_eq!(Network::EthereumMainnet.to_string(), "ethereum-mainnet");
        assert_eq!(Network::PolygonMainnet.to_string(), "polygon-mainnet");
    }

    #[test]
    fn test_threshold_comparison_display() {
        assert_eq!(ThresholdComparison::GreaterOrEqual.to_string(), ">=");
        assert_eq!(ThresholdComparison::Less.to_string(), "<");
    }

    #[test]
    fn test_init_price_feeds() {
        let feeds = ChainlinkClient::init_price_feeds();

        // Check Ethereum Mainnet feeds exist
        let eth_feeds = feeds.get(&Network::EthereumMainnet).unwrap();
        assert!(eth_feeds.contains_key("BTC/USD"));
        assert!(eth_feeds.contains_key("ETH/USD"));

        // Check Polygon Mainnet feeds exist
        let polygon_feeds = feeds.get(&Network::PolygonMainnet).unwrap();
        assert!(polygon_feeds.contains_key("BTC/USD"));
        assert!(polygon_feeds.contains_key("MATIC/USD"));

        // Check Sepolia testnet feeds exist
        let sepolia_feeds = feeds.get(&Network::EthereumSepolia).unwrap();
        assert!(sepolia_feeds.contains_key("BTC/USD"));
        assert!(sepolia_feeds.contains_key("ETH/USD"));
    }
}
