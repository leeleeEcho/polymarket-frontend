-- 预测市场表结构
-- 创建市场和结果选项表

-- 市场表
CREATE TABLE IF NOT EXISTS markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 链上数据
    condition_id VARCHAR(66) NOT NULL UNIQUE,  -- Gnosis Conditional Tokens conditionId

    -- 市场信息
    question TEXT NOT NULL,
    description TEXT,
    resolution_source VARCHAR(100) NOT NULL DEFAULT 'UMA',

    -- 状态
    status market_status NOT NULL DEFAULT 'active',

    -- 时间
    end_time TIMESTAMPTZ,                    -- 市场结束时间
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,

    -- 解决结果
    winning_outcome_id UUID                   -- 获胜结果 (resolved 时设置)
);

-- 结果选项表
CREATE TABLE IF NOT EXISTS outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,

    -- 链上数据
    token_id VARCHAR(78) NOT NULL,           -- ERC-1155 token ID

    -- 结果信息
    name VARCHAR(50) NOT NULL,               -- "Yes" / "No"
    share_type share_type NOT NULL,

    -- 互补关系
    complement_id UUID,                       -- 互补结果 ID

    -- 约束: 每个市场只能有一个 Yes 和一个 No
    UNIQUE(market_id, share_type)
);

-- 添加互补关系外键
ALTER TABLE outcomes
ADD CONSTRAINT fk_outcome_complement
FOREIGN KEY (complement_id) REFERENCES outcomes(id);

-- 添加市场获胜结果外键
ALTER TABLE markets
ADD CONSTRAINT fk_market_winning_outcome
FOREIGN KEY (winning_outcome_id) REFERENCES outcomes(id);

-- 索引
CREATE INDEX IF NOT EXISTS idx_markets_status ON markets(status);
CREATE INDEX IF NOT EXISTS idx_markets_condition_id ON markets(condition_id);
CREATE INDEX IF NOT EXISTS idx_markets_end_time ON markets(end_time) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_markets_created_at ON markets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outcomes_market_id ON outcomes(market_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_token_id ON outcomes(token_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_share_type ON outcomes(market_id, share_type);

-- 添加表注释
COMMENT ON TABLE markets IS '预测市场表';
COMMENT ON COLUMN markets.condition_id IS 'Gnosis Conditional Tokens 的 conditionId';
COMMENT ON COLUMN markets.question IS '市场问题，例如: Will BTC reach $100k by end of 2025?';
COMMENT ON COLUMN markets.resolution_source IS '解决来源: UMA, Chainlink, Manual 等';
COMMENT ON COLUMN markets.end_time IS '市场结束时间，之后不能再交易';
COMMENT ON COLUMN markets.winning_outcome_id IS '市场解决后的获胜结果 ID';

COMMENT ON TABLE outcomes IS '市场结果选项表';
COMMENT ON COLUMN outcomes.token_id IS 'ERC-1155 代币 ID';
COMMENT ON COLUMN outcomes.share_type IS '份额类型: yes 或 no';
COMMENT ON COLUMN outcomes.complement_id IS '互补结果 ID (Yes 对应 No)';
