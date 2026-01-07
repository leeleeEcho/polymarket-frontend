-- Migration 0008: TimescaleDB Setup (OPTIONAL)
-- This migration is skipped if TimescaleDB is not installed
-- For production, install TimescaleDB for better time-series performance

-- Check if TimescaleDB is available, if not just exit gracefully
DO $$
BEGIN
    -- Try to create the extension, skip if not available
    BEGIN
        CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
        RAISE NOTICE 'TimescaleDB extension enabled';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'TimescaleDB not available, skipping time-series optimizations';
        RETURN;
    END;
END $$;

-- The rest of TimescaleDB setup will be handled in a separate optional script
-- For now, create simple regular tables/views for K-lines if TimescaleDB is not available

-- Create a simple klines table for development without TimescaleDB
CREATE TABLE IF NOT EXISTS klines (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(50) NOT NULL,
    period VARCHAR(10) NOT NULL, -- '1m', '5m', '15m', '1h', '4h', '1d', '1w'
    open_time TIMESTAMPTZ NOT NULL,
    open DECIMAL(20,8) NOT NULL,
    high DECIMAL(20,8) NOT NULL,
    low DECIMAL(20,8) NOT NULL,
    close DECIMAL(20,8) NOT NULL,
    volume DECIMAL(20,8) NOT NULL DEFAULT 0,
    quote_volume DECIMAL(20,8) NOT NULL DEFAULT 0,
    trade_count BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (symbol, period, open_time)
);

CREATE INDEX IF NOT EXISTS idx_klines_symbol_period_time ON klines(symbol, period, open_time DESC);
