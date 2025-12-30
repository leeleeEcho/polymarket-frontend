//! Order API Handlers for Prediction Markets
//!
//! Handles order creation, cancellation, and querying for prediction market orders.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension, Json,
};
use chrono::Utc;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::eip712::{
    verify_cancel_order_signature, verify_create_order_signature_with_debug,
    CancelOrderMessage, CreateOrderMessage,
};
use crate::auth::middleware::AuthUser;
use crate::models::market::ShareType;
use crate::models::{
    CreateOrderRequest, Order, OrderResponse, OrderSide, OrderStatus, OrderType,
};
use crate::services::matching::{
    OrderType as MatchingOrderType, Side as MatchingSide,
};
use crate::AppState;

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CancelOrderRequest {
    pub signature: String,
    pub timestamp: u64,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct BatchCancelRequest {
    pub order_ids: Vec<Uuid>,
    pub signature: String,
    pub timestamp: u64,
}

#[derive(Debug, Serialize)]
pub struct BatchCancelResponse {
    pub cancelled: Vec<Uuid>,
    pub failed: Vec<Uuid>,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: String,
}

#[derive(Debug, Serialize)]
pub struct CreateOrderResponse {
    pub order_id: Uuid,
    pub market_id: Uuid,
    pub outcome_id: Uuid,
    pub share_type: ShareType,
    pub status: OrderStatus,
    pub filled_amount: Decimal,
    pub remaining_amount: Decimal,
    pub average_price: Decimal,
    #[serde(serialize_with = "serialize_datetime_as_millis")]
    pub created_at: chrono::DateTime<chrono::Utc>,
}

fn serialize_datetime_as_millis<S>(
    dt: &chrono::DateTime<chrono::Utc>,
    serializer: S,
) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    serializer.serialize_i64(dt.timestamp_millis())
}

// ============================================================================
// Validation Helpers
// ============================================================================

/// Validate timestamp (within 5 minutes)
fn validate_timestamp(timestamp: u64) -> bool {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    now.abs_diff(timestamp) <= 300
}

/// Validate price is within prediction market range (0.01 - 0.99)
fn validate_price(price: Decimal) -> bool {
    let min = Decimal::new(1, 2); // 0.01
    let max = Decimal::new(99, 2); // 0.99
    price >= min && price <= max
}

// ============================================================================
// Order Handlers
// ============================================================================

/// Create a new order
/// POST /orders
pub async fn create_order(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<CreateOrderRequest>,
) -> Result<Json<CreateOrderResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Validate price range
    if !validate_price(req.price) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "价格必须在 0.01 到 0.99 之间".to_string(),
                code: "INVALID_PRICE".to_string(),
            }),
        ));
    }

    // Validate amount
    if req.amount <= Decimal::ZERO {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "订单数量必须大于 0".to_string(),
                code: "INVALID_AMOUNT".to_string(),
            }),
        ));
    }

    // Validate timestamp
    if !state.config.is_auth_disabled() && !validate_timestamp(req.timestamp) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "时间戳已过期".to_string(),
                code: "TIMESTAMP_EXPIRED".to_string(),
            }),
        ));
    }

    // Create EIP-712 message for signature verification
    let order_msg = CreateOrderMessage {
        wallet: auth_user.address.to_lowercase(),
        market_id: req.market_id.to_string(),
        outcome_id: req.outcome_id.to_string(),
        share_type: req.share_type.to_string(),
        side: req.side.to_string(),
        order_type: req.order_type.to_string(),
        price: req.price.to_string(),
        amount: req.amount.to_string(),
        timestamp: req.timestamp,
    };

    // Verify EIP-712 signature
    if !state.config.is_auth_disabled() {
        let verify_result = verify_create_order_signature_with_debug(&order_msg, &req.signature, &auth_user.address)
            .map_err(|e| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: format!("签名验证失败: {}", e),
                        code: "SIGNATURE_INVALID".to_string(),
                    }),
                )
            })?;

        if !verify_result.is_valid {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "签名验证失败".to_string(),
                    code: "SIGNATURE_INVALID".to_string(),
                }),
            ));
        }
    }

    // Check balance for buy orders
    if matches!(req.side, OrderSide::Buy) {
        let required_collateral = req.amount * req.price;
        let collateral_symbol = state.config.collateral_symbol();

        let balance: Option<Decimal> = sqlx::query_scalar(
            "SELECT available FROM balances WHERE user_address = $1 AND token = $2"
        )
        .bind(&auth_user.address.to_lowercase())
        .bind(&collateral_symbol)
        .fetch_optional(&state.db.pool)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("查询余额失败: {}", e),
                    code: "DB_ERROR".to_string(),
                }),
            )
        })?;

        let available_balance = balance.unwrap_or(Decimal::ZERO);
        if available_balance < required_collateral {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: format!(
                        "余额不足，需要 {} {}，当前可用 {}",
                        required_collateral, collateral_symbol, available_balance
                    ),
                    code: "INSUFFICIENT_BALANCE".to_string(),
                }),
            ));
        }

        // Freeze collateral
        sqlx::query(
            "UPDATE balances SET available = available - $1, frozen = frozen + $1, updated_at = NOW()
             WHERE user_address = $2 AND token = $3"
        )
        .bind(required_collateral)
        .bind(&auth_user.address.to_lowercase())
        .bind(&collateral_symbol)
        .execute(&state.db.pool)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("冻结资金失败: {}", e),
                    code: "DB_ERROR".to_string(),
                }),
            )
        })?;
    }

    // Convert to matching engine types
    let matching_side = match req.side {
        OrderSide::Buy => MatchingSide::Buy,
        OrderSide::Sell => MatchingSide::Sell,
    };

    let matching_order_type = match req.order_type {
        OrderType::Limit => MatchingOrderType::Limit,
        OrderType::Market => MatchingOrderType::Market,
    };

    // Generate order ID
    let order_id = Uuid::new_v4();

    // Build market key for orderbook: market_id:outcome_id:share_type
    let market_key = format!("{}:{}:{}", req.market_id, req.outcome_id, req.share_type);

    // Submit to matching engine
    // For prediction markets, we use market_key as the "symbol" and leverage=1
    let match_result = state
        .matching_engine
        .submit_order(
            order_id,
            &market_key,
            &auth_user.address.to_lowercase(),
            matching_side,
            matching_order_type,
            req.amount,
            Some(req.price),
            1, // No leverage in prediction markets
        )
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("订单提交失败: {}", e),
                    code: "MATCHING_ERROR".to_string(),
                }),
            )
        })?;

    // Convert status
    let status = match match_result.status {
        crate::services::matching::OrderStatus::Open => OrderStatus::Open,
        crate::services::matching::OrderStatus::PartiallyFilled => OrderStatus::PartiallyFilled,
        crate::services::matching::OrderStatus::Filled => OrderStatus::Filled,
        crate::services::matching::OrderStatus::Cancelled => OrderStatus::Cancelled,
        crate::services::matching::OrderStatus::Rejected => OrderStatus::Rejected,
    };

    // Calculate average price
    let average_price = if match_result.filled_amount > Decimal::ZERO {
        match_result
            .trades
            .iter()
            .map(|t| t.price * t.amount)
            .sum::<Decimal>()
            / match_result.filled_amount
    } else {
        Decimal::ZERO
    };

    let now = Utc::now();

    // Persist order to database
    sqlx::query(
        r#"
        INSERT INTO orders (
            id, user_address, market_id, outcome_id, share_type,
            side, order_type, price, amount, filled_amount, status, signature,
            created_at, updated_at
        )
        VALUES (
            $1, $2, $3, $4, $5::share_type,
            $6::order_side, $7::order_type, $8, $9, $10, $11::order_status, $12,
            $13, $13
        )
        "#,
    )
    .bind(order_id)
    .bind(&auth_user.address.to_lowercase())
    .bind(req.market_id)
    .bind(req.outcome_id)
    .bind(req.share_type.to_string())
    .bind(req.side.to_string())
    .bind(req.order_type.to_string())
    .bind(req.price)
    .bind(req.amount)
    .bind(match_result.filled_amount)
    .bind(status.to_string())
    .bind(&req.signature)
    .bind(now)
    .execute(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to persist order: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("保存订单失败: {}", e),
                code: "DB_ERROR".to_string(),
            }),
        )
    })?;

    Ok(Json(CreateOrderResponse {
        order_id,
        market_id: req.market_id,
        outcome_id: req.outcome_id,
        share_type: req.share_type,
        status,
        filled_amount: match_result.filled_amount,
        remaining_amount: req.amount - match_result.filled_amount,
        average_price,
        created_at: now,
    }))
}

/// Get order by ID
/// GET /orders/:order_id
pub async fn get_order(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(order_id): Path<Uuid>,
) -> Result<Json<OrderResponse>, (StatusCode, Json<ErrorResponse>)> {
    let order: Option<Order> = sqlx::query_as(
        r#"
        SELECT id, user_address, market_id, outcome_id, share_type,
               side, order_type, price, amount, filled_amount, status, signature,
               created_at, updated_at
        FROM orders
        WHERE id = $1 AND user_address = $2
        "#,
    )
    .bind(order_id)
    .bind(&auth_user.address.to_lowercase())
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("查询订单失败: {}", e),
                code: "DB_ERROR".to_string(),
            }),
        )
    })?;

    match order {
        Some(order) => Ok(Json(OrderResponse::from(order))),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "订单不存在".to_string(),
                code: "ORDER_NOT_FOUND".to_string(),
            }),
        )),
    }
}

/// Cancel an order
/// DELETE /orders/:order_id
pub async fn cancel_order(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(order_id): Path<Uuid>,
    Json(req): Json<CancelOrderRequest>,
) -> Result<Json<OrderResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Validate timestamp
    if !state.config.is_auth_disabled() && !validate_timestamp(req.timestamp) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "时间戳已过期".to_string(),
                code: "TIMESTAMP_EXPIRED".to_string(),
            }),
        ));
    }

    // Verify signature
    if !state.config.is_auth_disabled() {
        let cancel_msg = CancelOrderMessage {
            wallet: auth_user.address.to_lowercase(),
            order_id: order_id.to_string(),
            timestamp: req.timestamp,
        };

        let valid = verify_cancel_order_signature(&cancel_msg, &req.signature, &auth_user.address)
            .map_err(|e| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: format!("签名验证失败: {}", e),
                        code: "SIGNATURE_INVALID".to_string(),
                    }),
                )
            })?;

        if !valid {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "签名验证失败".to_string(),
                    code: "SIGNATURE_INVALID".to_string(),
                }),
            ));
        }
    }

    // Get order from database
    let order: Option<Order> = sqlx::query_as(
        r#"
        SELECT id, user_address, market_id, outcome_id, share_type,
               side, order_type, price, amount, filled_amount, status, signature,
               created_at, updated_at
        FROM orders
        WHERE id = $1 AND user_address = $2
        "#,
    )
    .bind(order_id)
    .bind(&auth_user.address.to_lowercase())
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("查询订单失败: {}", e),
                code: "DB_ERROR".to_string(),
            }),
        )
    })?;

    let order = order.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "订单不存在".to_string(),
                code: "ORDER_NOT_FOUND".to_string(),
            }),
        )
    })?;

    // Check if order can be cancelled
    if !order.is_cancellable() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("订单状态 {} 无法取消", order.status),
                code: "ORDER_NOT_CANCELLABLE".to_string(),
            }),
        ));
    }

    // Build market key for orderbook: market_id:outcome_id:share_type
    let market_key = format!("{}:{}:{}", order.market_id, order.outcome_id, order.share_type);

    // Cancel in matching engine
    let cancelled = state
        .matching_engine
        .cancel_order(
            &market_key,
            order_id,
            &auth_user.address.to_lowercase(),
        )
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("取消订单失败: {}", e),
                    code: "MATCHING_ERROR".to_string(),
                }),
            )
        })?;

    if !cancelled {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "订单取消失败".to_string(),
                code: "CANCEL_FAILED".to_string(),
            }),
        ));
    }

    // Update order status in database
    sqlx::query("UPDATE orders SET status = 'cancelled'::order_status, updated_at = NOW() WHERE id = $1")
        .bind(order_id)
        .execute(&state.db.pool)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("更新订单状态失败: {}", e),
                    code: "DB_ERROR".to_string(),
                }),
            )
        })?;

    // Unfreeze collateral for buy orders
    if matches!(order.side, OrderSide::Buy) {
        let remaining_collateral = order.remaining_amount() * order.price;
        let collateral_symbol = state.config.collateral_symbol();

        sqlx::query(
            "UPDATE balances SET available = available + $1, frozen = frozen - $1, updated_at = NOW()
             WHERE user_address = $2 AND token = $3"
        )
        .bind(remaining_collateral)
        .bind(&auth_user.address.to_lowercase())
        .bind(&collateral_symbol)
        .execute(&state.db.pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to unfreeze collateral: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("解冻资金失败: {}", e),
                    code: "DB_ERROR".to_string(),
                }),
            )
        })?;
    }

    // Return updated order
    let updated_order = Order {
        status: OrderStatus::Cancelled,
        updated_at: Utc::now(),
        ..order
    };

    Ok(Json(OrderResponse::from(updated_order)))
}

/// Batch cancel orders
/// POST /orders/batch
pub async fn batch_cancel(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<BatchCancelRequest>,
) -> Result<Json<BatchCancelResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Validate timestamp
    if !state.config.is_auth_disabled() && !validate_timestamp(req.timestamp) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "时间戳已过期".to_string(),
                code: "TIMESTAMP_EXPIRED".to_string(),
            }),
        ));
    }

    let mut cancelled = Vec::new();
    let mut failed = Vec::new();

    for order_id in req.order_ids {
        // Get order
        let order: Option<Order> = sqlx::query_as(
            r#"
            SELECT id, user_address, market_id, outcome_id, share_type,
                   side, order_type, price, amount, filled_amount, status, signature,
                   created_at, updated_at
            FROM orders
            WHERE id = $1 AND user_address = $2
            "#,
        )
        .bind(order_id)
        .bind(&auth_user.address.to_lowercase())
        .fetch_optional(&state.db.pool)
        .await
        .unwrap_or(None);

        if let Some(order) = order {
            if order.is_cancellable() {
                // Build market key for orderbook
                let market_key = format!("{}:{}:{}", order.market_id, order.outcome_id, order.share_type);

                // Try to cancel in matching engine
                let result = state.matching_engine.cancel_order(
                    &market_key,
                    order_id,
                    &auth_user.address.to_lowercase(),
                );

                if result.is_ok() && result.unwrap() {
                    // Update database
                    let _ = sqlx::query(
                        "UPDATE orders SET status = 'cancelled'::order_status, updated_at = NOW() WHERE id = $1"
                    )
                    .bind(order_id)
                    .execute(&state.db.pool)
                    .await;

                    // Unfreeze collateral for buy orders
                    if matches!(order.side, OrderSide::Buy) {
                        let remaining_collateral = order.remaining_amount() * order.price;
                        let collateral_symbol = state.config.collateral_symbol();

                        let _ = sqlx::query(
                            "UPDATE balances SET available = available + $1, frozen = frozen - $1, updated_at = NOW()
                             WHERE user_address = $2 AND token = $3"
                        )
                        .bind(remaining_collateral)
                        .bind(&auth_user.address.to_lowercase())
                        .bind(&collateral_symbol)
                        .execute(&state.db.pool)
                        .await;
                    }

                    cancelled.push(order_id);
                } else {
                    failed.push(order_id);
                }
            } else {
                failed.push(order_id);
            }
        } else {
            failed.push(order_id);
        }
    }

    Ok(Json(BatchCancelResponse { cancelled, failed }))
}
