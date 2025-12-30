-- 修改订单表以支持预测市场
-- 添加 market_id, outcome_id, share_type 字段
-- 移除 symbol, leverage 字段

-- Step 1: 添加新字段
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS market_id UUID,
ADD COLUMN IF NOT EXISTS outcome_id UUID,
ADD COLUMN IF NOT EXISTS share_type share_type;

-- Step 2: 添加外键约束 (暂时允许 NULL，等数据迁移后再设置 NOT NULL)
ALTER TABLE orders
ADD CONSTRAINT fk_orders_market
FOREIGN KEY (market_id) REFERENCES markets(id);

ALTER TABLE orders
ADD CONSTRAINT fk_orders_outcome
FOREIGN KEY (outcome_id) REFERENCES outcomes(id);

-- Step 3: 添加价格范围约束 (预测市场价格必须在 0-1 之间)
-- 注意: 这里只对新订单生效，旧订单可能有超出范围的价格
ALTER TABLE orders
ADD CONSTRAINT chk_orders_price_range
CHECK (
    price IS NULL OR
    (price > 0 AND price < 1)
);

-- Step 4: 创建新索引
CREATE INDEX IF NOT EXISTS idx_orders_market_id ON orders(market_id);
CREATE INDEX IF NOT EXISTS idx_orders_outcome_id ON orders(outcome_id);
CREATE INDEX IF NOT EXISTS idx_orders_share_type ON orders(share_type);

-- 复合索引: 用于按市场/结果查询活跃订单
CREATE INDEX IF NOT EXISTS idx_orders_market_outcome_status
ON orders(market_id, outcome_id, status)
WHERE status IN ('open', 'pending', 'partially_filled');

-- 复合索引: 用于用户查询订单
CREATE INDEX IF NOT EXISTS idx_orders_user_market
ON orders(user_address, market_id, created_at DESC);

-- Step 5: 修改交易表 (trades)
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS market_id UUID,
ADD COLUMN IF NOT EXISTS outcome_id UUID,
ADD COLUMN IF NOT EXISTS share_type share_type,
ADD COLUMN IF NOT EXISTS match_type match_type DEFAULT 'normal';

-- 交易表外键
ALTER TABLE trades
ADD CONSTRAINT fk_trades_market
FOREIGN KEY (market_id) REFERENCES markets(id);

-- 交易表索引
CREATE INDEX IF NOT EXISTS idx_trades_market_id ON trades(market_id);
CREATE INDEX IF NOT EXISTS idx_trades_outcome_id ON trades(outcome_id);
CREATE INDEX IF NOT EXISTS idx_trades_match_type ON trades(match_type);

-- 添加注释
COMMENT ON COLUMN orders.market_id IS '预测市场 ID';
COMMENT ON COLUMN orders.outcome_id IS '结果选项 ID (对应链上 tokenId)';
COMMENT ON COLUMN orders.share_type IS '份额类型: yes 或 no';

COMMENT ON COLUMN trades.market_id IS '预测市场 ID';
COMMENT ON COLUMN trades.outcome_id IS '结果选项 ID';
COMMENT ON COLUMN trades.share_type IS '份额类型';
COMMENT ON COLUMN trades.match_type IS '匹配类型: normal(普通), mint(铸造), merge(合并)';
