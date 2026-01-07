-- Add on-chain settlement columns to trades table
-- For Polymarket-style settlement where trades are settled on CTFExchange

-- Settlement status enum
DO $$ BEGIN
    CREATE TYPE settlement_status AS ENUM ('pending', 'submitted', 'confirmed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add settlement columns to trades table
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS settlement_tx_hash VARCHAR(66),
ADD COLUMN IF NOT EXISTS settlement_status settlement_status DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS settlement_block BIGINT,
ADD COLUMN IF NOT EXISTS settlement_error TEXT,
ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP WITH TIME ZONE;

-- Create index for settlement status queries
CREATE INDEX IF NOT EXISTS idx_trades_settlement_status ON trades(settlement_status);
CREATE INDEX IF NOT EXISTS idx_trades_settlement_tx_hash ON trades(settlement_tx_hash);

-- Add signature columns to orders table for on-chain settlement
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS signature TEXT,
ADD COLUMN IF NOT EXISTS token_id VARCHAR(78),
ADD COLUMN IF NOT EXISTS maker_amount VARCHAR(78),
ADD COLUMN IF NOT EXISTS taker_amount VARCHAR(78),
ADD COLUMN IF NOT EXISTS expiration BIGINT,
ADD COLUMN IF NOT EXISTS fee_rate_bps INTEGER DEFAULT 200,
ADD COLUMN IF NOT EXISTS sig_type SMALLINT DEFAULT 0;

COMMENT ON COLUMN trades.settlement_tx_hash IS 'Transaction hash of on-chain settlement';
COMMENT ON COLUMN trades.settlement_status IS 'Status of on-chain settlement';
COMMENT ON COLUMN trades.settlement_block IS 'Block number where trade was settled';
COMMENT ON COLUMN trades.settlement_error IS 'Error message if settlement failed';
COMMENT ON COLUMN orders.signature IS 'EIP-712 signature from user';
COMMENT ON COLUMN orders.token_id IS 'CTF position token ID';
COMMENT ON COLUMN orders.maker_amount IS 'Amount maker is giving';
COMMENT ON COLUMN orders.taker_amount IS 'Amount maker wants to receive';
