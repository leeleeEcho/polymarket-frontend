//! Account API Handlers for Prediction Markets
//!
//! Provides endpoints for user profile, balances, shares, orders, and trades.

use axum::{
    extract::{Query, State},
    http::StatusCode,
    Extension, Json,
};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::models::market::ShareType;
use crate::models::{BalanceResponse, UserProfile};
use crate::AppState;

// ============================================================================
// Helper Modules
// ============================================================================

mod datetime_as_millis {
    use chrono::{DateTime, Utc};
    use serde::Serializer;

    pub fn serialize<S>(dt: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_i64(dt.timestamp_millis())
    }
}

// ============================================================================
// Response Types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: String,
}

#[derive(Debug, Serialize)]
pub struct BalancesResponse {
    pub balances: Vec<BalanceResponse>,
}

/// User's share holdings in prediction markets
#[derive(Debug, Serialize)]
pub struct ShareDetail {
    pub id: Uuid,
    pub market_id: Uuid,
    pub outcome_id: Uuid,
    pub share_type: ShareType,
    pub amount: Decimal,
    pub avg_cost: Decimal,
    #[serde(serialize_with = "datetime_as_millis::serialize")]
    pub created_at: DateTime<Utc>,
    #[serde(serialize_with = "datetime_as_millis::serialize")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct SharesResponse {
    pub shares: Vec<ShareDetail>,
    pub total_value: Decimal,
}

/// Order detail for prediction markets
#[derive(Debug, Serialize)]
pub struct OrderDetail {
    pub id: Uuid,
    pub market_id: Uuid,
    pub outcome_id: Uuid,
    pub share_type: ShareType,
    pub side: String,
    pub order_type: String,
    pub price: Decimal,
    pub amount: Decimal,
    pub filled_amount: Decimal,
    pub status: String,
    #[serde(serialize_with = "datetime_as_millis::serialize")]
    pub created_at: DateTime<Utc>,
    #[serde(serialize_with = "datetime_as_millis::serialize")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct OrdersResponse {
    pub orders: Vec<OrderDetail>,
    pub total: i64,
}

/// Trade record for prediction markets
#[derive(Debug, Serialize)]
pub struct TradeRecord {
    pub id: Uuid,
    pub market_id: Uuid,
    pub outcome_id: Uuid,
    pub share_type: ShareType,
    pub side: String,
    pub price: Decimal,
    pub amount: Decimal,
    pub fee: Decimal,
    #[serde(serialize_with = "datetime_as_millis::serialize")]
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct TradesResponse {
    pub trades: Vec<TradeRecord>,
    pub total: i64,
}

// ============================================================================
// Query Parameters
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct OrdersQuery {
    pub market_id: Option<Uuid>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct TradesQuery {
    pub market_id: Option<Uuid>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

// ============================================================================
// Handlers
// ============================================================================

/// Get user profile
/// GET /account/profile
pub async fn get_profile(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<Json<UserProfile>, (StatusCode, Json<ErrorResponse>)> {
    let user: Option<UserProfile> = sqlx::query_as(
        r#"
        SELECT address, username, avatar_url, created_at, updated_at
        FROM users
        WHERE address = $1
        "#,
    )
    .bind(&auth_user.address.to_lowercase())
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch user profile: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "获取用户资料失败".to_string(),
                code: "PROFILE_FETCH_FAILED".to_string(),
            }),
        )
    })?;

    match user {
        Some(profile) => Ok(Json(profile)),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "用户不存在".to_string(),
                code: "USER_NOT_FOUND".to_string(),
            }),
        )),
    }
}

/// Get user balances
/// GET /account/balances
pub async fn get_balances(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<Json<BalancesResponse>, (StatusCode, Json<ErrorResponse>)> {
    let rows: Vec<(String, Decimal, Decimal)> = sqlx::query_as(
        r#"
        SELECT token, available, frozen
        FROM balances
        WHERE user_address = $1
        ORDER BY token
        "#,
    )
    .bind(&auth_user.address.to_lowercase())
    .fetch_all(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch balances: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "获取余额失败".to_string(),
                code: "BALANCE_FETCH_FAILED".to_string(),
            }),
        )
    })?;

    let balances: Vec<BalanceResponse> = rows
        .into_iter()
        .map(|(token, available, frozen)| BalanceResponse {
            token,
            available,
            frozen,
            total: available + frozen,
        })
        .collect();

    Ok(Json(BalancesResponse { balances }))
}

/// Get user orders
/// GET /account/orders
pub async fn get_orders(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Query(query): Query<OrdersQuery>,
) -> Result<Json<OrdersResponse>, (StatusCode, Json<ErrorResponse>)> {
    let limit = query.limit.unwrap_or(50).min(100);
    let offset = query.offset.unwrap_or(0);

    // Build query with optional filters
    let mut sql = String::from(
        r#"
        SELECT id, market_id, outcome_id, share_type::text, side::text, order_type::text,
               price, amount, filled_amount, status::text, created_at, updated_at
        FROM orders
        WHERE user_address = $1
        "#,
    );

    if query.market_id.is_some() {
        sql.push_str(" AND market_id = $4");
    }
    if query.status.is_some() {
        sql.push_str(" AND status::text = $5");
    }

    sql.push_str(" ORDER BY created_at DESC LIMIT $2 OFFSET $3");

    // Execute query
    let rows: Vec<(
        Uuid,
        Uuid,
        Uuid,
        String,
        String,
        String,
        Decimal,
        Decimal,
        Decimal,
        String,
        DateTime<Utc>,
        DateTime<Utc>,
    )> = if query.market_id.is_some() && query.status.is_some() {
        sqlx::query_as(&sql)
            .bind(&auth_user.address.to_lowercase())
            .bind(limit)
            .bind(offset)
            .bind(query.market_id.unwrap())
            .bind(query.status.as_ref().unwrap())
            .fetch_all(&state.db.pool)
            .await
    } else if query.market_id.is_some() {
        sqlx::query_as(&sql)
            .bind(&auth_user.address.to_lowercase())
            .bind(limit)
            .bind(offset)
            .bind(query.market_id.unwrap())
            .fetch_all(&state.db.pool)
            .await
    } else if query.status.is_some() {
        // Need to adjust SQL for this case
        let sql = r#"
            SELECT id, market_id, outcome_id, share_type::text, side::text, order_type::text,
                   price, amount, filled_amount, status::text, created_at, updated_at
            FROM orders
            WHERE user_address = $1 AND status::text = $4
            ORDER BY created_at DESC LIMIT $2 OFFSET $3
        "#;
        sqlx::query_as(sql)
            .bind(&auth_user.address.to_lowercase())
            .bind(limit)
            .bind(offset)
            .bind(query.status.as_ref().unwrap())
            .fetch_all(&state.db.pool)
            .await
    } else {
        let sql = r#"
            SELECT id, market_id, outcome_id, share_type::text, side::text, order_type::text,
                   price, amount, filled_amount, status::text, created_at, updated_at
            FROM orders
            WHERE user_address = $1
            ORDER BY created_at DESC LIMIT $2 OFFSET $3
        "#;
        sqlx::query_as(sql)
            .bind(&auth_user.address.to_lowercase())
            .bind(limit)
            .bind(offset)
            .fetch_all(&state.db.pool)
            .await
    }
    .map_err(|e| {
        tracing::error!("Failed to fetch orders: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "获取订单失败".to_string(),
                code: "ORDER_FETCH_FAILED".to_string(),
            }),
        )
    })?;

    let orders: Vec<OrderDetail> = rows
        .into_iter()
        .map(
            |(
                id,
                market_id,
                outcome_id,
                share_type,
                side,
                order_type,
                price,
                amount,
                filled_amount,
                status,
                created_at,
                updated_at,
            )| {
                OrderDetail {
                    id,
                    market_id,
                    outcome_id,
                    share_type: share_type.parse().unwrap_or(ShareType::Yes),
                    side,
                    order_type,
                    price,
                    amount,
                    filled_amount,
                    status,
                    created_at,
                    updated_at,
                }
            },
        )
        .collect();

    let total = orders.len() as i64;

    Ok(Json(OrdersResponse { orders, total }))
}

/// Get user trades
/// GET /account/trades
pub async fn get_trades(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Query(query): Query<TradesQuery>,
) -> Result<Json<TradesResponse>, (StatusCode, Json<ErrorResponse>)> {
    let limit = query.limit.unwrap_or(50).min(100);
    let offset = query.offset.unwrap_or(0);
    let user_address = auth_user.address.to_lowercase();

    let rows: Vec<(
        Uuid,
        Uuid,
        Uuid,
        String,
        String,
        Decimal,
        Decimal,
        Decimal,
        DateTime<Utc>,
    )> = if let Some(market_id) = query.market_id {
        sqlx::query_as(
            r#"
            SELECT id, market_id, outcome_id, share_type::text, side::text,
                   price, amount,
                   CASE WHEN maker_address = $1 THEN maker_fee ELSE taker_fee END as fee,
                   created_at
            FROM trades
            WHERE (maker_address = $1 OR taker_address = $1) AND market_id = $4
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(&user_address)
        .bind(limit)
        .bind(offset)
        .bind(market_id)
        .fetch_all(&state.db.pool)
        .await
    } else {
        sqlx::query_as(
            r#"
            SELECT id, market_id, outcome_id, share_type::text, side::text,
                   price, amount,
                   CASE WHEN maker_address = $1 THEN maker_fee ELSE taker_fee END as fee,
                   created_at
            FROM trades
            WHERE maker_address = $1 OR taker_address = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(&user_address)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db.pool)
        .await
    }
    .map_err(|e| {
        tracing::error!("Failed to fetch trades: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "获取交易记录失败".to_string(),
                code: "TRADE_FETCH_FAILED".to_string(),
            }),
        )
    })?;

    let trades: Vec<TradeRecord> = rows
        .into_iter()
        .map(
            |(id, market_id, outcome_id, share_type, side, price, amount, fee, timestamp)| {
                TradeRecord {
                    id,
                    market_id,
                    outcome_id,
                    share_type: share_type.parse().unwrap_or(ShareType::Yes),
                    side,
                    price,
                    amount,
                    fee,
                    timestamp,
                }
            },
        )
        .collect();

    let total = trades.len() as i64;

    Ok(Json(TradesResponse { trades, total }))
}
