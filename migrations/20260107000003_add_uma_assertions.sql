-- Add UMA Optimistic Oracle assertions table for market resolution

-- Add pending_resolution status to market_status enum
DO $$ BEGIN
    ALTER TYPE market_status ADD VALUE IF NOT EXISTS 'pending_resolution' BEFORE 'resolved';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS market_assertions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id UUID NOT NULL REFERENCES markets(id),
    assertion_id VARCHAR(66) NOT NULL UNIQUE,
    outcome_id UUID NOT NULL REFERENCES outcomes(id),
    claim TEXT NOT NULL,
    asserter VARCHAR(42) NOT NULL,
    assertion_time TIMESTAMP WITH TIME ZONE NOT NULL,
    expiration_time TIMESTAMP WITH TIME ZONE NOT NULL,
    bond_amount VARCHAR(78) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    tx_hash VARCHAR(66),
    settlement_tx_hash VARCHAR(66),
    settled_at TIMESTAMP WITH TIME ZONE,
    disputed_at TIMESTAMP WITH TIME ZONE,
    disputer VARCHAR(42),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_market_assertions_market ON market_assertions(market_id);
CREATE INDEX IF NOT EXISTS idx_market_assertions_status ON market_assertions(status);
CREATE INDEX IF NOT EXISTS idx_market_assertions_expiration ON market_assertions(expiration_time);
CREATE INDEX IF NOT EXISTS idx_market_assertions_asserter ON market_assertions(asserter);

-- Add pending_resolution status to markets
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS resolution_assertion_id VARCHAR(66);

-- Comments
COMMENT ON TABLE market_assertions IS 'UMA Optimistic Oracle assertions for market resolution';
COMMENT ON COLUMN market_assertions.assertion_id IS 'UMA OOV3 assertion ID (bytes32 hex)';
COMMENT ON COLUMN market_assertions.status IS 'pending, disputed, settled_true, settled_false';
COMMENT ON COLUMN market_assertions.bond_amount IS 'Bond amount in USDC (6 decimals)';
