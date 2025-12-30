-- 预测市场类型定义
-- 创建预测市场所需的枚举类型

-- 份额类型: Yes/No
DO $$ BEGIN
    CREATE TYPE share_type AS ENUM ('yes', 'no');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 市场状态
DO $$ BEGIN
    CREATE TYPE market_status AS ENUM ('active', 'paused', 'resolved', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 匹配类型: Normal/Mint/Merge
DO $$ BEGIN
    CREATE TYPE match_type AS ENUM ('normal', 'mint', 'merge');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 添加注释
COMMENT ON TYPE share_type IS '预测市场份额类型: Yes(事件发生) / No(事件不发生)';
COMMENT ON TYPE market_status IS '市场状态: active(活跃), paused(暂停), resolved(已解决), cancelled(已取消)';
COMMENT ON TYPE match_type IS '匹配类型: normal(普通), mint(铸造), merge(合并)';
