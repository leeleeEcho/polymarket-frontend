//! Prediction Market K-Line API Handlers
//!
//! Generates OHLC candlestick data from prediction market trades.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Duration, DurationRound, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::AppState;

/// Query parameters for market klines
#[derive(Debug, Deserialize)]
pub struct MarketKlinesQuery {
    /// Outcome ID to get klines for
    pub outcome_id: Uuid,
    /// Share type: "yes" or "no" (default: "yes")
    #[serde(default = "default_share_type")]
    pub share_type: String,
    /// Time period: 1m, 5m, 15m, 1h, 4h, 1d
    #[serde(default = "default_period")]
    pub period: String,
    /// Maximum number of candles (default: 100, max: 500)
    #[serde(default = "default_limit")]
    pub limit: i64,
}

fn default_share_type() -> String {
    "yes".to_string()
}

fn default_period() -> String {
    "1h".to_string()
}

fn default_limit() -> i64 {
    100
}

/// Single candlestick data
#[derive(Debug, Serialize)]
pub struct Candlestick {
    /// Unix timestamp in seconds
    pub time: i64,
    /// Opening price
    pub open: String,
    /// Highest price
    pub high: String,
    /// Lowest price
    pub low: String,
    /// Closing price
    pub close: String,
    /// Volume traded
    pub volume: String,
}

/// Response for market klines
#[derive(Debug, Serialize)]
pub struct MarketKlinesResponse {
    pub market_id: Uuid,
    pub outcome_id: Uuid,
    pub share_type: String,
    pub period: String,
    pub candles: Vec<Candlestick>,
}

/// Error response
#[derive(Debug, Serialize)]
pub struct KlineErrorResponse {
    pub error: String,
    pub code: String,
}

/// Get period duration in seconds
fn get_period_seconds(period: &str) -> Option<i64> {
    match period {
        "1m" => Some(60),
        "5m" => Some(300),
        "15m" => Some(900),
        "30m" => Some(1800),
        "1h" => Some(3600),
        "4h" => Some(14400),
        "1d" => Some(86400),
        _ => None,
    }
}

/// Get K-lines for a prediction market outcome
///
/// GET /markets/:market_id/klines
pub async fn get_market_klines(
    State(state): State<Arc<AppState>>,
    Path(market_id): Path<Uuid>,
    Query(query): Query<MarketKlinesQuery>,
) -> Result<Json<MarketKlinesResponse>, (StatusCode, Json<KlineErrorResponse>)> {
    // Validate period
    let period_seconds = get_period_seconds(&query.period).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(KlineErrorResponse {
                error: "Invalid period. Must be one of: 1m, 5m, 15m, 30m, 1h, 4h, 1d".to_string(),
                code: "INVALID_PERIOD".to_string(),
            }),
        )
    })?;

    // Validate limit
    let limit = query.limit.min(500).max(1);

    // Calculate time range
    let now = Utc::now();
    let start_time = now - Duration::seconds(period_seconds * limit);

    // Query trades and aggregate into candles
    let rows: Vec<(DateTime<Utc>, Decimal, Decimal)> = sqlx::query_as(
        r#"
        SELECT created_at, price, amount
        FROM trades
        WHERE market_id = $1
          AND outcome_id = $2
          AND share_type = $3::share_type
          AND created_at >= $4
        ORDER BY created_at ASC
        "#,
    )
    .bind(market_id)
    .bind(query.outcome_id)
    .bind(&query.share_type)
    .bind(start_time)
    .fetch_all(&state.db.pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch trades for klines: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(KlineErrorResponse {
                error: "Failed to fetch trade data".to_string(),
                code: "DB_ERROR".to_string(),
            }),
        )
    })?;

    // Aggregate trades into candles
    let mut candles: Vec<Candlestick> = Vec::new();
    let duration = Duration::seconds(period_seconds);

    if rows.is_empty() {
        // No trades, return empty or generate default candles based on probability
        // Get current probability as the default price
        let prob: Option<(Decimal,)> = sqlx::query_as(
            "SELECT probability FROM outcomes WHERE id = $1"
        )
        .bind(query.outcome_id)
        .fetch_optional(&state.db.pool)
        .await
        .ok()
        .flatten();

        let default_price = prob.map(|(p,)| p).unwrap_or(Decimal::new(50, 2));
        let price_str = default_price.to_string();

        // Generate empty candles with flat line at current probability
        let mut current_time = start_time.duration_trunc(duration).unwrap_or(start_time);
        while current_time <= now {
            candles.push(Candlestick {
                time: current_time.timestamp(),
                open: price_str.clone(),
                high: price_str.clone(),
                low: price_str.clone(),
                close: price_str.clone(),
                volume: "0".to_string(),
            });
            current_time = current_time + duration;
        }
    } else {
        // Aggregate trades into candles
        let mut current_candle: Option<(i64, Decimal, Decimal, Decimal, Decimal, Decimal)> = None;

        for (trade_time, price, amount) in rows {
            let candle_time = trade_time.duration_trunc(duration)
                .unwrap_or(trade_time)
                .timestamp();

            match &mut current_candle {
                Some((time, open, high, low, close, volume)) if *time == candle_time => {
                    // Update existing candle
                    if price > *high {
                        *high = price;
                    }
                    if price < *low {
                        *low = price;
                    }
                    *close = price;
                    *volume += amount;
                }
                Some((time, open, high, low, close, volume)) => {
                    // Save previous candle and start new one
                    candles.push(Candlestick {
                        time: *time,
                        open: open.to_string(),
                        high: high.to_string(),
                        low: low.to_string(),
                        close: close.to_string(),
                        volume: volume.to_string(),
                    });

                    // Fill gaps with flat candles
                    let prev_close = *close;
                    let mut gap_time = *time + period_seconds;
                    while gap_time < candle_time {
                        candles.push(Candlestick {
                            time: gap_time,
                            open: prev_close.to_string(),
                            high: prev_close.to_string(),
                            low: prev_close.to_string(),
                            close: prev_close.to_string(),
                            volume: "0".to_string(),
                        });
                        gap_time += period_seconds;
                    }

                    current_candle = Some((candle_time, price, price, price, price, amount));
                }
                None => {
                    current_candle = Some((candle_time, price, price, price, price, amount));
                }
            }
        }

        // Don't forget the last candle
        if let Some((time, open, high, low, close, volume)) = current_candle {
            candles.push(Candlestick {
                time,
                open: open.to_string(),
                high: high.to_string(),
                low: low.to_string(),
                close: close.to_string(),
                volume: volume.to_string(),
            });
        }
    }

    Ok(Json(MarketKlinesResponse {
        market_id,
        outcome_id: query.outcome_id,
        share_type: query.share_type,
        period: query.period,
        candles,
    }))
}
