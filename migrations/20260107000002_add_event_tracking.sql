-- Add tables for on-chain event tracking

-- On-chain trades tracking (from CTFExchange Trade events)
CREATE TABLE IF NOT EXISTS onchain_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_id VARCHAR(78) NOT NULL,
    maker_address VARCHAR(42) NOT NULL,
    taker_address VARCHAR(42) NOT NULL,
    price DECIMAL(20, 8) NOT NULL,
    amount DECIMAL(20, 8) NOT NULL,
    taker_side VARCHAR(10) NOT NULL,
    match_type VARCHAR(10) NOT NULL,
    tx_hash VARCHAR(66) UNIQUE NOT NULL,
    block_number BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onchain_trades_maker ON onchain_trades(maker_address);
CREATE INDEX IF NOT EXISTS idx_onchain_trades_taker ON onchain_trades(taker_address);
CREATE INDEX IF NOT EXISTS idx_onchain_trades_block ON onchain_trades(block_number);
CREATE INDEX IF NOT EXISTS idx_onchain_trades_token ON onchain_trades(token_id);

-- Position changes tracking (from ConditionalTokens Split/Merge events)
CREATE TABLE IF NOT EXISTS position_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(42) NOT NULL,
    condition_id VARCHAR(66) NOT NULL,
    change_type VARCHAR(10) NOT NULL, -- 'mint' or 'burn'
    amount DECIMAL(20, 8) NOT NULL,
    tx_hash VARCHAR(66) NOT NULL,
    block_number BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_position_changes_user ON position_changes(user_address);
CREATE INDEX IF NOT EXISTS idx_position_changes_condition ON position_changes(condition_id);
CREATE INDEX IF NOT EXISTS idx_position_changes_block ON position_changes(block_number);

-- Add condition tracking columns to markets table
ALTER TABLE markets
ADD COLUMN IF NOT EXISTS condition_prepared BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS resolution_tx_hash VARCHAR(66);

-- Event processing state (to track last processed block)
CREATE TABLE IF NOT EXISTS event_processing_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    last_processed_block BIGINT NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO event_processing_state (id, last_processed_block)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE onchain_trades IS 'On-chain trades from CTFExchange Trade events';
COMMENT ON TABLE position_changes IS 'Position mints/burns from ConditionalTokens events';
COMMENT ON TABLE event_processing_state IS 'Tracks last processed block for event listener';
