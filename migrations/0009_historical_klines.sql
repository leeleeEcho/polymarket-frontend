-- Migration 0009: Historical K-lines Table
-- Creates a table for storing imported historical K-line data directly
-- Works without TimescaleDB for development

-- =============================================================================
-- Step 1: Create Historical K-lines Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS klines_historical (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    period VARCHAR(5) NOT NULL,  -- 1m, 5m, 15m, 1h, 4h, 1d, 1w, 1M
    open_time TIMESTAMPTZ NOT NULL,
    open DECIMAL(30, 10) NOT NULL,
    high DECIMAL(30, 10) NOT NULL,
    low DECIMAL(30, 10) NOT NULL,
    close DECIMAL(30, 10) NOT NULL,
    volume DECIMAL(30, 10) NOT NULL DEFAULT 0,
    quote_volume DECIMAL(30, 10) DEFAULT 0,
    trade_count INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Step 2: Create Unique Index for Upsert Operations
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_klines_historical_unique
ON klines_historical (symbol, period, open_time);

CREATE INDEX IF NOT EXISTS idx_klines_historical_symbol_period_time
ON klines_historical (symbol, period, open_time DESC);

-- =============================================================================
-- Step 3: Helper Function to Get Historical K-lines
-- =============================================================================

CREATE OR REPLACE FUNCTION get_historical_klines(
    p_symbol VARCHAR,
    p_period VARCHAR,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_limit INT DEFAULT 500
)
RETURNS TABLE (
    symbol VARCHAR,
    open_time TIMESTAMPTZ,
    open DECIMAL,
    high DECIMAL,
    low DECIMAL,
    close DECIMAL,
    volume DECIMAL,
    quote_volume DECIMAL,
    trade_count INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        kh.symbol,
        kh.open_time,
        kh.open,
        kh.high,
        kh.low,
        kh.close,
        kh.volume,
        kh.quote_volume,
        kh.trade_count
    FROM klines_historical kh
    WHERE kh.symbol = p_symbol
      AND kh.period = p_period
      AND kh.open_time >= p_start_time
      AND kh.open_time < p_end_time
    ORDER BY kh.open_time DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Step 4: Function to Upsert K-line Data
-- =============================================================================

CREATE OR REPLACE FUNCTION upsert_kline(
    p_symbol VARCHAR,
    p_period VARCHAR,
    p_open_time TIMESTAMPTZ,
    p_open DECIMAL,
    p_high DECIMAL,
    p_low DECIMAL,
    p_close DECIMAL,
    p_volume DECIMAL,
    p_quote_volume DECIMAL,
    p_trade_count INT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO klines_historical (
        symbol, period, open_time, open, high, low, close, volume, quote_volume, trade_count
    ) VALUES (
        p_symbol, p_period, p_open_time, p_open, p_high, p_low, p_close, p_volume, p_quote_volume, p_trade_count
    )
    ON CONFLICT (symbol, period, open_time)
    DO UPDATE SET
        open = EXCLUDED.open,
        high = EXCLUDED.high,
        low = EXCLUDED.low,
        close = EXCLUDED.close,
        volume = EXCLUDED.volume,
        quote_volume = EXCLUDED.quote_volume,
        trade_count = EXCLUDED.trade_count;
END;
$$ LANGUAGE plpgsql;
