use std::net::SocketAddr;
use std::sync::Arc;

use axum::{middleware, routing::get, Router};
use serde::Serialize;
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// Order update event for real-time WebSocket push
#[derive(Debug, Clone, Serialize)]
pub struct OrderUpdateEvent {
    pub user_address: String,
    pub order: models::order::OrderResponse,
}

/// Balance update event for real-time WebSocket push
#[derive(Debug, Clone, Serialize)]
pub struct BalanceUpdateEvent {
    pub user_address: String,
    pub token: String,
    pub available: String,
    pub frozen: String,
    pub total: String,
    pub event_type: String, // "deposit", "withdrawal", "trade", "freeze", "unfreeze"
}

mod api;
mod auth;
mod blockchain;
mod cache;
mod config;
mod db;
mod metrics;
mod models;
mod services;
mod utils;
mod websocket;

use crate::blockchain::{BlockchainClient, EventListener};
use crate::cache::{CacheConfig, CacheManager};
use crate::config::AppConfig;
use crate::db::Database;
use crate::services::chainlink::ChainlinkClient;
use crate::services::event_processor::{EventProcessor, EventProcessorConfig};
use crate::services::matching::MatchingEngine;
use crate::services::market::MarketService;
use crate::services::settlement::{MatchedOrders, SettlementConfig, SettlementService};
use ethers::types::Address;
use metrics_exporter_prometheus::PrometheusHandle;
use std::str::FromStr;
use tokio::sync::mpsc;

pub struct AppState {
    pub config: AppConfig,
    pub db: Database,
    pub cache: Arc<CacheManager>,
    pub matching_engine: Arc<MatchingEngine>,
    pub market_service: Arc<MarketService>,
    pub order_update_sender: broadcast::Sender<OrderUpdateEvent>,
    pub balance_update_sender: broadcast::Sender<BalanceUpdateEvent>,
    pub metrics_handle: PrometheusHandle,
    pub chainlink_client: Option<Arc<ChainlinkClient>>,
    pub blockchain_client: Option<Arc<BlockchainClient>>,
    /// Settlement queue sender for on-chain order settlement
    pub settlement_sender: Option<mpsc::Sender<MatchedOrders>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "polymarket_backend=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    dotenvy::dotenv().ok();
    let config = AppConfig::load()?;

    tracing::info!("Starting Polymarket Backend v{}", env!("CARGO_PKG_VERSION"));
    tracing::info!("Environment: {}", config.environment);

    // Initialize Prometheus metrics
    let metrics_handle = metrics::init_metrics();
    tracing::info!("Prometheus metrics initialized");

    // Initialize EIP-712 domain from config
    crate::auth::eip712::init_domain(config.chain_id, &config.vault_address);

    // Initialize database
    let db = Database::connect(&config.database_url).await?;
    tracing::info!("Database connected");

    // Initialize cache manager (Redis)
    let cache_config = CacheConfig::from_env();
    let cache = Arc::new(CacheManager::new(cache_config).await?);
    if cache.is_available() {
        tracing::info!("Cache manager initialized with Redis at {}", cache.config().redis_url);
    } else {
        tracing::warn!("Cache manager running without Redis (graceful degradation)");
    }

    // Initialize market service
    let market_service = Arc::new(MarketService::new());
    tracing::info!("Market service initialized");

    // Initialize matching engine
    let matching_engine = Arc::new(MatchingEngine::new());
    tracing::info!("Matching engine initialized");

    // Recover open limit orders from database
    match matching_engine.recover_orders_from_db(&db.pool).await {
        Ok(count) => {
            if count > 0 {
                tracing::info!("Recovered {} open limit orders to orderbook", count);
            } else {
                tracing::info!("No open orders to recover");
            }
        }
        Err(e) => {
            tracing::error!("Failed to recover orders from database: {}", e);
            tracing::warn!("Starting with empty orderbook");
        }
    }

    // Create order update broadcast channel for real-time WebSocket push
    let (order_update_sender, _) = broadcast::channel::<OrderUpdateEvent>(1000);
    tracing::info!("Order update broadcast channel created");

    // Create balance update broadcast channel for real-time WebSocket push
    let (balance_update_sender, _) = broadcast::channel::<BalanceUpdateEvent>(1000);
    tracing::info!("Balance update broadcast channel created");

    // Initialize Chainlink client (optional)
    let chainlink_client = config.create_chainlink_client().map(|client| {
        tracing::info!("Chainlink Oracle client initialized");
        Arc::new(client)
    });
    if chainlink_client.is_none() && config.has_chainlink_config() {
        tracing::warn!("Chainlink config found but client initialization failed");
    }

    // Initialize Blockchain client for CTF contracts (optional)
    let blockchain_client = if config.has_ctf_config() {
        match config.create_blockchain_client() {
            Ok(client) => {
                tracing::info!(
                    "Blockchain client initialized for chain_id={}, contracts: USDC={}, CTF={}, Exchange={}",
                    config.chain_id,
                    config.ctf_usdc_address,
                    config.ctf_conditional_tokens_address,
                    config.ctf_exchange_address
                );
                Some(Arc::new(client))
            }
            Err(e) => {
                tracing::warn!("Failed to initialize blockchain client: {}", e);
                None
            }
        }
    } else {
        tracing::info!("CTF contracts not configured, blockchain client disabled");
        None
    };

    // Initialize settlement service if blockchain client is available
    let settlement_sender = if let Some(ref bc) = blockchain_client {
        let settlement_config = SettlementConfig {
            enabled: std::env::var("SETTLEMENT_ENABLED")
                .map(|v| v == "true" || v == "1")
                .unwrap_or(false),
            max_gas_price_gwei: std::env::var("SETTLEMENT_MAX_GAS_GWEI")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(100),
            confirmations: std::env::var("SETTLEMENT_CONFIRMATIONS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(2),
            max_retries: std::env::var("SETTLEMENT_MAX_RETRIES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3),
            retry_delay_secs: std::env::var("SETTLEMENT_RETRY_DELAY")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(5),
        };

        let settlement_service = SettlementService::new(
            bc.clone(),
            db.pool.clone(),
            settlement_config.clone(),
        );

        let sender = settlement_service.start_worker();
        tracing::info!(
            "Settlement service started (enabled: {})",
            settlement_config.enabled
        );
        Some(sender)
    } else {
        tracing::info!("Settlement service disabled (no blockchain client)");
        None
    };

    // Initialize event processor if blockchain client is available
    if let Some(ref bc) = blockchain_client {
        let event_processor_enabled = std::env::var("EVENT_PROCESSOR_ENABLED")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        if event_processor_enabled {
            let start_block = std::env::var("EVENT_PROCESSOR_START_BLOCK")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0u64);

            let vault_address = Address::from_str(&config.vault_address).unwrap_or_default();

            let event_config = EventProcessorConfig {
                enabled: true,
                start_block,
                vault_address,
            };

            let addresses = bc.addresses().clone();
            let event_listener = Arc::new(EventListener::new(
                bc.provider().clone().into(),
                addresses.clone(),
                start_block,
            ));

            let event_processor = EventProcessor::new(
                db.pool.clone(),
                event_config,
                addresses,
                balance_update_sender.clone(),
            );

            event_processor.start(event_listener);
            tracing::info!("Event processor started from block {}", start_block);
        } else {
            tracing::info!("Event processor disabled");
        }
    }

    // Build application state
    let state = Arc::new(AppState {
        config: config.clone(),
        db,
        cache,
        matching_engine,
        market_service,
        order_update_sender,
        balance_update_sender,
        metrics_handle,
        chainlink_client,
        blockchain_client,
        settlement_sender,
    });

    // Note: Trade persistence is now handled synchronously in the order handler.
    // The matching engine still broadcasts trades for websocket subscribers.
    // Keeping a subscriber to prevent channel backpressure.
    let mut trade_receiver = state.matching_engine.subscribe_trades();
    tokio::spawn(async move {
        tracing::info!("Trade broadcast consumer started");
        while let Ok(_trade_event) = trade_receiver.recv().await {
            // Trades are persisted synchronously in order handler
            // This consumer just drains the channel for websocket broadcasts
        }
        tracing::warn!("Trade broadcast consumer stopped");
    });
    tracing::info!("Trade broadcast consumer spawned");

    // Build router
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/metrics", get(metrics_endpoint))
        .nest("/api/v1", api::routes::create_router(state.clone()))
        .nest("/ws", websocket::routes::create_router(state.clone()))
        .layer(middleware::from_fn(api::middleware::metrics_middleware))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> &'static str {
    "OK"
}

/// Prometheus metrics endpoint
async fn metrics_endpoint(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
) -> String {
    state.metrics_handle.render()
}
