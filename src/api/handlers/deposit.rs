use axum::{extract::State, http::StatusCode, Extension, Json};
use chrono::{DateTime, Utc};
use ethers::types::{Address, U256};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use std::sync::Arc;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::{AppState, BalanceUpdateEvent};

// Error response type
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub code: String,
}

#[derive(Debug, Deserialize)]
pub struct PrepareDepositRequest {
    pub token: String,
    pub amount: Decimal,
}

#[derive(Debug, Serialize)]
pub struct PrepareDepositResponse {
    pub contract_address: String,
    pub token_address: String,
    pub amount: String,
    pub estimated_gas: u64,
}

#[derive(Debug, Serialize)]
pub struct DepositHistoryResponse {
    pub deposits: Vec<DepositRecord>,
}

#[derive(Debug, Serialize)]
pub struct DepositRecord {
    pub id: String,
    pub token: String,
    pub amount: Decimal,
    pub tx_hash: String,
    pub status: String,
    pub created_at: i64,
}

/// Prepare deposit - returns contract call parameters
pub async fn prepare_deposit(
    State(state): State<Arc<AppState>>,
    Extension(_auth_user): Extension<AuthUser>,
    Json(req): Json<PrepareDepositRequest>,
) -> Result<Json<PrepareDepositResponse>, StatusCode> {
    // Get token address from config
    let token_address = state.config.get_token_address(&req.token)
        .ok_or(StatusCode::BAD_REQUEST)?;

    Ok(Json(PrepareDepositResponse {
        contract_address: state.config.vault_address.clone(),
        token_address: token_address.to_string(),
        amount: req.amount.to_string(),
        estimated_gas: 100000,
    }))
}

/// Get deposit history
pub async fn get_history(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<Json<DepositHistoryResponse>, StatusCode> {
    // Fetch deposit history from database
    let rows: Vec<(Uuid, String, Decimal, String, String, DateTime<Utc>)> = sqlx::query_as(
        r#"
        SELECT id, token, amount, tx_hash, status, created_at
        FROM deposits
        WHERE user_address = $1
        ORDER BY created_at DESC
        LIMIT 100
        "#
    )
    .bind(&auth_user.address.to_lowercase())
    .fetch_all(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch deposit history: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let deposits: Vec<DepositRecord> = rows
        .into_iter()
        .map(|(id, token, amount, tx_hash, status, created_at)| {
            DepositRecord {
                id: id.to_string(),
                token,
                amount,
                tx_hash,
                status,
                created_at: created_at.timestamp(),
            }
        })
        .collect();

    Ok(Json(DepositHistoryResponse { deposits }))
}

// ============================================================================
// Deposit Confirmation (for on-chain deposits)
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct ConfirmDepositRequest {
    pub tx_hash: String,
}

#[derive(Debug, Serialize)]
pub struct ConfirmDepositResponse {
    pub deposit_id: String,
    pub amount: Decimal,
    pub status: String,
    pub new_balance: Decimal,
}

/// Confirm a deposit by tx_hash - verifies on-chain and credits balance
/// POST /deposit/confirm
pub async fn confirm_deposit(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<ConfirmDepositRequest>,
) -> Result<Json<ConfirmDepositResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user_address = auth_user.address.to_lowercase();
    let tx_hash = req.tx_hash.to_lowercase();

    // Validate tx_hash format
    if !tx_hash.starts_with("0x") || tx_hash.len() != 66 {
        return Err((StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "Invalid transaction hash format".to_string(),
            code: "INVALID_TX_HASH".to_string(),
        })));
    }

    // Check if this tx_hash is already processed
    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT status FROM deposits WHERE tx_hash = $1"
    )
    .bind(&tx_hash)
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("DB error checking deposit: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Database error".to_string(),
            code: "DB_ERROR".to_string(),
        }))
    })?;

    if let Some((status,)) = existing {
        if status == "confirmed" {
            return Err((StatusCode::BAD_REQUEST, Json(ErrorResponse {
                error: "Deposit already confirmed".to_string(),
                code: "ALREADY_CONFIRMED".to_string(),
            })));
        }
    }

    // Get blockchain client
    let blockchain_client = state.blockchain_client.as_ref()
        .ok_or_else(|| {
            (StatusCode::SERVICE_UNAVAILABLE, Json(ErrorResponse {
                error: "Blockchain client not available".to_string(),
                code: "NO_BLOCKCHAIN".to_string(),
            }))
        })?;

    // Parse vault address
    let vault_address: Address = state.config.vault_address.parse()
        .map_err(|_| {
            tracing::error!("Invalid vault address in config: {}", state.config.vault_address);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                error: "Server configuration error".to_string(),
                code: "CONFIG_ERROR".to_string(),
            }))
        })?;

    // Verify the transaction on-chain
    // We use min_amount = 0 since we'll accept any amount transferred to vault
    let verified = blockchain_client
        .verify_usdc_transfer_by_hash(
            &tx_hash,
            vault_address,
            U256::zero(), // Accept any amount
            state.config.min_confirmations,
        )
        .await
        .map_err(|e| {
            let error_msg = e.to_string();
            tracing::warn!("Deposit verification failed for tx {}: {}", tx_hash, error_msg);

            // Provide user-friendly error messages
            let (code, message) = if error_msg.contains("not found") {
                ("TX_NOT_FOUND", "Transaction not found. Please wait for it to be mined.")
            } else if error_msg.contains("confirmations") {
                ("INSUFFICIENT_CONFIRMATIONS", "Transaction needs more confirmations. Please wait.")
            } else if error_msg.contains("failed") {
                ("TX_FAILED", "Transaction failed on-chain.")
            } else if error_msg.contains("No valid USDC Transfer") {
                ("NO_TRANSFER", "No USDC transfer to vault found in this transaction.")
            } else {
                ("VERIFICATION_FAILED", &error_msg as &str)
            };

            (StatusCode::BAD_REQUEST, Json(ErrorResponse {
                error: message.to_string(),
                code: code.to_string(),
            }))
        })?;

    // Verify the sender matches the authenticated user
    let sender_address = format!("{:?}", verified.from).to_lowercase();
    if sender_address != user_address {
        return Err((StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "Transaction sender does not match authenticated user".to_string(),
            code: "SENDER_MISMATCH".to_string(),
        })));
    }

    // Convert amount from U256 (with 6 decimals for USDC) to Decimal
    let amount_u128 = verified.amount.as_u128();
    let amount = Decimal::from(amount_u128) / Decimal::from(1_000_000u64); // 6 decimals

    if amount <= Decimal::ZERO {
        return Err((StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "Invalid deposit amount".to_string(),
            code: "INVALID_AMOUNT".to_string(),
        })));
    }

    // Start database transaction
    let mut db_tx = state.db.pool.begin().await.map_err(|e| {
        tracing::error!("Failed to start transaction: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Database error".to_string(),
            code: "DB_ERROR".to_string(),
        }))
    })?;

    let deposit_id = Uuid::new_v4();

    // Insert deposit record
    sqlx::query(
        r#"
        INSERT INTO deposits (id, user_address, token, amount, tx_hash, block_number, status, created_at)
        VALUES ($1, $2, 'USDC', $3, $4, $5, 'confirmed', NOW())
        ON CONFLICT (tx_hash) DO NOTHING
        "#
    )
    .bind(deposit_id)
    .bind(&user_address)
    .bind(amount)
    .bind(&tx_hash)
    .bind(verified.block_number as i64)
    .execute(&mut *db_tx)
    .await
    .map_err(|e| {
        tracing::error!("Failed to insert deposit: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Failed to record deposit".to_string(),
            code: "DB_ERROR".to_string(),
        }))
    })?;

    // Update or insert balance
    let new_balance: Decimal = sqlx::query_scalar(
        r#"
        INSERT INTO balances (user_address, token, available, frozen, created_at, updated_at)
        VALUES ($1, 'USDC', $2, 0, NOW(), NOW())
        ON CONFLICT (user_address, token)
        DO UPDATE SET
            available = balances.available + $2,
            updated_at = NOW()
        RETURNING available
        "#
    )
    .bind(&user_address)
    .bind(amount)
    .fetch_one(&mut *db_tx)
    .await
    .map_err(|e| {
        tracing::error!("Failed to update balance: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Failed to update balance".to_string(),
            code: "DB_ERROR".to_string(),
        }))
    })?;

    // Commit transaction
    db_tx.commit().await.map_err(|e| {
        tracing::error!("Failed to commit transaction: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Transaction failed".to_string(),
            code: "DB_ERROR".to_string(),
        }))
    })?;

    tracing::info!(
        "On-chain deposit confirmed: {} USDC from {} (tx: {}, block: {}, confirmations: {})",
        amount, user_address, tx_hash, verified.block_number, verified.confirmations
    );

    // Broadcast balance update via WebSocket
    let _ = state.balance_update_sender.send(BalanceUpdateEvent {
        user_address: user_address.clone(),
        token: "USDC".to_string(),
        available: new_balance.to_string(),
        frozen: "0".to_string(),
        total: new_balance.to_string(),
        event_type: "deposit".to_string(),
    });

    Ok(Json(ConfirmDepositResponse {
        deposit_id: deposit_id.to_string(),
        amount,
        status: "confirmed".to_string(),
        new_balance,
    }))
}

// ============================================================================
// Direct Deposit (for development/testing without on-chain transaction)
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct DirectDepositRequest {
    pub amount: Decimal,
}

#[derive(Debug, Serialize)]
pub struct DirectDepositResponse {
    pub deposit_id: String,
    pub amount: Decimal,
    pub new_balance: Decimal,
    pub message: String,
}

/// Direct deposit for development - credits balance without on-chain tx
/// POST /deposit/direct
///
/// This endpoint is for DEVELOPMENT ONLY - in production, use confirm_deposit
pub async fn direct_deposit(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<DirectDepositRequest>,
) -> Result<Json<DirectDepositResponse>, (StatusCode, Json<ErrorResponse>)> {
    // Only allow in development mode
    if state.config.environment != "development" {
        return Err((StatusCode::FORBIDDEN, Json(ErrorResponse {
            error: "Direct deposit only available in development mode".to_string(),
            code: "FORBIDDEN".to_string(),
        })));
    }

    let user_address = auth_user.address.to_lowercase();
    let amount = req.amount;

    if amount <= Decimal::ZERO {
        return Err((StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "Amount must be positive".to_string(),
            code: "INVALID_AMOUNT".to_string(),
        })));
    }

    // Start transaction
    let mut tx = state.db.pool.begin().await.map_err(|e| {
        tracing::error!("Failed to start transaction: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Database error".to_string(),
            code: "DB_ERROR".to_string(),
        }))
    })?;

    // Generate a fake tx_hash for the deposit record
    let deposit_id = Uuid::new_v4();
    let fake_tx_hash = format!("0x{:064x}", deposit_id.as_u128());

    // Insert deposit record
    sqlx::query(
        r#"
        INSERT INTO deposits (id, user_address, token, amount, tx_hash, block_number, status, created_at)
        VALUES ($1, $2, 'USDC', $3, $4, 0, 'confirmed', NOW())
        "#
    )
    .bind(deposit_id)
    .bind(&user_address)
    .bind(amount)
    .bind(&fake_tx_hash)
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("Failed to insert deposit: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Failed to record deposit".to_string(),
            code: "DB_ERROR".to_string(),
        }))
    })?;

    // Update or insert balance
    let new_balance: Decimal = sqlx::query_scalar(
        r#"
        INSERT INTO balances (user_address, token, available, frozen, created_at, updated_at)
        VALUES ($1, 'USDC', $2, 0, NOW(), NOW())
        ON CONFLICT (user_address, token)
        DO UPDATE SET
            available = balances.available + $2,
            updated_at = NOW()
        RETURNING available
        "#
    )
    .bind(&user_address)
    .bind(amount)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("Failed to update balance: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Failed to update balance".to_string(),
            code: "DB_ERROR".to_string(),
        }))
    })?;

    // Commit transaction
    tx.commit().await.map_err(|e| {
        tracing::error!("Failed to commit transaction: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Transaction failed".to_string(),
            code: "DB_ERROR".to_string(),
        }))
    })?;

    tracing::info!(
        "Direct deposit: {} USDC credited to {} (new balance: {})",
        amount, user_address, new_balance
    );

    // Broadcast balance update via WebSocket
    let _ = state.balance_update_sender.send(BalanceUpdateEvent {
        user_address: user_address.clone(),
        token: "USDC".to_string(),
        available: new_balance.to_string(),
        frozen: "0".to_string(), // Direct deposit doesn't affect frozen
        total: new_balance.to_string(),
        event_type: "deposit".to_string(),
    });

    Ok(Json(DirectDepositResponse {
        deposit_id: deposit_id.to_string(),
        amount,
        new_balance,
        message: "Development deposit successful. In production, use on-chain deposits.".to_string(),
    }))
}

// ============================================================================
// Get Balance
// ============================================================================

#[derive(Debug, Serialize)]
pub struct BalanceResponse {
    pub token: String,
    pub available: Decimal,
    pub frozen: Decimal,
    pub total: Decimal,
}

#[derive(Debug, Serialize)]
pub struct BalancesResponse {
    pub balances: Vec<BalanceResponse>,
}

// ============================================================================
// On-Chain Balance and Allowance (for Polymarket-style approve mode)
// ============================================================================

#[derive(Debug, Serialize)]
pub struct OnChainBalanceResponse {
    pub usdc_balance: String,
    pub usdc_balance_formatted: String,
    pub allowance_ctf_exchange: String,
    pub allowance_formatted: String,
    pub needs_approval: bool,
}

/// Get user's on-chain USDC balance and allowance for CTFExchange
/// GET /deposit/onchain-balance
pub async fn get_onchain_balance(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<Json<OnChainBalanceResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user_address: Address = auth_user.address.parse().map_err(|_| {
        (StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "Invalid user address".to_string(),
            code: "INVALID_ADDRESS".to_string(),
        }))
    })?;

    let blockchain_client = state.blockchain_client.as_ref()
        .ok_or_else(|| {
            (StatusCode::SERVICE_UNAVAILABLE, Json(ErrorResponse {
                error: "Blockchain client not available".to_string(),
                code: "NO_BLOCKCHAIN".to_string(),
            }))
        })?;

    // Get USDC balance
    let usdc_balance = blockchain_client.get_usdc_balance(user_address).await
        .map_err(|e| {
            tracing::error!("Failed to get USDC balance: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                error: "Failed to get on-chain balance".to_string(),
                code: "BLOCKCHAIN_ERROR".to_string(),
            }))
        })?;

    // Get allowance for CTFExchange
    let ctf_exchange_address = blockchain_client.addresses().ctf_exchange;
    let allowance = blockchain_client.get_usdc_allowance(user_address, ctf_exchange_address).await
        .map_err(|e| {
            tracing::error!("Failed to get USDC allowance: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                error: "Failed to get allowance".to_string(),
                code: "BLOCKCHAIN_ERROR".to_string(),
            }))
        })?;

    // Format with 6 decimals (USDC)
    let balance_formatted = format_usdc(usdc_balance);
    let allowance_formatted = format_usdc(allowance);

    // Check if user needs to approve (allowance is 0 or less than balance)
    let needs_approval = allowance < usdc_balance;

    Ok(Json(OnChainBalanceResponse {
        usdc_balance: usdc_balance.to_string(),
        usdc_balance_formatted: balance_formatted,
        allowance_ctf_exchange: allowance.to_string(),
        allowance_formatted,
        needs_approval,
    }))
}

#[derive(Debug, Deserialize)]
pub struct CheckAllowanceRequest {
    pub amount: String, // Amount to check (in USDC with 6 decimals)
}

#[derive(Debug, Serialize)]
pub struct CheckAllowanceResponse {
    pub current_allowance: String,
    pub current_allowance_formatted: String,
    pub required_amount: String,
    pub required_amount_formatted: String,
    pub is_sufficient: bool,
    pub ctf_exchange_address: String,
}

/// Check if user has sufficient USDC allowance for CTFExchange
/// POST /deposit/check-allowance
pub async fn check_allowance(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<CheckAllowanceRequest>,
) -> Result<Json<CheckAllowanceResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user_address: Address = auth_user.address.parse().map_err(|_| {
        (StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "Invalid user address".to_string(),
            code: "INVALID_ADDRESS".to_string(),
        }))
    })?;

    let required_amount = U256::from_dec_str(&req.amount).map_err(|_| {
        (StatusCode::BAD_REQUEST, Json(ErrorResponse {
            error: "Invalid amount format".to_string(),
            code: "INVALID_AMOUNT".to_string(),
        }))
    })?;

    let blockchain_client = state.blockchain_client.as_ref()
        .ok_or_else(|| {
            (StatusCode::SERVICE_UNAVAILABLE, Json(ErrorResponse {
                error: "Blockchain client not available".to_string(),
                code: "NO_BLOCKCHAIN".to_string(),
            }))
        })?;

    let ctf_exchange_address = blockchain_client.addresses().ctf_exchange;
    let current_allowance = blockchain_client.get_usdc_allowance(user_address, ctf_exchange_address).await
        .map_err(|e| {
            tracing::error!("Failed to get USDC allowance: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
                error: "Failed to get allowance".to_string(),
                code: "BLOCKCHAIN_ERROR".to_string(),
            }))
        })?;

    let is_sufficient = current_allowance >= required_amount;

    Ok(Json(CheckAllowanceResponse {
        current_allowance: current_allowance.to_string(),
        current_allowance_formatted: format_usdc(current_allowance),
        required_amount: required_amount.to_string(),
        required_amount_formatted: format_usdc(required_amount),
        is_sufficient,
        ctf_exchange_address: format!("{:?}", ctf_exchange_address),
    }))
}

/// Format U256 as USDC string (6 decimals)
fn format_usdc(amount: U256) -> String {
    let amount_u128 = amount.as_u128();
    let whole = amount_u128 / 1_000_000;
    let frac = amount_u128 % 1_000_000;
    format!("{}.{:06}", whole, frac)
}

// ============================================================================
// Get Balance (from database)
// ============================================================================

/// Get user balances
/// GET /account/balances (also available as /deposit/balance)
pub async fn get_balance(
    State(state): State<Arc<AppState>>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<Json<BalancesResponse>, (StatusCode, Json<ErrorResponse>)> {
    let user_address = auth_user.address.to_lowercase();

    let rows: Vec<(String, Decimal, Decimal)> = sqlx::query_as(
        r#"
        SELECT token, available, frozen
        FROM balances
        WHERE user_address = $1
        "#
    )
    .bind(&user_address)
    .fetch_all(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch balances: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(ErrorResponse {
            error: "Database error".to_string(),
            code: "DB_ERROR".to_string(),
        }))
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
