//! Oracle API Handlers
//!
//! Provides endpoints for querying external oracle prices (Chainlink, etc.)

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::AppState;

// ============================================================================
// Response Types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: String,
}

/// Chainlink price response
#[derive(Debug, Serialize)]
pub struct ChainlinkPriceResponse {
    pub feed: String,
    pub price: String,
    pub decimals: u8,
    pub network: String,
    pub updated_at: u64,
    pub round_id: String,
}

/// Available price feeds response
#[derive(Debug, Serialize)]
pub struct AvailableFeedsResponse {
    pub feeds: Vec<FeedInfo>,
}

#[derive(Debug, Serialize)]
pub struct FeedInfo {
    pub name: String,
    pub networks: Vec<String>,
}

/// Query params for price endpoint
#[derive(Debug, Deserialize)]
pub struct PriceQuery {
    /// Preferred network (optional): ethereum_mainnet, ethereum_sepolia, polygon_mainnet, polygon_mumbai
    pub network: Option<String>,
}

// ============================================================================
// Handlers
// ============================================================================

/// GET /oracle/chainlink/feeds
/// List available Chainlink price feeds
pub async fn list_chainlink_feeds(
    State(state): State<Arc<AppState>>,
) -> Result<Json<AvailableFeedsResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Check if Chainlink is configured
    if state.chainlink_client.is_none() {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "Chainlink oracle not configured".to_string(),
                code: "CHAINLINK_NOT_CONFIGURED".to_string(),
            }),
        ));
    }

    // Return available feeds (hardcoded for now, could be dynamic)
    let feeds = vec![
        FeedInfo {
            name: "BTC/USD".to_string(),
            networks: vec![
                "ethereum_mainnet".to_string(),
                "ethereum_sepolia".to_string(),
                "polygon_mainnet".to_string(),
            ],
        },
        FeedInfo {
            name: "ETH/USD".to_string(),
            networks: vec![
                "ethereum_mainnet".to_string(),
                "ethereum_sepolia".to_string(),
                "polygon_mainnet".to_string(),
            ],
        },
        FeedInfo {
            name: "LINK/USD".to_string(),
            networks: vec![
                "ethereum_mainnet".to_string(),
                "polygon_mainnet".to_string(),
            ],
        },
        FeedInfo {
            name: "MATIC/USD".to_string(),
            networks: vec![
                "ethereum_mainnet".to_string(),
                "polygon_mainnet".to_string(),
            ],
        },
    ];

    Ok(Json(AvailableFeedsResponse { feeds }))
}

/// GET /oracle/chainlink/price/:feed
/// Get current price for a Chainlink feed (e.g., BTC/USD, ETH/USD)
pub async fn get_chainlink_price(
    State(state): State<Arc<AppState>>,
    Path(feed): Path<String>,
    Query(query): Query<PriceQuery>,
) -> Result<Json<ChainlinkPriceResponse>, (StatusCode, Json<ErrorResponse>)> {
    let client = state.chainlink_client.as_ref().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "Chainlink oracle not configured".to_string(),
                code: "CHAINLINK_NOT_CONFIGURED".to_string(),
            }),
        )
    })?;

    // Normalize feed name (e.g., "btcusd" -> "BTC/USD")
    let normalized_feed = normalize_feed_name(&feed);

    // Get price based on network preference
    let price_data = if let Some(network_str) = query.network {
        // Parse network from string
        let network = parse_network(&network_str).ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: format!("Invalid network: {}. Valid options: ethereum_mainnet, ethereum_sepolia, polygon_mainnet, polygon_mumbai", network_str),
                    code: "INVALID_NETWORK".to_string(),
                }),
            )
        })?;

        client.get_price(network, &normalized_feed).await
    } else {
        // Try any available network
        client.get_price_any_network(&normalized_feed).await
    };

    match price_data {
        Ok(data) => Ok(Json(ChainlinkPriceResponse {
            feed: normalized_feed,
            price: data.price.to_string(),
            decimals: data.decimals,
            network: data.network,
            updated_at: data.updated_at,
            round_id: data.round_id.to_string(),
        })),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("Failed to fetch price: {}", e),
                code: "PRICE_FETCH_FAILED".to_string(),
            }),
        )),
    }
}

/// GET /oracle/chainlink/prices
/// Get prices for multiple feeds at once
#[derive(Debug, Deserialize)]
pub struct MultiPriceQuery {
    /// Comma-separated list of feeds (e.g., "BTC/USD,ETH/USD")
    pub feeds: String,
}

#[derive(Debug, Serialize)]
pub struct MultiPriceResponse {
    pub prices: Vec<PriceResult>,
}

#[derive(Debug, Serialize)]
pub struct PriceResult {
    pub feed: String,
    pub price: Option<String>,
    pub network: Option<String>,
    pub error: Option<String>,
}

/// GET /oracle/chainlink/prices?feeds=BTC/USD,ETH/USD
pub async fn get_chainlink_prices(
    State(state): State<Arc<AppState>>,
    Query(query): Query<MultiPriceQuery>,
) -> Result<Json<MultiPriceResponse>, (StatusCode, Json<ErrorResponse>)> {
    let client = state.chainlink_client.as_ref().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "Chainlink oracle not configured".to_string(),
                code: "CHAINLINK_NOT_CONFIGURED".to_string(),
            }),
        )
    })?;

    let feed_list: Vec<&str> = query.feeds.split(',').map(|s| s.trim()).collect();
    let mut prices = Vec::new();

    for feed in feed_list {
        let normalized = normalize_feed_name(feed);
        match client.get_price_any_network(&normalized).await {
            Ok(data) => {
                prices.push(PriceResult {
                    feed: normalized,
                    price: Some(data.price.to_string()),
                    network: Some(data.network),
                    error: None,
                });
            }
            Err(e) => {
                prices.push(PriceResult {
                    feed: normalized,
                    price: None,
                    network: None,
                    error: Some(e.to_string()),
                });
            }
        }
    }

    Ok(Json(MultiPriceResponse { prices }))
}

/// GET /oracle/status
/// Get oracle service status
#[derive(Debug, Serialize)]
pub struct OracleStatusResponse {
    pub chainlink: OracleProviderStatus,
    pub uma: OracleProviderStatus,
    pub pyth: OracleProviderStatus,
}

#[derive(Debug, Serialize)]
pub struct OracleProviderStatus {
    pub available: bool,
    pub networks: Vec<String>,
}

pub async fn get_oracle_status(
    State(state): State<Arc<AppState>>,
) -> Json<OracleStatusResponse> {
    let chainlink_status = if let Some(client) = &state.chainlink_client {
        OracleProviderStatus {
            available: true,
            networks: client.available_networks().iter().map(|n| n.to_string()).collect(),
        }
    } else {
        OracleProviderStatus {
            available: false,
            networks: vec![],
        }
    };

    Json(OracleStatusResponse {
        chainlink: chainlink_status,
        uma: OracleProviderStatus {
            available: false,
            networks: vec![],
        },
        pyth: OracleProviderStatus {
            available: false,
            networks: vec![],
        },
    })
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Normalize feed name to standard format (e.g., "btcusd" -> "BTC/USD")
fn normalize_feed_name(feed: &str) -> String {
    let upper = feed.to_uppercase().replace('-', "/").replace('_', "/");

    // If already has slash, return as-is
    if upper.contains('/') {
        return upper;
    }

    // Try to split common patterns
    if upper.ends_with("USD") && upper.len() > 3 {
        let base = &upper[..upper.len() - 3];
        return format!("{}/USD", base);
    }

    upper
}

/// Parse network string to Network enum
fn parse_network(s: &str) -> Option<crate::services::chainlink::Network> {
    use crate::services::chainlink::Network;

    match s.to_lowercase().as_str() {
        "ethereum_mainnet" | "eth_mainnet" | "ethereum" | "mainnet" => Some(Network::EthereumMainnet),
        "ethereum_sepolia" | "eth_sepolia" | "sepolia" => Some(Network::EthereumSepolia),
        "polygon_mainnet" | "polygon" | "matic" => Some(Network::PolygonMainnet),
        "polygon_mumbai" | "mumbai" => Some(Network::PolygonMumbai),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_feed_name() {
        assert_eq!(normalize_feed_name("btcusd"), "BTC/USD");
        assert_eq!(normalize_feed_name("BTC/USD"), "BTC/USD");
        assert_eq!(normalize_feed_name("eth-usd"), "ETH/USD");
        assert_eq!(normalize_feed_name("LINK_USD"), "LINK/USD");
        assert_eq!(normalize_feed_name("maticusd"), "MATIC/USD");
    }

    #[test]
    fn test_parse_network() {
        use crate::services::chainlink::Network;

        assert_eq!(parse_network("ethereum_mainnet"), Some(Network::EthereumMainnet));
        assert_eq!(parse_network("mainnet"), Some(Network::EthereumMainnet));
        assert_eq!(parse_network("sepolia"), Some(Network::EthereumSepolia));
        assert_eq!(parse_network("polygon"), Some(Network::PolygonMainnet));
        assert_eq!(parse_network("mumbai"), Some(Network::PolygonMumbai));
        assert_eq!(parse_network("invalid"), None);
    }
}
