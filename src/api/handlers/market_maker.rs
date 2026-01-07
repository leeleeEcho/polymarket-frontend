//! Market Maker API Handlers
//!
//! Provides specialized endpoints for market makers:
//! - Batch order placement and cancellation
//! - Spread management
//! - Market maker statistics and performance
//! - Fee tier information

use axum::{
    extract::State,
    http::StatusCode,
    Json,
};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::models::market::ShareType;
use crate::models::order::OrderSide;
use crate::AppState;

use super::market::ErrorResponse;

// ============================================================================
// Request/Response Types
// ============================================================================

/// Single order in a batch
#[derive(Debug, Deserialize)]
pub struct BatchOrderItem {
    pub market_id: Uuid,
    pub outcome_id: Uuid,
    pub share_type: ShareType,
    pub side: OrderSide,
    pub price: Decimal,
    pub amount: Decimal,
    /// Optional client order ID for tracking
    pub client_order_id: Option<String>,
}

/// Batch order placement request
#[derive(Debug, Deserialize)]
pub struct BatchOrderRequest {
    pub orders: Vec<BatchOrderItem>,
    /// If true, all orders must succeed or none are placed
    pub atomic: Option<bool>,
}

/// Result of a single order in batch
#[derive(Debug, Serialize)]
pub struct BatchOrderResult {
    pub index: usize,
    pub success: bool,
    pub order_id: Option<Uuid>,
    pub client_order_id: Option<String>,
    pub error: Option<String>,
}

/// Batch order response
#[derive(Debug, Serialize)]
pub struct BatchOrderResponse {
    pub total: usize,
    pub successful: usize,
    pub failed: usize,
    pub results: Vec<BatchOrderResult>,
}

/// Batch cancel request
#[derive(Debug, Deserialize)]
pub struct BatchCancelRequest {
    /// List of order IDs to cancel
    pub order_ids: Option<Vec<Uuid>>,
    /// Cancel all orders for a specific market
    pub market_id: Option<Uuid>,
    /// Cancel all orders for a specific outcome
    pub outcome_id: Option<Uuid>,
    /// Cancel only orders on a specific side
    pub side: Option<OrderSide>,
}

/// Batch cancel response
#[derive(Debug, Serialize)]
pub struct BatchCancelResponse {
    pub cancelled: usize,
    pub failed: usize,
    pub order_ids: Vec<Uuid>,
}

/// Two-sided quote for market making
#[derive(Debug, Deserialize)]
pub struct TwoSidedQuote {
    pub market_id: Uuid,
    pub outcome_id: Uuid,
    pub share_type: ShareType,
    pub bid_price: Decimal,
    pub bid_size: Decimal,
    pub ask_price: Decimal,
    pub ask_size: Decimal,
}

/// Quote update request
#[derive(Debug, Deserialize)]
pub struct UpdateQuotesRequest {
    pub quotes: Vec<TwoSidedQuote>,
    /// Cancel existing orders before placing new ones
    pub replace_existing: Option<bool>,
}

/// Quote update response
#[derive(Debug, Serialize)]
pub struct UpdateQuotesResponse {
    pub cancelled: usize,
    pub placed: usize,
    pub quotes: Vec<QuoteResult>,
}

#[derive(Debug, Serialize)]
pub struct QuoteResult {
    pub market_id: Uuid,
    pub outcome_id: Uuid,
    pub bid_order_id: Option<Uuid>,
    pub ask_order_id: Option<Uuid>,
    pub error: Option<String>,
}

/// Market maker stats request
#[derive(Debug, Deserialize)]
pub struct StatsQuery {
    pub market_id: Option<Uuid>,
    pub days: Option<i32>,
}

/// Market maker statistics
#[derive(Debug, Serialize)]
pub struct MarketMakerStats {
    pub address: String,
    pub total_orders: i64,
    pub total_fills: i64,
    pub total_volume: Decimal,
    pub total_fees_paid: Decimal,
    pub total_fees_rebate: Decimal,
    pub maker_volume: Decimal,
    pub taker_volume: Decimal,
    pub fill_rate: Decimal,
    pub avg_spread: Option<Decimal>,
    pub current_open_orders: i64,
    pub fee_tier: FeeTier,
}

/// Fee tier information
#[derive(Debug, Serialize, Clone)]
pub struct FeeTier {
    pub tier: String,
    pub maker_fee_bps: i32,
    pub taker_fee_bps: i32,
    pub volume_threshold: Decimal,
}

/// All available fee tiers
#[derive(Debug, Serialize)]
pub struct FeeTiersResponse {
    pub tiers: Vec<FeeTier>,
    pub current_tier: FeeTier,
    pub volume_30d: Decimal,
    pub next_tier: Option<FeeTier>,
    pub volume_to_next_tier: Option<Decimal>,
}

// ============================================================================
// Fee Tier Configuration
// ============================================================================

fn get_all_fee_tiers() -> Vec<FeeTier> {
    vec![
        FeeTier {
            tier: "standard".to_string(),
            maker_fee_bps: 10,  // 0.10%
            taker_fee_bps: 20,  // 0.20%
            volume_threshold: Decimal::ZERO,
        },
        FeeTier {
            tier: "bronze".to_string(),
            maker_fee_bps: 8,   // 0.08%
            taker_fee_bps: 18,  // 0.18%
            volume_threshold: Decimal::from(10_000),
        },
        FeeTier {
            tier: "silver".to_string(),
            maker_fee_bps: 5,   // 0.05%
            taker_fee_bps: 15,  // 0.15%
            volume_threshold: Decimal::from(100_000),
        },
        FeeTier {
            tier: "gold".to_string(),
            maker_fee_bps: 2,   // 0.02%
            taker_fee_bps: 10,  // 0.10%
            volume_threshold: Decimal::from(1_000_000),
        },
        FeeTier {
            tier: "platinum".to_string(),
            maker_fee_bps: 0,   // 0% (rebate)
            taker_fee_bps: 5,   // 0.05%
            volume_threshold: Decimal::from(10_000_000),
        },
    ]
}

fn get_user_fee_tier(volume_30d: Decimal) -> FeeTier {
    let tiers = get_all_fee_tiers();
    let mut current_tier = tiers[0].clone();

    for tier in tiers {
        if volume_30d >= tier.volume_threshold {
            current_tier = tier;
        } else {
            break;
        }
    }

    current_tier
}

// ============================================================================
// Handlers
// ============================================================================

/// Place multiple orders in a batch
/// POST /api/v1/mm/orders/batch
pub async fn batch_place_orders(
    State(state): State<Arc<AppState>>,
    axum::Extension(user_address): axum::Extension<String>,
    Json(req): Json<BatchOrderRequest>,
) -> Result<Json<BatchOrderResponse>, (StatusCode, Json<ErrorResponse>)> {
    let atomic = req.atomic.unwrap_or(false);
    let mut results = Vec::new();
    let mut successful = 0;
    let mut failed = 0;

    // In atomic mode, we'd use a transaction
    // For now, process orders sequentially
    for (index, order_item) in req.orders.into_iter().enumerate() {
        let result = place_single_order(
            &state,
            &user_address,
            order_item.market_id,
            order_item.outcome_id,
            order_item.share_type,
            order_item.side,
            order_item.price,
            order_item.amount,
        )
        .await;

        match result {
            Ok(order_id) => {
                successful += 1;
                results.push(BatchOrderResult {
                    index,
                    success: true,
                    order_id: Some(order_id),
                    client_order_id: order_item.client_order_id,
                    error: None,
                });
            }
            Err(e) => {
                failed += 1;
                results.push(BatchOrderResult {
                    index,
                    success: false,
                    order_id: None,
                    client_order_id: order_item.client_order_id,
                    error: Some(e),
                });

                if atomic {
                    // In atomic mode, cancel all successful orders on first failure
                    for res in &results {
                        if res.success {
                            if let Some(order_id) = res.order_id {
                                let _ = cancel_order_internal(&state, &user_address, order_id).await;
                            }
                        }
                    }
                    return Err((
                        StatusCode::BAD_REQUEST,
                        Json(ErrorResponse {
                            error: "Atomic batch failed".to_string(),
                            code: "ATOMIC_BATCH_FAILED".to_string(),
                        }),
                    ));
                }
            }
        }
    }

    Ok(Json(BatchOrderResponse {
        total: results.len(),
        successful,
        failed,
        results,
    }))
}

/// Cancel multiple orders
/// DELETE /api/v1/mm/orders/batch
pub async fn batch_cancel_orders(
    State(state): State<Arc<AppState>>,
    axum::Extension(user_address): axum::Extension<String>,
    Json(req): Json<BatchCancelRequest>,
) -> Result<Json<BatchCancelResponse>, (StatusCode, Json<ErrorResponse>)> {
    let mut order_ids_to_cancel: Vec<Uuid> = Vec::new();

    // If specific order IDs provided
    if let Some(ids) = req.order_ids {
        order_ids_to_cancel.extend(ids);
    }

    // If market_id or outcome_id provided, fetch matching orders
    if req.market_id.is_some() || req.outcome_id.is_some() {
        let mut query = String::from(
            "SELECT id FROM orders WHERE user_address = $1 AND status = 'open'"
        );
        let mut param_count = 1;

        if req.market_id.is_some() {
            param_count += 1;
            query.push_str(&format!(" AND market_id = ${}", param_count));
        }

        if req.outcome_id.is_some() {
            param_count += 1;
            query.push_str(&format!(" AND outcome_id = ${}", param_count));
        }

        if req.side.is_some() {
            param_count += 1;
            query.push_str(&format!(" AND side = ${}", param_count));
        }

        // Build and execute query dynamically
        let orders: Vec<(Uuid,)> = match (req.market_id, req.outcome_id, req.side) {
            (Some(mid), Some(oid), Some(side)) => {
                sqlx::query_as(&query)
                    .bind(&user_address)
                    .bind(mid)
                    .bind(oid)
                    .bind(side.to_string())
                    .fetch_all(&state.db.pool)
                    .await
            }
            (Some(mid), Some(oid), None) => {
                sqlx::query_as(&query)
                    .bind(&user_address)
                    .bind(mid)
                    .bind(oid)
                    .fetch_all(&state.db.pool)
                    .await
            }
            (Some(mid), None, Some(side)) => {
                sqlx::query_as(&query)
                    .bind(&user_address)
                    .bind(mid)
                    .bind(side.to_string())
                    .fetch_all(&state.db.pool)
                    .await
            }
            (Some(mid), None, None) => {
                sqlx::query_as(&query)
                    .bind(&user_address)
                    .bind(mid)
                    .fetch_all(&state.db.pool)
                    .await
            }
            (None, Some(oid), Some(side)) => {
                sqlx::query_as(&query)
                    .bind(&user_address)
                    .bind(oid)
                    .bind(side.to_string())
                    .fetch_all(&state.db.pool)
                    .await
            }
            (None, Some(oid), None) => {
                sqlx::query_as(&query)
                    .bind(&user_address)
                    .bind(oid)
                    .fetch_all(&state.db.pool)
                    .await
            }
            _ => Ok(vec![]),
        }
        .map_err(|e| {
            tracing::error!("Failed to fetch orders: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to fetch orders".to_string(),
                    code: "ORDER_FETCH_FAILED".to_string(),
                }),
            )
        })?;

        order_ids_to_cancel.extend(orders.into_iter().map(|(id,)| id));
    }

    // Cancel orders
    let mut cancelled = 0;
    let mut failed = 0;
    let mut cancelled_ids = Vec::new();

    for order_id in order_ids_to_cancel {
        match cancel_order_internal(&state, &user_address, order_id).await {
            Ok(_) => {
                cancelled += 1;
                cancelled_ids.push(order_id);
            }
            Err(_) => {
                failed += 1;
            }
        }
    }

    Ok(Json(BatchCancelResponse {
        cancelled,
        failed,
        order_ids: cancelled_ids,
    }))
}

/// Update two-sided quotes (market making)
/// PUT /api/v1/mm/quotes
pub async fn update_quotes(
    State(state): State<Arc<AppState>>,
    axum::Extension(user_address): axum::Extension<String>,
    Json(req): Json<UpdateQuotesRequest>,
) -> Result<Json<UpdateQuotesResponse>, (StatusCode, Json<ErrorResponse>)> {
    let replace = req.replace_existing.unwrap_or(true);
    let mut cancelled = 0;
    let mut placed = 0;
    let mut quote_results = Vec::new();

    for quote in req.quotes {
        let mut bid_order_id = None;
        let mut ask_order_id = None;
        let mut error = None;

        // Cancel existing orders for this market/outcome if requested
        if replace {
            let existing: Vec<(Uuid,)> = sqlx::query_as(
                r#"
                SELECT id FROM orders
                WHERE user_address = $1 AND market_id = $2 AND outcome_id = $3 AND status = 'open'
                "#,
            )
            .bind(&user_address)
            .bind(quote.market_id)
            .bind(quote.outcome_id)
            .fetch_all(&state.db.pool)
            .await
            .unwrap_or_default();

            for (order_id,) in existing {
                if cancel_order_internal(&state, &user_address, order_id).await.is_ok() {
                    cancelled += 1;
                }
            }
        }

        // Place bid order
        if quote.bid_size > Decimal::ZERO {
            match place_single_order(
                &state,
                &user_address,
                quote.market_id,
                quote.outcome_id,
                quote.share_type,
                OrderSide::Buy,
                quote.bid_price,
                quote.bid_size,
            )
            .await
            {
                Ok(id) => {
                    bid_order_id = Some(id);
                    placed += 1;
                }
                Err(e) => {
                    error = Some(format!("Bid failed: {}", e));
                }
            }
        }

        // Place ask order
        if quote.ask_size > Decimal::ZERO {
            match place_single_order(
                &state,
                &user_address,
                quote.market_id,
                quote.outcome_id,
                quote.share_type,
                OrderSide::Sell,
                quote.ask_price,
                quote.ask_size,
            )
            .await
            {
                Ok(id) => {
                    ask_order_id = Some(id);
                    placed += 1;
                }
                Err(e) => {
                    if error.is_some() {
                        error = Some(format!("{}, Ask failed: {}", error.unwrap(), e));
                    } else {
                        error = Some(format!("Ask failed: {}", e));
                    }
                }
            }
        }

        quote_results.push(QuoteResult {
            market_id: quote.market_id,
            outcome_id: quote.outcome_id,
            bid_order_id,
            ask_order_id,
            error,
        });
    }

    Ok(Json(UpdateQuotesResponse {
        cancelled,
        placed,
        quotes: quote_results,
    }))
}

/// Get market maker statistics
/// GET /api/v1/mm/stats
pub async fn get_mm_stats(
    State(state): State<Arc<AppState>>,
    axum::Extension(user_address): axum::Extension<String>,
    Query(query): Query<StatsQuery>,
) -> Result<Json<MarketMakerStats>, (StatusCode, Json<ErrorResponse>)> {
    let days = query.days.unwrap_or(30);
    let cutoff = chrono::Utc::now() - chrono::Duration::days(days as i64);

    // Get order statistics
    let order_stats: Option<(i64, i64, Option<Decimal>)> = sqlx::query_as(
        r#"
        SELECT
            COUNT(*) as total_orders,
            COUNT(*) FILTER (WHERE filled_amount > 0) as total_fills,
            COALESCE(SUM(filled_amount * price), 0) as total_volume
        FROM orders
        WHERE user_address = $1 AND created_at >= $2
        AND ($3::uuid IS NULL OR market_id = $3)
        "#,
    )
    .bind(&user_address)
    .bind(cutoff)
    .bind(query.market_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch order stats: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to fetch stats".to_string(),
                code: "STATS_FETCH_FAILED".to_string(),
            }),
        )
    })?;

    let (total_orders, total_fills, total_volume) = order_stats.unwrap_or((0, 0, None));
    let total_volume = total_volume.unwrap_or(Decimal::ZERO);

    // Get current open orders count
    let open_orders: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM orders WHERE user_address = $1 AND status = 'open'",
    )
    .bind(&user_address)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or((0,));

    // Calculate fill rate
    let fill_rate = if total_orders > 0 {
        Decimal::from(total_fills) / Decimal::from(total_orders)
    } else {
        Decimal::ZERO
    };

    // Get fee tier based on 30-day volume
    let volume_30d: (Option<Decimal>,) = sqlx::query_as(
        r#"
        SELECT COALESCE(SUM(filled_amount * price), 0)
        FROM orders
        WHERE user_address = $1 AND created_at >= NOW() - INTERVAL '30 days'
        "#,
    )
    .bind(&user_address)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or((None,));

    let volume_30d = volume_30d.0.unwrap_or(Decimal::ZERO);
    let fee_tier = get_user_fee_tier(volume_30d);

    Ok(Json(MarketMakerStats {
        address: user_address,
        total_orders,
        total_fills,
        total_volume,
        total_fees_paid: Decimal::ZERO, // TODO: Calculate from trades
        total_fees_rebate: Decimal::ZERO,
        maker_volume: total_volume, // Simplified
        taker_volume: Decimal::ZERO,
        fill_rate,
        avg_spread: None,
        current_open_orders: open_orders.0,
        fee_tier,
    }))
}

/// Get fee tiers information
/// GET /api/v1/mm/fee-tiers
pub async fn get_fee_tiers(
    State(state): State<Arc<AppState>>,
    axum::Extension(user_address): axum::Extension<String>,
) -> Result<Json<FeeTiersResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Get 30-day volume
    let volume_30d: (Option<Decimal>,) = sqlx::query_as(
        r#"
        SELECT COALESCE(SUM(filled_amount * price), 0)
        FROM orders
        WHERE user_address = $1 AND created_at >= NOW() - INTERVAL '30 days'
        "#,
    )
    .bind(&user_address)
    .fetch_one(&state.db.pool)
    .await
    .unwrap_or((None,));

    let volume_30d = volume_30d.0.unwrap_or(Decimal::ZERO);
    let tiers = get_all_fee_tiers();
    let current_tier = get_user_fee_tier(volume_30d);

    // Find next tier
    let mut next_tier = None;
    let mut volume_to_next = None;

    for tier in &tiers {
        if tier.volume_threshold > volume_30d {
            next_tier = Some(tier.clone());
            volume_to_next = Some(tier.volume_threshold - volume_30d);
            break;
        }
    }

    Ok(Json(FeeTiersResponse {
        tiers,
        current_tier,
        volume_30d,
        next_tier,
        volume_to_next_tier: volume_to_next,
    }))
}

/// Get all open orders for market maker
/// GET /api/v1/mm/orders
pub async fn get_mm_orders(
    State(state): State<Arc<AppState>>,
    axum::Extension(user_address): axum::Extension<String>,
    Query(query): Query<MmOrdersQuery>,
) -> Result<Json<MmOrdersResponse>, (StatusCode, Json<ErrorResponse>)> {
    let limit = query.limit.unwrap_or(100).min(500);

    let orders: Vec<(Uuid, Uuid, Uuid, String, String, Decimal, Decimal, Decimal, String)> =
        sqlx::query_as(
            r#"
            SELECT id, market_id, outcome_id, share_type, side, price, amount, filled_amount, status
            FROM orders
            WHERE user_address = $1 AND status = 'open'
            AND ($2::uuid IS NULL OR market_id = $2)
            ORDER BY created_at DESC
            LIMIT $3
            "#,
        )
        .bind(&user_address)
        .bind(query.market_id)
        .bind(limit)
        .fetch_all(&state.db.pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch MM orders: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to fetch orders".to_string(),
                    code: "ORDER_FETCH_FAILED".to_string(),
                }),
            )
        })?;

    let orders: Vec<MmOrderInfo> = orders
        .into_iter()
        .map(
            |(id, market_id, outcome_id, share_type, side, price, amount, filled, status)| {
                MmOrderInfo {
                    id,
                    market_id,
                    outcome_id,
                    share_type,
                    side,
                    price,
                    amount,
                    filled_amount: filled,
                    remaining: amount - filled,
                    status,
                }
            },
        )
        .collect();

    Ok(Json(MmOrdersResponse {
        total: orders.len(),
        orders,
    }))
}

#[derive(Debug, Deserialize)]
pub struct MmOrdersQuery {
    pub market_id: Option<Uuid>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct MmOrdersResponse {
    pub total: usize,
    pub orders: Vec<MmOrderInfo>,
}

#[derive(Debug, Serialize)]
pub struct MmOrderInfo {
    pub id: Uuid,
    pub market_id: Uuid,
    pub outcome_id: Uuid,
    pub share_type: String,
    pub side: String,
    pub price: Decimal,
    pub amount: Decimal,
    pub filled_amount: Decimal,
    pub remaining: Decimal,
    pub status: String,
}

// ============================================================================
// Helper Functions
// ============================================================================

async fn place_single_order(
    state: &Arc<AppState>,
    user_address: &str,
    market_id: Uuid,
    outcome_id: Uuid,
    share_type: ShareType,
    side: OrderSide,
    price: Decimal,
    amount: Decimal,
) -> Result<Uuid, String> {
    // Validate market exists and is active
    let market_status: Option<(String,)> =
        sqlx::query_as("SELECT status::text FROM markets WHERE id = $1")
            .bind(market_id)
            .fetch_optional(&state.db.pool)
            .await
            .map_err(|e| format!("DB error: {}", e))?;

    let (status,) = market_status.ok_or("Market not found")?;
    if status != "active" {
        return Err(format!("Market not active: {}", status));
    }

    // Create order
    let order_id = Uuid::new_v4();
    let now = chrono::Utc::now();

    sqlx::query(
        r#"
        INSERT INTO orders (
            id, user_address, market_id, outcome_id, share_type, side,
            order_type, price, amount, filled_amount, status, created_at
        )
        VALUES ($1, $2, $3, $4, $5::share_type, $6, 'limit', $7, $8, 0, 'open', $9)
        "#,
    )
    .bind(order_id)
    .bind(user_address)
    .bind(market_id)
    .bind(outcome_id)
    .bind(share_type.to_string())
    .bind(side.to_string())
    .bind(price)
    .bind(amount)
    .bind(now)
    .execute(&state.db.pool)
    .await
    .map_err(|e| format!("Failed to create order: {}", e))?;

    // Submit to matching engine
    let orderbook_key = format!("{}:{}:{}", market_id, outcome_id, share_type);
    let order_side = match side {
        OrderSide::Buy => crate::services::matching::Side::Buy,
        OrderSide::Sell => crate::services::matching::Side::Sell,
    };

    if let Err(e) = state.matching_engine.submit_order(
        order_id,
        &orderbook_key,
        user_address,
        order_side,
        crate::services::matching::OrderType::Limit,
        amount,
        Some(price),
        1,  // leverage (not used for prediction markets)
    ) {
        tracing::warn!("Failed to submit to matching engine: {}", e);
    }

    Ok(order_id)
}

async fn cancel_order_internal(
    state: &Arc<AppState>,
    user_address: &str,
    order_id: Uuid,
) -> Result<(), String> {
    // Check order ownership and status
    let order: Option<(Uuid, Uuid, String, String)> = sqlx::query_as(
        r#"
        SELECT market_id, outcome_id, share_type, status
        FROM orders
        WHERE id = $1 AND user_address = $2
        "#,
    )
    .bind(order_id)
    .bind(user_address)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|e| format!("DB error: {}", e))?;

    let (market_id, outcome_id, share_type, status) = order.ok_or("Order not found")?;

    if status != "open" {
        return Err(format!("Cannot cancel order with status: {}", status));
    }

    // Update order status
    sqlx::query("UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1")
        .bind(order_id)
        .execute(&state.db.pool)
        .await
        .map_err(|e| format!("Failed to cancel order: {}", e))?;

    // Remove from matching engine
    let orderbook_key = format!("{}:{}:{}", market_id, outcome_id, share_type);
    let _ = state
        .matching_engine
        .cancel_order(&orderbook_key, order_id, user_address);

    Ok(())
}

use axum::extract::Query;
