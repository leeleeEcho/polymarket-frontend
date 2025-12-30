//! Market API Handlers for Prediction Markets
//!
//! Provides endpoints for listing markets, getting orderbooks, trades, and prices.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::models::market::ShareType;
use crate::AppState;

// ============================================================================
// Response Types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: String,
}

/// Outcome information for a prediction market
#[derive(Debug, Serialize)]
pub struct OutcomeInfo {
    pub id: Uuid,
    pub name: String,
    pub probability: Decimal,
}

/// Prediction market information
#[derive(Debug, Serialize)]
pub struct MarketInfo {
    pub id: Uuid,
    pub question: String,
    pub description: Option<String>,
    pub category: String,
    pub outcomes: Vec<OutcomeInfo>,
    pub status: String,
    pub resolution_source: Option<String>,
    pub end_time: Option<i64>,
    pub volume_24h: Decimal,
    pub total_volume: Decimal,
    pub liquidity: Decimal,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
pub struct MarketsResponse {
    pub markets: Vec<MarketInfo>,
    pub total: i64,
}

#[derive(Debug, Deserialize)]
pub struct MarketsQuery {
    pub category: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Orderbook level
#[derive(Debug, Serialize)]
pub struct OrderbookLevel {
    pub price: String,
    pub amount: String,
}

/// Orderbook response for a market outcome
#[derive(Debug, Serialize)]
pub struct OrderbookResponse {
    pub market_id: Uuid,
    pub outcome_id: Uuid,
    pub share_type: ShareType,
    pub bids: Vec<OrderbookLevel>,
    pub asks: Vec<OrderbookLevel>,
    pub timestamp: i64,
}

/// Trade record
#[derive(Debug, Serialize)]
pub struct TradeInfo {
    pub id: Uuid,
    pub price: Decimal,
    pub amount: Decimal,
    pub side: String,
    pub share_type: ShareType,
    pub timestamp: i64,
}

#[derive(Debug, Serialize)]
pub struct TradesResponse {
    pub market_id: Uuid,
    pub outcome_id: Uuid,
    pub trades: Vec<TradeInfo>,
}

/// Price/ticker information for a market
#[derive(Debug, Serialize)]
pub struct TickerResponse {
    pub market_id: Uuid,
    pub outcomes: Vec<OutcomeTicker>,
    pub volume_24h: Decimal,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
pub struct OutcomeTicker {
    pub outcome_id: Uuid,
    pub name: String,
    pub yes_price: Decimal,
    pub no_price: Decimal,
    pub probability: Decimal,
}

#[derive(Debug, Deserialize)]
pub struct OrderbookQuery {
    pub outcome_id: Uuid,
    pub share_type: Option<String>,
    pub depth: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct TradesQuery {
    pub outcome_id: Uuid,
    pub limit: Option<i64>,
}

// ============================================================================
// Handlers
// ============================================================================

/// List all available prediction markets
/// GET /markets
pub async fn list_markets(
    State(state): State<Arc<AppState>>,
    Query(query): Query<MarketsQuery>,
) -> Result<Json<MarketsResponse>, (StatusCode, Json<ErrorResponse>)> {
    let limit = query.limit.unwrap_or(50).min(100);
    let offset = query.offset.unwrap_or(0);

    // Query markets from database
    let markets_data: Vec<(
        Uuid,
        String,
        Option<String>,
        String,
        String,
        Option<String>,
        Option<DateTime<Utc>>,
        Decimal,
        Decimal,
        DateTime<Utc>,
    )> = sqlx::query_as(
        r#"
        SELECT m.id, m.question, m.description, m.category, m.status::text,
               m.resolution_source, m.end_time, m.volume_24h, m.total_volume, m.created_at
        FROM markets m
        WHERE ($1::text IS NULL OR m.category = $1)
        AND ($2::text IS NULL OR m.status::text = $2)
        ORDER BY m.volume_24h DESC
        LIMIT $3 OFFSET $4
        "#,
    )
    .bind(query.category.as_ref())
    .bind(query.status.as_ref())
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch markets: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to fetch markets".to_string(),
                code: "MARKET_FETCH_FAILED".to_string(),
            }),
        )
    })?;

    // Get total count
    let total: (i64,) = sqlx::query_as(
        r#"
        SELECT COUNT(*) FROM markets
        WHERE ($1::text IS NULL OR category = $1)
        AND ($2::text IS NULL OR status::text = $2)
        "#,
    )
    .bind(query.category.as_ref())
    .bind(query.status.as_ref())
    .fetch_one(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to count markets: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to count markets".to_string(),
                code: "MARKET_COUNT_FAILED".to_string(),
            }),
        )
    })?;

    let mut markets = Vec::new();

    for (id, question, description, category, status, resolution_source, end_time, volume_24h, total_volume, created_at) in markets_data {
        // Get outcomes for each market
        let outcomes_data: Vec<(Uuid, String, Decimal)> = sqlx::query_as(
            r#"
            SELECT id, name, probability
            FROM outcomes
            WHERE market_id = $1
            ORDER BY name
            "#,
        )
        .bind(id)
        .fetch_all(&state.db.pool)
        .await
        .unwrap_or_default();

        let outcomes: Vec<OutcomeInfo> = outcomes_data
            .into_iter()
            .map(|(oid, name, probability)| OutcomeInfo {
                id: oid,
                name,
                probability,
            })
            .collect();

        // Calculate liquidity (sum of orderbook depth)
        let liquidity = Decimal::ZERO; // TODO: Calculate from orderbook

        markets.push(MarketInfo {
            id,
            question,
            description,
            category,
            outcomes,
            status,
            resolution_source,
            end_time: end_time.map(|t| t.timestamp_millis()),
            volume_24h,
            total_volume,
            liquidity,
            created_at: created_at.timestamp_millis(),
        });
    }

    Ok(Json(MarketsResponse {
        markets,
        total: total.0,
    }))
}

/// Get orderbook for a market outcome
/// GET /markets/:market_id/orderbook
pub async fn get_orderbook(
    State(state): State<Arc<AppState>>,
    Path(market_id): Path<Uuid>,
    Query(query): Query<OrderbookQuery>,
) -> Result<Json<OrderbookResponse>, (StatusCode, Json<ErrorResponse>)> {
    let depth = query.depth.unwrap_or(20).min(100);
    let share_type: ShareType = query
        .share_type
        .as_ref()
        .and_then(|s| s.parse().ok())
        .unwrap_or(ShareType::Yes);

    // Validate market exists
    let market_exists: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM markets WHERE id = $1")
        .bind(market_id)
        .fetch_optional(&state.db.pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to check market: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to check market".to_string(),
                    code: "MARKET_CHECK_FAILED".to_string(),
                }),
            )
        })?;

    if market_exists.is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Market not found".to_string(),
                code: "MARKET_NOT_FOUND".to_string(),
            }),
        ));
    }

    // Build orderbook key for matching engine
    let orderbook_key = format!("{}:{}:{}", market_id, query.outcome_id, share_type);

    // Try to get orderbook from matching engine
    match state.matching_engine.get_orderbook(&orderbook_key, depth) {
        Ok(snapshot) => {
            let bids: Vec<OrderbookLevel> = snapshot
                .bids
                .into_iter()
                .map(|[price, amount]| OrderbookLevel { price, amount })
                .collect();
            let asks: Vec<OrderbookLevel> = snapshot
                .asks
                .into_iter()
                .map(|[price, amount]| OrderbookLevel { price, amount })
                .collect();

            Ok(Json(OrderbookResponse {
                market_id,
                outcome_id: query.outcome_id,
                share_type,
                bids,
                asks,
                timestamp: snapshot.timestamp,
            }))
        }
        Err(_) => {
            // Return empty orderbook
            Ok(Json(OrderbookResponse {
                market_id,
                outcome_id: query.outcome_id,
                share_type,
                bids: vec![],
                asks: vec![],
                timestamp: chrono::Utc::now().timestamp_millis(),
            }))
        }
    }
}

/// Get recent trades for a market outcome
/// GET /markets/:market_id/trades
pub async fn get_trades(
    State(state): State<Arc<AppState>>,
    Path(market_id): Path<Uuid>,
    Query(query): Query<TradesQuery>,
) -> Result<Json<TradesResponse>, (StatusCode, Json<ErrorResponse>)> {
    let limit = query.limit.unwrap_or(50).min(100);

    let rows: Vec<(Uuid, Decimal, Decimal, String, String, DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT id, price, amount, side::text, share_type::text, created_at
        FROM trades
        WHERE market_id = $1 AND outcome_id = $2
        ORDER BY created_at DESC
        LIMIT $3
        "#,
    )
    .bind(market_id)
    .bind(query.outcome_id)
    .bind(limit)
    .fetch_all(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch trades: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to fetch trades".to_string(),
                code: "TRADES_FETCH_FAILED".to_string(),
            }),
        )
    })?;

    let trades: Vec<TradeInfo> = rows
        .into_iter()
        .map(|(id, price, amount, side, share_type, created_at)| TradeInfo {
            id,
            price,
            amount,
            side,
            share_type: share_type.parse().unwrap_or(ShareType::Yes),
            timestamp: created_at.timestamp_millis(),
        })
        .collect();

    Ok(Json(TradesResponse {
        market_id,
        outcome_id: query.outcome_id,
        trades,
    }))
}

/// Get ticker/price info for a market
/// GET /markets/:market_id/ticker
pub async fn get_ticker(
    State(state): State<Arc<AppState>>,
    Path(market_id): Path<Uuid>,
) -> Result<Json<TickerResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Get market info
    let market_data: Option<(Uuid, Decimal)> = sqlx::query_as(
        "SELECT id, volume_24h FROM markets WHERE id = $1",
    )
    .bind(market_id)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch market: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to fetch market".to_string(),
                code: "MARKET_FETCH_FAILED".to_string(),
            }),
        )
    })?;

    let (_, volume_24h) = market_data.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Market not found".to_string(),
                code: "MARKET_NOT_FOUND".to_string(),
            }),
        )
    })?;

    // Get outcomes with probabilities
    let outcomes_data: Vec<(Uuid, String, Decimal)> = sqlx::query_as(
        r#"
        SELECT id, name, probability
        FROM outcomes
        WHERE market_id = $1
        ORDER BY name
        "#,
    )
    .bind(market_id)
    .fetch_all(&state.db.pool)
    .await
    .unwrap_or_default();

    let outcomes: Vec<OutcomeTicker> = outcomes_data
        .into_iter()
        .map(|(outcome_id, name, probability)| {
            // In prediction markets, Yes price = probability, No price = 1 - probability
            let yes_price = probability;
            let no_price = Decimal::ONE - probability;
            OutcomeTicker {
                outcome_id,
                name,
                yes_price,
                no_price,
                probability,
            }
        })
        .collect();

    Ok(Json(TickerResponse {
        market_id,
        outcomes,
        volume_24h,
        updated_at: chrono::Utc::now().timestamp_millis(),
    }))
}

/// Get price for a specific outcome
/// GET /markets/:market_id/price
pub async fn get_price(
    State(state): State<Arc<AppState>>,
    Path(market_id): Path<Uuid>,
) -> Result<Json<TickerResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Same as ticker for now
    get_ticker(State(state), Path(market_id)).await
}
