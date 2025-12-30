-- 清理旧字段
-- 注意: 此迁移应在确认所有数据迁移完成后执行
-- 请确保所有订单都已迁移到新的 market_id/outcome_id 结构

-- Step 1: 设置 NOT NULL 约束 (仅在确认所有订单都有这些字段后执行)
-- ALTER TABLE orders ALTER COLUMN market_id SET NOT NULL;
-- ALTER TABLE orders ALTER COLUMN outcome_id SET NOT NULL;
-- ALTER TABLE orders ALTER COLUMN share_type SET NOT NULL;

-- Step 2: 移除旧字段 (谨慎执行，确保不再需要这些字段)
-- 订单表
-- ALTER TABLE orders DROP COLUMN IF EXISTS symbol;
-- ALTER TABLE orders DROP COLUMN IF EXISTS leverage;

-- 交易表
-- ALTER TABLE trades DROP COLUMN IF EXISTS symbol;

-- Step 3: 移除旧索引
-- DROP INDEX IF EXISTS idx_orders_symbol;
-- DROP INDEX IF EXISTS idx_trades_symbol;

-- 创建持仓表 (预测市场简化版)
CREATE TABLE IF NOT EXISTS shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(42) NOT NULL,
    market_id UUID NOT NULL REFERENCES markets(id),
    outcome_id UUID NOT NULL REFERENCES outcomes(id),
    share_type share_type NOT NULL,

    -- 持仓数量
    amount DECIMAL(30, 8) NOT NULL DEFAULT 0,

    -- 平均成本
    avg_cost DECIMAL(30, 8) NOT NULL DEFAULT 0,

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- 约束: 每个用户每个结果只能有一个持仓记录
    UNIQUE(user_address, outcome_id)
);

-- 持仓表索引
CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_address);
CREATE INDEX IF NOT EXISTS idx_shares_market ON shares(market_id);
CREATE INDEX IF NOT EXISTS idx_shares_outcome ON shares(outcome_id);
CREATE INDEX IF NOT EXISTS idx_shares_user_market ON shares(user_address, market_id);

-- 添加注释
COMMENT ON TABLE shares IS '用户份额持仓表 (预测市场)';
COMMENT ON COLUMN shares.amount IS '持有份额数量';
COMMENT ON COLUMN shares.avg_cost IS '平均买入成本';

-- 创建份额变动历史表
CREATE TABLE IF NOT EXISTS share_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_address VARCHAR(42) NOT NULL,
    market_id UUID NOT NULL REFERENCES markets(id),
    outcome_id UUID NOT NULL REFERENCES outcomes(id),
    share_type share_type NOT NULL,

    -- 变动信息
    change_type VARCHAR(20) NOT NULL,  -- 'buy', 'sell', 'mint', 'merge', 'redeem'
    amount DECIMAL(30, 8) NOT NULL,
    price DECIMAL(30, 8) NOT NULL,

    -- 关联
    trade_id UUID,
    order_id UUID,

    -- 时间戳
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 历史表索引
CREATE INDEX IF NOT EXISTS idx_share_changes_user ON share_changes(user_address);
CREATE INDEX IF NOT EXISTS idx_share_changes_market ON share_changes(market_id);
CREATE INDEX IF NOT EXISTS idx_share_changes_created ON share_changes(created_at DESC);

-- TimescaleDB hypertable (如果启用了 TimescaleDB)
-- SELECT create_hypertable('share_changes', 'created_at', if_not_exists => TRUE);

COMMENT ON TABLE share_changes IS '份额变动历史表';
COMMENT ON COLUMN share_changes.change_type IS '变动类型: buy, sell, mint, merge, redeem';
