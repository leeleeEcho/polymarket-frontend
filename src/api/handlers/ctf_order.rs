//! CTF Order Handler
//!
//! Handles Polymarket-style orders with EIP-712 signatures for on-chain settlement.

use axum::{
    extract::State,
    http::StatusCode,
    Extension, Json,
};
use chrono::Utc;
use ethers::types::{Address, Bytes, U256};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::models::market::ShareType;
use crate::models::{OrderSide, OrderStatus, OrderType};
use crate::services::matching::{
    OrderType as MatchingOrderType, Side as MatchingSide,
};
use crate::services::settlement::{MatchType, MatchedOrders, SignedOrder};
use crate::AppState;

use super::order::ErrorResponse;

// ============================================================================
// Request/Response Types
// ============================================================================

/// CTF Order request (Polymarket format)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCtfOrderRequest {
    // Market identifiers
    pub market_id: Uuid,
    pub outcome_id: Uuid,
    pub share_type: ShareType,

    // Order parameters
    pub side: OrderSide,
    pub price: Decimal,
    pub amount: Decimal,

    // CTF-specific fields
    pub token_id: String,           // CTF position token ID
    pub maker_amount: String,       // Amount maker is giving
    pub taker_amount: String,       // Amount maker wants
    pub expiration: u64,            // Order expiration timestamp
    pub nonce: u64,                 // Unique nonce
    pub fee_rate_bps: Option<u32>,  // Fee rate in basis points (default: 200 = 2%)
    pub sig_type: Option<u8>,       // Signature type (0=EOA, 1=PolyProxy, 2=PolyGnosisSafe)

    // EIP-712 signature
    pub signature: String,
}

/// CTF Order response
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCtfOrderResponse {
    pub order_id: Uuid,
    pub market_id: Uuid,
    pub outcome_id: Uuid,
    pub share_type: ShareType,
    pub status: OrderStatus,
    pub filled_amount: Decimal,
    pub remaining_amount: Decimal,
    pub settlement_status: String,
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
// CTF Order Handlers
// ============================================================================

/// Create a CTF order with EIP-712 signature for on-chain settlement
/// POST /orders/ctf
pub async fn create_ctf_order(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<CreateCtfOrderRequest>,
) -> Result<Json<CreateCtfOrderResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Validate price range (0.01 - 0.99)
    let min_price = Decimal::new(1, 2);
    let max_price = Decimal::new(99, 2);
    if req.price < min_price || req.price > max_price {
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

    // Validate expiration (must be in the future)
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    if req.expiration <= now {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "订单已过期".to_string(),
                code: "ORDER_EXPIRED".to_string(),
            }),
        ));
    }

    // Parse on-chain values
    let token_id = U256::from_dec_str(&req.token_id).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "无效的 tokenId".to_string(),
                code: "INVALID_TOKEN_ID".to_string(),
            }),
        )
    })?;

    let maker_amount = U256::from_dec_str(&req.maker_amount).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "无效的 makerAmount".to_string(),
                code: "INVALID_MAKER_AMOUNT".to_string(),
            }),
        )
    })?;

    let taker_amount = U256::from_dec_str(&req.taker_amount).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "无效的 takerAmount".to_string(),
                code: "INVALID_TAKER_AMOUNT".to_string(),
            }),
        )
    })?;

    let maker_address = Address::from_str(&auth_user.address).map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "无效的钱包地址".to_string(),
                code: "INVALID_ADDRESS".to_string(),
            }),
        )
    })?;

    let signature_bytes = Bytes::from(
        hex::decode(req.signature.trim_start_matches("0x")).map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "无效的签名格式".to_string(),
                    code: "INVALID_SIGNATURE".to_string(),
                }),
            )
        })?,
    );

    // Generate order ID
    let order_id = Uuid::new_v4();

    // Build market key for orderbook
    let market_key = format!("{}:{}:{}", req.market_id, req.outcome_id, req.share_type);

    // Convert to matching engine types
    let matching_side = match req.side {
        OrderSide::Buy => MatchingSide::Buy,
        OrderSide::Sell => MatchingSide::Sell,
    };

    // Submit to matching engine
    let match_result = state
        .matching_engine
        .submit_order(
            order_id,
            &market_key,
            &auth_user.address.to_lowercase(),
            matching_side,
            MatchingOrderType::Limit,
            req.amount,
            Some(req.price),
            1, // No leverage
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

    let now_dt = Utc::now();

    // Persist order to database with CTF fields
    sqlx::query(
        r#"
        INSERT INTO orders (
            id, user_address, symbol, market_id, outcome_id, share_type,
            side, order_type, price, amount, filled_amount, status, signature,
            token_id, maker_amount, taker_amount, expiration, fee_rate_bps, sig_type,
            created_at, updated_at
        )
        VALUES (
            $1, $2, $3, $4, $5, $6::share_type,
            $7::order_side, $8::order_type, $9, $10, $11, $12::order_status, $13,
            $14, $15, $16, $17, $18, $19,
            $20, $20
        )
        "#,
    )
    .bind(order_id)
    .bind(&auth_user.address.to_lowercase())
    .bind(&market_key)
    .bind(req.market_id)
    .bind(req.outcome_id)
    .bind(req.share_type.to_string())
    .bind(req.side.to_string())
    .bind(OrderType::Limit.to_string())
    .bind(req.price)
    .bind(req.amount)
    .bind(match_result.filled_amount)
    .bind(status.to_string())
    .bind(&req.signature)
    .bind(&req.token_id)
    .bind(&req.maker_amount)
    .bind(&req.taker_amount)
    .bind(req.expiration as i64)
    .bind(req.fee_rate_bps.unwrap_or(200) as i32)
    .bind(req.sig_type.unwrap_or(0) as i16)
    .bind(now_dt)
    .execute(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to persist CTF order: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("保存订单失败: {}", e),
                code: "DB_ERROR".to_string(),
            }),
        )
    })?;

    // Handle trades and submit for on-chain settlement
    let mut settlement_status = "pending".to_string();

    for trade_exec in &match_result.trades {
        // Get maker order from database
        let maker_order_row: Option<(String, String, String, String, i64, i32, i16, String)> = sqlx::query_as(
            r#"
            SELECT token_id, maker_amount, taker_amount, signature, expiration, fee_rate_bps, sig_type, user_address
            FROM orders WHERE id = $1
            "#,
        )
        .bind(trade_exec.maker_order_id)
        .fetch_optional(&state.db.pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get maker order: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("获取订单失败: {}", e),
                    code: "DB_ERROR".to_string(),
                }),
            )
        })?;

        if let Some((m_token_id, m_maker_amount, m_taker_amount, m_signature, m_expiration, m_fee_rate, m_sig_type, m_user_address)) = maker_order_row {
            // Persist trade
            let trade_id = trade_exec.trade_id;
            sqlx::query(
                r#"
                INSERT INTO trades (
                    id, market_id, outcome_id, share_type, maker_order_id, taker_order_id,
                    maker_address, taker_address, price, amount, side,
                    settlement_status, created_at
                )
                VALUES ($1, $2, $3, $4::share_type, $5, $6, $7, $8, $9, $10, $11::order_side, 'pending', NOW())
                "#,
            )
            .bind(trade_id)
            .bind(req.market_id)
            .bind(req.outcome_id)
            .bind(req.share_type.to_string())
            .bind(trade_exec.maker_order_id)
            .bind(order_id)
            .bind(&m_user_address)
            .bind(&auth_user.address.to_lowercase())
            .bind(trade_exec.price)
            .bind(trade_exec.amount)
            .bind(req.side.to_string())
            .execute(&state.db.pool)
            .await
            .ok();

            // Submit to settlement service if available
            if let Some(ref settlement_sender) = state.settlement_sender {
                let maker_signed = SignedOrder {
                    order_id: trade_exec.maker_order_id,
                    market_id: req.market_id,
                    outcome_id: req.outcome_id,
                    maker: Address::from_str(&m_user_address).unwrap_or_default(),
                    taker: Address::zero(),
                    token_id: U256::from_dec_str(&m_token_id).unwrap_or_default(),
                    maker_amount: U256::from_dec_str(&m_maker_amount).unwrap_or_default(),
                    taker_amount: U256::from_dec_str(&m_taker_amount).unwrap_or_default(),
                    expiration: U256::from(m_expiration as u64),
                    nonce: U256::from(trade_exec.maker_order_id.as_u128()),
                    fee_rate_bps: U256::from(m_fee_rate as u64),
                    side: crate::blockchain::types::OrderSide::Buy,
                    sig_type: crate::blockchain::types::SignatureType::from(m_sig_type as u8),
                    signature: Bytes::from(hex::decode(m_signature.trim_start_matches("0x")).unwrap_or_default()),
                };

                let taker_signed = SignedOrder {
                    order_id,
                    market_id: req.market_id,
                    outcome_id: req.outcome_id,
                    maker: maker_address,
                    taker: Address::zero(),
                    token_id,
                    maker_amount,
                    taker_amount,
                    expiration: U256::from(req.expiration),
                    nonce: U256::from(req.nonce),
                    fee_rate_bps: U256::from(req.fee_rate_bps.unwrap_or(200) as u64),
                    side: match req.side {
                        OrderSide::Buy => crate::blockchain::types::OrderSide::Buy,
                        OrderSide::Sell => crate::blockchain::types::OrderSide::Sell,
                    },
                    sig_type: crate::blockchain::types::SignatureType::from(req.sig_type.unwrap_or(0)),
                    signature: signature_bytes.clone(),
                };

                // Determine match type based on sides
                let match_type = MatchType::Normal; // Simplified for now

                let matched = MatchedOrders {
                    trade_id,
                    maker_order: maker_signed,
                    taker_order: taker_signed,
                    maker_fill_amount: U256::from((trade_exec.amount * Decimal::new(1_000_000, 0)).to_string().parse::<u128>().unwrap_or(0)),
                    taker_fill_amount: U256::from((trade_exec.amount * Decimal::new(1_000_000, 0)).to_string().parse::<u128>().unwrap_or(0)),
                    match_type,
                };

                if settlement_sender.send(matched).await.is_ok() {
                    settlement_status = "submitted".to_string();
                    tracing::info!("Trade {} submitted for on-chain settlement", trade_id);
                }
            }
        }

        // Update maker order's filled_amount in database
        let _ = sqlx::query(
            r#"
            UPDATE orders
            SET filled_amount = filled_amount + $1,
                status = CASE
                    WHEN filled_amount + $1 >= amount THEN 'filled'::order_status
                    ELSE 'partially_filled'::order_status
                END,
                updated_at = NOW()
            WHERE id = $2
            "#,
        )
        .bind(trade_exec.amount)
        .bind(trade_exec.maker_order_id)
        .execute(&state.db.pool)
        .await;
    }

    Ok(Json(CreateCtfOrderResponse {
        order_id,
        market_id: req.market_id,
        outcome_id: req.outcome_id,
        share_type: req.share_type,
        status,
        filled_amount: match_result.filled_amount,
        remaining_amount: req.amount - match_result.filled_amount,
        settlement_status,
        created_at: now_dt,
    }))
}
