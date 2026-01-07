//! UMA Optimistic Oracle market resolution handlers
//!
//! Provides API endpoints for:
//! - Making market resolution assertions
//! - Settling assertions after liveness period
//! - Querying assertion status
//! - Disputing assertions

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use ethers::types::{Address, U256};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::services::uma_oracle::{
    AssertionDetails, AssertionStatus, MarketResolutionAssertion, UmaOracleClient, UmaOracleConfig,
    UmaOracleError,
};
use crate::AppState;

/// Request to make a market resolution assertion
#[derive(Debug, Deserialize)]
pub struct AssertMarketRequest {
    /// The outcome ID to assert as the winner
    pub outcome_id: Uuid,
    /// The asserter's address (must have approved bond)
    pub asserter: String,
    /// Signature proving the asserter authorized this assertion
    pub signature: String,
}

/// Response for market assertion
#[derive(Debug, Serialize)]
pub struct AssertMarketResponse {
    pub assertion_id: String,
    pub market_id: Uuid,
    pub outcome_id: Uuid,
    pub asserter: String,
    pub bond_amount: String,
    pub liveness_seconds: u64,
    pub expiration_time: String,
}

/// Response for settling an assertion
#[derive(Debug, Serialize)]
pub struct SettleAssertionResponse {
    pub assertion_id: String,
    pub market_id: Uuid,
    pub settled: bool,
    pub resolution: bool,
    pub message: String,
}

/// Response for assertion details
#[derive(Debug, Serialize)]
pub struct AssertionResponse {
    pub assertion: AssertionDetails,
    pub can_settle: bool,
    pub time_remaining_seconds: Option<i64>,
}

/// Response for market assertions list
#[derive(Debug, Serialize)]
pub struct MarketAssertionsResponse {
    pub market_id: Uuid,
    pub assertions: Vec<MarketResolutionAssertion>,
}

/// UMA Oracle info response
#[derive(Debug, Serialize)]
pub struct OracleInfoResponse {
    pub oracle_address: String,
    pub default_liveness_seconds: u64,
    pub minimum_bond: String,
    pub currency: String,
    pub supported: bool,
}

/// Make a market resolution assertion
/// POST /api/v1/markets/:market_id/assert
pub async fn assert_market_resolution(
    State(state): State<Arc<AppState>>,
    Path(market_id): Path<Uuid>,
    Json(req): Json<AssertMarketRequest>,
) -> Result<Json<AssertMarketResponse>, (StatusCode, String)> {
    // Check if UMA Oracle is configured
    let blockchain_client = state.blockchain_client.as_ref().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Blockchain client not configured".to_string(),
        )
    })?;

    // Parse asserter address
    let asserter: Address = req.asserter.parse().map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            "Invalid asserter address".to_string(),
        )
    })?;

    // Get outcome name
    let outcome = sqlx::query!(
        r#"SELECT name FROM outcomes WHERE id = $1"#,
        req.outcome_id
    )
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "Outcome not found".to_string()))?;

    // Create UMA Oracle client
    let oracle_config = UmaOracleConfig {
        oracle_address: state
            .config
            .get_uma_oracle_address()
            .parse()
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Invalid UMA Oracle address".to_string(),
                )
            })?,
        liveness_seconds: state.config.uma_liveness_seconds,
        bond_amount: U256::from_dec_str(&state.config.uma_bond_amount)
            .unwrap_or(U256::from(100_000_000u64)),
        currency: state.config.ctf_usdc_address.parse().unwrap_or_default(),
    };

    let uma_client = UmaOracleClient::new(
        blockchain_client.provider().clone().into(),
        oracle_config.clone(),
        state.db.pool.clone(),
    );

    // Make the assertion
    let assertion_id = uma_client
        .assert_market_resolution(market_id, req.outcome_id, &outcome.name, asserter)
        .await
        .map_err(|e| match e {
            UmaOracleError::MarketNotFound(_) => (StatusCode::NOT_FOUND, e.to_string()),
            UmaOracleError::AlreadyResolved => (StatusCode::CONFLICT, e.to_string()),
            UmaOracleError::PendingAssertionExists => (StatusCode::CONFLICT, e.to_string()),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        })?;

    // Calculate expiration time
    let expiration = chrono::Utc::now() + chrono::Duration::seconds(oracle_config.liveness_seconds as i64);

    Ok(Json(AssertMarketResponse {
        assertion_id,
        market_id,
        outcome_id: req.outcome_id,
        asserter: req.asserter,
        bond_amount: oracle_config.bond_amount.to_string(),
        liveness_seconds: oracle_config.liveness_seconds,
        expiration_time: expiration.to_rfc3339(),
    }))
}

/// Settle a market assertion after liveness period
/// POST /api/v1/markets/:market_id/settle
pub async fn settle_market_assertion(
    State(state): State<Arc<AppState>>,
    Path(market_id): Path<Uuid>,
) -> Result<Json<SettleAssertionResponse>, (StatusCode, String)> {
    let blockchain_client = state.blockchain_client.as_ref().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Blockchain client not configured".to_string(),
        )
    })?;

    // Get pending assertion for this market
    let assertion = sqlx::query!(
        r#"
        SELECT assertion_id
        FROM market_assertions
        WHERE market_id = $1 AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
        "#,
        market_id
    )
    .fetch_optional(&state.db.pool)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or_else(|| (StatusCode::NOT_FOUND, "No pending assertion found".to_string()))?;

    // Create UMA Oracle client
    let oracle_config = UmaOracleConfig {
        oracle_address: state
            .config
            .get_uma_oracle_address()
            .parse()
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Invalid UMA Oracle address".to_string(),
                )
            })?,
        liveness_seconds: state.config.uma_liveness_seconds,
        bond_amount: U256::from_dec_str(&state.config.uma_bond_amount)
            .unwrap_or(U256::from(100_000_000u64)),
        currency: state.config.ctf_usdc_address.parse().unwrap_or_default(),
    };

    let uma_client = UmaOracleClient::new(
        blockchain_client.provider().clone().into(),
        oracle_config,
        state.db.pool.clone(),
    );

    // Settle the assertion
    let result = uma_client
        .settle_assertion(&assertion.assertion_id)
        .await
        .map_err(|e| match e {
            UmaOracleError::NotReadyForSettlement => (StatusCode::PRECONDITION_FAILED, e.to_string()),
            UmaOracleError::AssertionNotFound(_) => (StatusCode::NOT_FOUND, e.to_string()),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        })?;

    let message = if result {
        "Market resolved successfully".to_string()
    } else {
        "Assertion settled as false (disputed)".to_string()
    };

    Ok(Json(SettleAssertionResponse {
        assertion_id: assertion.assertion_id,
        market_id,
        settled: true,
        resolution: result,
        message,
    }))
}

/// Get assertions for a market
/// GET /api/v1/markets/:market_id/assertions
pub async fn get_market_assertions(
    State(state): State<Arc<AppState>>,
    Path(market_id): Path<Uuid>,
) -> Result<Json<MarketAssertionsResponse>, (StatusCode, String)> {
    let blockchain_client = state.blockchain_client.as_ref().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Blockchain client not configured".to_string(),
        )
    })?;

    let oracle_config = UmaOracleConfig {
        oracle_address: state
            .config
            .get_uma_oracle_address()
            .parse()
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Invalid UMA Oracle address".to_string(),
                )
            })?,
        liveness_seconds: state.config.uma_liveness_seconds,
        bond_amount: U256::from_dec_str(&state.config.uma_bond_amount)
            .unwrap_or(U256::from(100_000_000u64)),
        currency: state.config.ctf_usdc_address.parse().unwrap_or_default(),
    };

    let uma_client = UmaOracleClient::new(
        blockchain_client.provider().clone().into(),
        oracle_config,
        state.db.pool.clone(),
    );

    let assertions = uma_client
        .get_market_assertions(market_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(MarketAssertionsResponse {
        market_id,
        assertions,
    }))
}

/// Get assertion details
/// GET /api/v1/assertions/:assertion_id
pub async fn get_assertion_details(
    State(state): State<Arc<AppState>>,
    Path(assertion_id): Path<String>,
) -> Result<Json<AssertionResponse>, (StatusCode, String)> {
    let blockchain_client = state.blockchain_client.as_ref().ok_or_else(|| {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            "Blockchain client not configured".to_string(),
        )
    })?;

    let oracle_config = UmaOracleConfig {
        oracle_address: state
            .config
            .get_uma_oracle_address()
            .parse()
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Invalid UMA Oracle address".to_string(),
                )
            })?,
        liveness_seconds: state.config.uma_liveness_seconds,
        bond_amount: U256::from_dec_str(&state.config.uma_bond_amount)
            .unwrap_or(U256::from(100_000_000u64)),
        currency: state.config.ctf_usdc_address.parse().unwrap_or_default(),
    };

    let uma_client = UmaOracleClient::new(
        blockchain_client.provider().clone().into(),
        oracle_config,
        state.db.pool.clone(),
    );

    let assertion = uma_client
        .get_assertion(&assertion_id)
        .await
        .map_err(|e| match e {
            UmaOracleError::AssertionNotFound(_) => (StatusCode::NOT_FOUND, e.to_string()),
            _ => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        })?;

    let can_settle = uma_client
        .can_settle(&assertion_id)
        .await
        .unwrap_or(false);

    let time_remaining = if assertion.status == AssertionStatus::Pending {
        let now = chrono::Utc::now().timestamp() as u64;
        if assertion.expiration_time > now {
            Some((assertion.expiration_time - now) as i64)
        } else {
            Some(0)
        }
    } else {
        None
    };

    Ok(Json(AssertionResponse {
        assertion,
        can_settle,
        time_remaining_seconds: time_remaining,
    }))
}

/// Get UMA Oracle info
/// GET /api/v1/oracle/uma
pub async fn get_uma_oracle_info(
    State(state): State<Arc<AppState>>,
) -> Result<Json<OracleInfoResponse>, (StatusCode, String)> {
    let blockchain_client = match state.blockchain_client.as_ref() {
        Some(client) => client,
        None => {
            return Ok(Json(OracleInfoResponse {
                oracle_address: String::new(),
                default_liveness_seconds: 0,
                minimum_bond: String::new(),
                currency: String::new(),
                supported: false,
            }));
        }
    };

    let oracle_config = UmaOracleConfig {
        oracle_address: state
            .config
            .get_uma_oracle_address()
            .parse()
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Invalid UMA Oracle address".to_string(),
                )
            })?,
        liveness_seconds: state.config.uma_liveness_seconds,
        bond_amount: U256::from_dec_str(&state.config.uma_bond_amount)
            .unwrap_or(U256::from(100_000_000u64)),
        currency: state.config.ctf_usdc_address.parse().unwrap_or_default(),
    };

    let uma_client = UmaOracleClient::new(
        blockchain_client.provider().clone().into(),
        oracle_config.clone(),
        state.db.pool.clone(),
    );

    // Try to get defaults from chain
    match uma_client.get_defaults().await {
        Ok((liveness, min_bond, currency)) => Ok(Json(OracleInfoResponse {
            oracle_address: format!("{:?}", oracle_config.oracle_address),
            default_liveness_seconds: liveness,
            minimum_bond: min_bond.to_string(),
            currency: format!("{:?}", currency),
            supported: true,
        })),
        Err(_) => Ok(Json(OracleInfoResponse {
            oracle_address: format!("{:?}", oracle_config.oracle_address),
            default_liveness_seconds: oracle_config.liveness_seconds,
            minimum_bond: oracle_config.bond_amount.to_string(),
            currency: format!("{:?}", oracle_config.currency),
            supported: true,
        })),
    }
}
