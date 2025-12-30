//! Withdraw API Handlers for Prediction Markets
//!
//! Provides endpoints for token withdrawal operations.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension, Json,
};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

// ============================================================================
// Request Types
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct WithdrawRequest {
    pub token: String,
    pub amount: Decimal,
}

#[derive(Debug, Deserialize)]
pub struct ConfirmWithdrawRequest {
    pub tx_hash: String,
}

// ============================================================================
// Response Types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Debug, Serialize)]
pub struct WithdrawResponse {
    pub withdraw_id: String,
    pub token: String,
    pub amount: String,
    pub status: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
pub struct WithdrawHistoryResponse {
    pub withdrawals: Vec<WithdrawHistoryRecord>,
}

#[derive(Debug, Serialize)]
pub struct WithdrawHistoryRecord {
    pub id: String,
    pub token: String,
    pub amount: Decimal,
    pub tx_hash: Option<String>,
    pub status: String,
    pub created_at: i64,
}

// ============================================================================
// Handlers
// ============================================================================

/// Request a withdrawal
/// POST /withdraw
pub async fn request_withdraw(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<WithdrawRequest>,
) -> Result<Json<WithdrawResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user_address = auth_user.address.to_lowercase();

    // Validate amount
    if req.amount <= Decimal::ZERO {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Amount must be positive".to_string(),
            }),
        ));
    }

    // Check user balance
    let balance: Option<(Decimal,)> = sqlx::query_as(
        "SELECT available FROM balances WHERE user_address = $1 AND token = $2",
    )
    .bind(&user_address)
    .bind(&req.token)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to check balance: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to check balance".to_string(),
            }),
        )
    })?;

    let available = balance.map(|(b,)| b).unwrap_or(Decimal::ZERO);
    if available < req.amount {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("Insufficient balance: {} < {}", available, req.amount),
            }),
        ));
    }

    // Create withdrawal record and freeze funds in a transaction
    let withdraw_id = Uuid::new_v4();
    let mut tx = state.db.pool.begin().await.map_err(|e| {
        tracing::error!("Failed to start transaction: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to process withdrawal".to_string(),
            }),
        )
    })?;

    // Freeze funds
    sqlx::query(
        r#"
        UPDATE balances
        SET available = available - $1, frozen = frozen + $1
        WHERE user_address = $2 AND token = $3 AND available >= $1
        "#,
    )
    .bind(req.amount)
    .bind(&user_address)
    .bind(&req.token)
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("Failed to freeze funds: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to freeze funds".to_string(),
            }),
        )
    })?;

    // Create withdrawal record
    let created_at = Utc::now();
    sqlx::query(
        r#"
        INSERT INTO withdrawals (id, user_address, token, amount, status, created_at)
        VALUES ($1, $2, $3, $4, 'pending', $5)
        "#,
    )
    .bind(withdraw_id)
    .bind(&user_address)
    .bind(&req.token)
    .bind(req.amount)
    .bind(created_at)
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("Failed to create withdrawal: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to create withdrawal".to_string(),
            }),
        )
    })?;

    tx.commit().await.map_err(|e| {
        tracing::error!("Failed to commit transaction: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to process withdrawal".to_string(),
            }),
        )
    })?;

    tracing::info!(
        "Withdrawal requested - user: {}, token: {}, amount: {}, id: {}",
        user_address,
        req.token,
        req.amount,
        withdraw_id
    );

    Ok(Json(WithdrawResponse {
        withdraw_id: withdraw_id.to_string(),
        token: req.token,
        amount: req.amount.to_string(),
        status: "pending".to_string(),
        created_at: created_at.timestamp_millis(),
    }))
}

/// Get withdrawal history
/// GET /withdraw/history
pub async fn get_history(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<Json<WithdrawHistoryResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user_address = auth_user.address.to_lowercase();

    let rows: Vec<(Uuid, String, Decimal, Option<String>, String, DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT id, token, amount, tx_hash, status, created_at
        FROM withdrawals
        WHERE user_address = $1
        ORDER BY created_at DESC
        LIMIT 100
        "#,
    )
    .bind(&user_address)
    .fetch_all(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch withdrawals: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to fetch withdrawal history".to_string(),
            }),
        )
    })?;

    let withdrawals: Vec<WithdrawHistoryRecord> = rows
        .into_iter()
        .map(|(id, token, amount, tx_hash, status, created_at)| WithdrawHistoryRecord {
            id: id.to_string(),
            token,
            amount,
            tx_hash,
            status,
            created_at: created_at.timestamp_millis(),
        })
        .collect();

    Ok(Json(WithdrawHistoryResponse { withdrawals }))
}

/// Get a specific withdrawal
/// GET /withdraw/:withdrawal_id
pub async fn get_withdrawal(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(withdrawal_id): Path<Uuid>,
) -> Result<Json<WithdrawHistoryRecord>, (StatusCode, Json<ErrorResponse>)> {
    let user_address = auth_user.address.to_lowercase();

    let row: Option<(Uuid, String, Decimal, Option<String>, String, DateTime<Utc>)> =
        sqlx::query_as(
            r#"
        SELECT id, token, amount, tx_hash, status, created_at
        FROM withdrawals
        WHERE id = $1 AND user_address = $2
        "#,
        )
        .bind(withdrawal_id)
        .bind(&user_address)
        .fetch_optional(&state.db.pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch withdrawal: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to fetch withdrawal".to_string(),
                }),
            )
        })?;

    match row {
        Some((id, token, amount, tx_hash, status, created_at)) => {
            Ok(Json(WithdrawHistoryRecord {
                id: id.to_string(),
                token,
                amount,
                tx_hash,
                status,
                created_at: created_at.timestamp_millis(),
            }))
        }
        None => Err((
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Withdrawal not found".to_string(),
            }),
        )),
    }
}

/// Cancel a pending withdrawal
/// DELETE /withdraw/:withdrawal_id
pub async fn cancel_withdraw(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(withdrawal_id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let user_address = auth_user.address.to_lowercase();

    // Get withdrawal info
    let withdrawal: Option<(String, Decimal, String)> = sqlx::query_as(
        "SELECT token, amount, status FROM withdrawals WHERE id = $1 AND user_address = $2",
    )
    .bind(withdrawal_id)
    .bind(&user_address)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch withdrawal: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to fetch withdrawal".to_string(),
            }),
        )
    })?;

    let (token, amount, status) = withdrawal.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Withdrawal not found".to_string(),
            }),
        )
    })?;

    if status != "pending" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("Cannot cancel withdrawal with status: {}", status),
            }),
        ));
    }

    // Unfreeze funds and cancel withdrawal
    let mut tx = state.db.pool.begin().await.map_err(|e| {
        tracing::error!("Failed to start transaction: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to cancel withdrawal".to_string(),
            }),
        )
    })?;

    // Unfreeze funds
    sqlx::query(
        r#"
        UPDATE balances
        SET available = available + $1, frozen = frozen - $1
        WHERE user_address = $2 AND token = $3
        "#,
    )
    .bind(amount)
    .bind(&user_address)
    .bind(&token)
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("Failed to unfreeze funds: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to unfreeze funds".to_string(),
            }),
        )
    })?;

    // Update withdrawal status
    sqlx::query("UPDATE withdrawals SET status = 'cancelled' WHERE id = $1")
        .bind(withdrawal_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            tracing::error!("Failed to cancel withdrawal: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to cancel withdrawal".to_string(),
                }),
            )
        })?;

    tx.commit().await.map_err(|e| {
        tracing::error!("Failed to commit transaction: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to cancel withdrawal".to_string(),
            }),
        )
    })?;

    tracing::info!(
        "Withdrawal cancelled - user: {}, id: {}",
        user_address,
        withdrawal_id
    );

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Withdrawal cancelled"
    })))
}

/// Confirm withdrawal with transaction hash
/// POST /withdraw/:withdrawal_id/confirm
pub async fn confirm_withdraw(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(withdrawal_id): Path<Uuid>,
    Json(req): Json<ConfirmWithdrawRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<ErrorResponse>)> {
    let user_address = auth_user.address.to_lowercase();

    // Get withdrawal info
    let withdrawal: Option<(String, Decimal, String)> = sqlx::query_as(
        "SELECT token, amount, status FROM withdrawals WHERE id = $1 AND user_address = $2",
    )
    .bind(withdrawal_id)
    .bind(&user_address)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch withdrawal: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to fetch withdrawal".to_string(),
            }),
        )
    })?;

    let (token, amount, status) = withdrawal.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Withdrawal not found".to_string(),
            }),
        )
    })?;

    if status != "pending" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!("Cannot confirm withdrawal with status: {}", status),
            }),
        ));
    }

    // Update withdrawal with tx_hash and deduct frozen balance
    let mut tx = state.db.pool.begin().await.map_err(|e| {
        tracing::error!("Failed to start transaction: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to confirm withdrawal".to_string(),
            }),
        )
    })?;

    // Deduct frozen balance
    sqlx::query(
        r#"
        UPDATE balances
        SET frozen = frozen - $1
        WHERE user_address = $2 AND token = $3
        "#,
    )
    .bind(amount)
    .bind(&user_address)
    .bind(&token)
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("Failed to deduct frozen balance: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to deduct frozen balance".to_string(),
            }),
        )
    })?;

    // Update withdrawal status
    sqlx::query("UPDATE withdrawals SET status = 'completed', tx_hash = $1 WHERE id = $2")
        .bind(&req.tx_hash)
        .bind(withdrawal_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            tracing::error!("Failed to confirm withdrawal: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to confirm withdrawal".to_string(),
                }),
            )
        })?;

    tx.commit().await.map_err(|e| {
        tracing::error!("Failed to commit transaction: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to confirm withdrawal".to_string(),
            }),
        )
    })?;

    tracing::info!(
        "Withdrawal confirmed - user: {}, id: {}, tx: {}",
        user_address,
        withdrawal_id,
        req.tx_hash
    );

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Withdrawal confirmed"
    })))
}
