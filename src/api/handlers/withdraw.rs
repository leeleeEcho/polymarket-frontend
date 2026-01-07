//! Withdraw API Handlers for Prediction Markets
//!
//! Provides endpoints for token withdrawal operations.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Extension, Json,
};
use chrono::{DateTime, Utc};
use ethers::types::{Address, U256};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::blockchain::types::TxStatus;
use crate::{AppState, BalanceUpdateEvent};

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
    let expiry = created_at.timestamp() + 86400; // 24 hours from now
    let nonce = created_at.timestamp_millis(); // Use timestamp as nonce

    sqlx::query(
        r#"
        INSERT INTO withdrawals (id, user_address, token, amount, to_address, nonce, expiry, status, created_at)
        VALUES ($1, $2, $3, $4, $2, $5, $6, 'pending', $7)
        "#,
    )
    .bind(withdraw_id)
    .bind(&user_address)
    .bind(&req.token)
    .bind(req.amount)
    .bind(nonce)
    .bind(expiry)
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

    // Broadcast balance update (funds frozen)
    let new_available = available - req.amount;
    let new_frozen = req.amount; // This is the newly frozen amount, not total frozen
    let _ = state.balance_update_sender.send(BalanceUpdateEvent {
        user_address: user_address.clone(),
        token: req.token.clone(),
        available: new_available.to_string(),
        frozen: new_frozen.to_string(),
        total: available.to_string(), // Total unchanged
        event_type: "freeze".to_string(),
    });

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
        SELECT id, token, amount, tx_hash, status::text, created_at
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
        SELECT id, token, amount, tx_hash, status::text, created_at
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
        "SELECT token, amount, status::text FROM withdrawals WHERE id = $1 AND user_address = $2",
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

    // Broadcast balance update (funds unfrozen)
    let _ = state.balance_update_sender.send(BalanceUpdateEvent {
        user_address: user_address.clone(),
        token: token.clone(),
        available: amount.to_string(), // Amount returned to available
        frozen: (-amount).to_string(), // Negative indicates decrease in frozen
        total: "0".to_string(), // Total unchanged (delta is 0)
        event_type: "unfreeze".to_string(),
    });

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "Withdrawal cancelled"
    })))
}

/// Confirm withdrawal with transaction hash (legacy - user provides tx_hash)
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
        "SELECT token, amount, status::text FROM withdrawals WHERE id = $1 AND user_address = $2",
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

// ============================================================================
// On-Chain Withdrawal Processing
// ============================================================================

#[derive(Debug, Serialize)]
pub struct ProcessWithdrawResponse {
    pub withdraw_id: String,
    pub tx_hash: String,
    pub amount: Decimal,
    pub status: String,
    pub new_balance: Decimal,
}

/// Process a pending withdrawal on-chain
/// Backend sends USDC from vault to user's wallet
/// POST /withdraw/:withdrawal_id/process
pub async fn process_withdraw(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Path(withdrawal_id): Path<Uuid>,
) -> Result<Json<ProcessWithdrawResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user_address = auth_user.address.to_lowercase();

    // Get blockchain client
    let blockchain_client = state.blockchain_client.as_ref().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "Blockchain client not available".to_string(),
            }),
        )
    })?;

    // Get withdrawal info
    let withdrawal: Option<(String, Decimal, String, String)> = sqlx::query_as(
        "SELECT token, amount, status::text, to_address FROM withdrawals WHERE id = $1 AND user_address = $2",
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

    let (token, amount, status, to_address) = withdrawal.ok_or_else(|| {
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
                error: format!("Cannot process withdrawal with status: {}", status),
            }),
        ));
    }

    if token != "USDC" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Only USDC withdrawals are supported for on-chain processing".to_string(),
            }),
        ));
    }

    // Parse recipient address
    let recipient: Address = to_address.parse().map_err(|_| {
        tracing::error!("Invalid recipient address: {}", to_address);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Invalid recipient address".to_string(),
            }),
        )
    })?;

    // Convert Decimal to U256 (USDC has 6 decimals)
    let amount_u128: u128 = (amount * Decimal::from(1_000_000u64))
        .try_into()
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "Invalid withdrawal amount".to_string(),
                }),
            )
        })?;
    let amount_u256 = U256::from(amount_u128);

    // Mark withdrawal as processing
    sqlx::query("UPDATE withdrawals SET status = 'processing' WHERE id = $1")
        .bind(withdrawal_id)
        .execute(&state.db.pool)
        .await
        .map_err(|e| {
            tracing::error!("Failed to update withdrawal status: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to update withdrawal status".to_string(),
                }),
            )
        })?;

    // Send USDC on-chain
    let tx_result = blockchain_client
        .send_usdc(recipient, amount_u256)
        .await
        .map_err(|e| {
            tracing::error!("On-chain withdrawal failed for {}: {}", withdrawal_id, e);
            // Revert status back to pending on failure
            let _ = futures::executor::block_on(async {
                sqlx::query("UPDATE withdrawals SET status = 'pending' WHERE id = $1")
                    .bind(withdrawal_id)
                    .execute(&state.db.pool)
                    .await
            });
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("On-chain transfer failed: {}", e),
                }),
            )
        })?;

    // Check if transaction was successful
    if tx_result.status != TxStatus::Confirmed {
        // Revert status back to pending
        sqlx::query("UPDATE withdrawals SET status = 'pending' WHERE id = $1")
            .bind(withdrawal_id)
            .execute(&state.db.pool)
            .await
            .ok();

        return Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "On-chain transaction failed".to_string(),
            }),
        ));
    }

    let tx_hash = format!("{:?}", tx_result.tx_hash);

    // Start database transaction to finalize
    let mut db_tx = state.db.pool.begin().await.map_err(|e| {
        tracing::error!("Failed to start transaction: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    // Deduct frozen balance
    let new_balance: Decimal = sqlx::query_scalar(
        r#"
        UPDATE balances
        SET frozen = frozen - $1, updated_at = NOW()
        WHERE user_address = $2 AND token = 'USDC'
        RETURNING available
        "#,
    )
    .bind(amount)
    .bind(&user_address)
    .fetch_one(&mut *db_tx)
    .await
    .map_err(|e| {
        tracing::error!("Failed to deduct frozen balance: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to update balance".to_string(),
            }),
        )
    })?;

    // Update withdrawal status to completed
    sqlx::query(
        "UPDATE withdrawals SET status = 'completed', tx_hash = $1, updated_at = NOW() WHERE id = $2",
    )
    .bind(&tx_hash)
    .bind(withdrawal_id)
    .execute(&mut *db_tx)
    .await
    .map_err(|e| {
        tracing::error!("Failed to complete withdrawal: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to complete withdrawal".to_string(),
            }),
        )
    })?;

    // Commit transaction
    db_tx.commit().await.map_err(|e| {
        tracing::error!("Failed to commit transaction: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Transaction failed".to_string(),
            }),
        )
    })?;

    tracing::info!(
        "On-chain withdrawal completed - user: {}, id: {}, amount: {}, tx: {}",
        user_address,
        withdrawal_id,
        amount,
        tx_hash
    );

    // Broadcast balance update
    let _ = state.balance_update_sender.send(BalanceUpdateEvent {
        user_address: user_address.clone(),
        token: "USDC".to_string(),
        available: new_balance.to_string(),
        frozen: (-amount).to_string(),
        total: (new_balance - amount).to_string(),
        event_type: "withdrawal".to_string(),
    });

    Ok(Json(ProcessWithdrawResponse {
        withdraw_id: withdrawal_id.to_string(),
        tx_hash,
        amount,
        status: "completed".to_string(),
        new_balance,
    }))
}

// ============================================================================
// Direct Withdrawal (for development/testing)
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct DirectWithdrawRequest {
    pub amount: Decimal,
}

#[derive(Debug, Serialize)]
pub struct DirectWithdrawResponse {
    pub withdraw_id: String,
    pub amount: Decimal,
    pub new_balance: Decimal,
    pub message: String,
}

/// Direct withdrawal for development - deducts balance without on-chain tx
/// POST /withdraw/direct
///
/// This endpoint is for DEVELOPMENT ONLY
pub async fn direct_withdraw(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<DirectWithdrawRequest>,
) -> Result<Json<DirectWithdrawResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Only allow in development mode
    if state.config.environment != "development" {
        return Err((
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Direct withdrawal only available in development mode".to_string(),
            }),
        ));
    }

    let user_address = auth_user.address.to_lowercase();
    let amount = req.amount;

    if amount <= Decimal::ZERO {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Amount must be positive".to_string(),
            }),
        ));
    }

    // Check available balance
    let balance: Option<(Decimal,)> = sqlx::query_as(
        "SELECT available FROM balances WHERE user_address = $1 AND token = 'USDC'",
    )
    .bind(&user_address)
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
    if available < amount {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: format!(
                    "Insufficient balance: available {} USDC, requested {} USDC",
                    available, amount
                ),
            }),
        ));
    }

    // Start transaction
    let mut tx = state.db.pool.begin().await.map_err(|e| {
        tracing::error!("Failed to start transaction: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Database error".to_string(),
            }),
        )
    })?;

    // Generate withdrawal ID and fake tx_hash
    let withdraw_id = Uuid::new_v4();
    let fake_tx_hash = format!("0x{:064x}", withdraw_id.as_u128());

    // Insert withdrawal record as completed
    let now_ts = Utc::now().timestamp_millis();
    sqlx::query(
        r#"
        INSERT INTO withdrawals (id, user_address, token, amount, to_address, nonce, expiry, tx_hash, status, created_at)
        VALUES ($1, $2, 'USDC', $3, $2, $4, $4, $5, 'completed', NOW())
        "#,
    )
    .bind(withdraw_id)
    .bind(&user_address)
    .bind(amount)
    .bind(now_ts)
    .bind(&fake_tx_hash)
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("Failed to insert withdrawal: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to record withdrawal".to_string(),
            }),
        )
    })?;

    // Deduct from available balance
    let new_balance: Decimal = sqlx::query_scalar(
        r#"
        UPDATE balances
        SET available = available - $1, updated_at = NOW()
        WHERE user_address = $2 AND token = 'USDC'
        RETURNING available
        "#,
    )
    .bind(amount)
    .bind(&user_address)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("Failed to update balance: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Failed to update balance".to_string(),
            }),
        )
    })?;

    // Commit transaction
    tx.commit().await.map_err(|e| {
        tracing::error!("Failed to commit transaction: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: "Transaction failed".to_string(),
            }),
        )
    })?;

    tracing::info!(
        "Direct withdrawal: {} USDC withdrawn from {} (new balance: {})",
        amount,
        user_address,
        new_balance
    );

    // Broadcast balance update
    let _ = state.balance_update_sender.send(BalanceUpdateEvent {
        user_address: user_address.clone(),
        token: "USDC".to_string(),
        available: new_balance.to_string(),
        frozen: "0".to_string(),
        total: new_balance.to_string(),
        event_type: "withdrawal".to_string(),
    });

    Ok(Json(DirectWithdrawResponse {
        withdraw_id: withdraw_id.to_string(),
        amount,
        new_balance,
        message: "Development withdrawal successful. In production, use on-chain withdrawals."
            .to_string(),
    }))
}
