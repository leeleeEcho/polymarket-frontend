//! 预测市场和结果相关模型
//!
//! 定义预测市场的核心数据结构，包括市场、结果选项和份额类型。

#![allow(dead_code)]

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

/// 份额类型
///
/// 预测市场中的两种结果份额：Yes 和 No
/// Yes + No 的价格总和始终等于 1
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "share_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ShareType {
    /// Yes 份额 - 预测事件会发生
    Yes,
    /// No 份额 - 预测事件不会发生
    No,
}

impl ShareType {
    /// 获取互补份额类型
    ///
    /// Yes 的互补是 No，No 的互补是 Yes
    pub fn complement(&self) -> ShareType {
        match self {
            ShareType::Yes => ShareType::No,
            ShareType::No => ShareType::Yes,
        }
    }

    /// 转换为字符串
    pub fn as_str(&self) -> &'static str {
        match self {
            ShareType::Yes => "yes",
            ShareType::No => "no",
        }
    }
}

impl std::fmt::Display for ShareType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for ShareType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "yes" => Ok(ShareType::Yes),
            "no" => Ok(ShareType::No),
            _ => Err(format!("Invalid share type: {}", s)),
        }
    }
}

/// 市场状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "market_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum MarketStatus {
    /// 活跃状态 - 可以交易
    Active,
    /// 暂停状态 - 暂时停止交易
    Paused,
    /// 已解决 - 结果已确定，等待结算
    Resolved,
    /// 已取消 - 市场被取消
    Cancelled,
}

impl MarketStatus {
    /// 检查市场是否可交易
    pub fn is_tradable(&self) -> bool {
        matches!(self, MarketStatus::Active)
    }

    /// 检查市场是否已结束
    pub fn is_finalized(&self) -> bool {
        matches!(self, MarketStatus::Resolved | MarketStatus::Cancelled)
    }
}

impl std::fmt::Display for MarketStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            MarketStatus::Active => "active",
            MarketStatus::Paused => "paused",
            MarketStatus::Resolved => "resolved",
            MarketStatus::Cancelled => "cancelled",
        };
        write!(f, "{}", s)
    }
}

/// 预测市场
///
/// 代表一个预测市场，包含市场问题、状态和解决信息
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Market {
    /// 市场唯一 ID
    pub id: Uuid,

    /// 链上 conditionId (Gnosis Conditional Tokens)
    pub condition_id: String,

    /// 市场问题 (例如: "Will BTC reach $100k by end of 2025?")
    pub question: String,

    /// 市场描述
    pub description: Option<String>,

    /// 解决来源 (例如: "UMA", "Chainlink", "Manual")
    pub resolution_source: String,

    /// 市场状态
    pub status: MarketStatus,

    /// 结束时间 (市场何时停止交易)
    pub end_time: Option<DateTime<Utc>>,

    /// 创建时间
    pub created_at: DateTime<Utc>,

    /// 解决时间
    pub resolved_at: Option<DateTime<Utc>>,

    /// 获胜结果 ID (市场解决后设置)
    pub winning_outcome_id: Option<Uuid>,
}

impl Market {
    /// 检查市场是否可以交易
    pub fn can_trade(&self) -> bool {
        if !self.status.is_tradable() {
            return false;
        }

        // 如果设置了结束时间，检查是否已过期
        if let Some(end_time) = self.end_time {
            if Utc::now() >= end_time {
                return false;
            }
        }

        true
    }

    /// 检查市场是否已结束
    pub fn is_ended(&self) -> bool {
        self.status.is_finalized()
    }
}

/// 市场结果选项
///
/// 代表市场中的一个结果选项 (Yes 或 No)
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Outcome {
    /// 结果唯一 ID
    pub id: Uuid,

    /// 所属市场 ID
    pub market_id: Uuid,

    /// 链上 tokenId (ERC-1155 token ID)
    pub token_id: String,

    /// 结果名称 (例如: "Yes", "No")
    pub name: String,

    /// 份额类型
    pub share_type: ShareType,

    /// 互补结果 ID
    pub complement_id: Option<Uuid>,
}

impl Outcome {
    /// 获取互补份额类型
    pub fn complement_share_type(&self) -> ShareType {
        self.share_type.complement()
    }
}

/// 市场摘要信息 (用于列表展示)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketSummary {
    /// 市场 ID
    pub id: Uuid,

    /// 市场问题
    pub question: String,

    /// 市场状态
    pub status: MarketStatus,

    /// Yes 份额最新价格
    pub yes_price: Decimal,

    /// No 份额最新价格
    pub no_price: Decimal,

    /// 24 小时交易量 (USDC)
    pub volume_24h: Decimal,

    /// 总流动性 (USDC)
    pub liquidity: Decimal,

    /// 结束时间
    pub end_time: Option<DateTime<Utc>>,
}

/// 市场详情 (包含结果选项)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketDetail {
    /// 市场信息
    #[serde(flatten)]
    pub market: Market,

    /// Yes 结果选项
    pub yes_outcome: Outcome,

    /// No 结果选项
    pub no_outcome: Outcome,

    /// Yes 份额最新价格
    pub yes_price: Decimal,

    /// No 份额最新价格
    pub no_price: Decimal,

    /// 24 小时交易量
    pub volume_24h: Decimal,

    /// 总流动性
    pub liquidity: Decimal,
}

/// 创建市场请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMarketRequest {
    /// 链上 conditionId
    pub condition_id: String,

    /// 市场问题
    pub question: String,

    /// 市场描述
    pub description: Option<String>,

    /// 解决来源
    pub resolution_source: String,

    /// 结束时间
    pub end_time: Option<DateTime<Utc>>,

    /// Yes 结果的 tokenId
    pub yes_token_id: String,

    /// No 结果的 tokenId
    pub no_token_id: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_share_type_complement() {
        assert_eq!(ShareType::Yes.complement(), ShareType::No);
        assert_eq!(ShareType::No.complement(), ShareType::Yes);
    }

    #[test]
    fn test_share_type_from_str() {
        assert_eq!("yes".parse::<ShareType>().unwrap(), ShareType::Yes);
        assert_eq!("YES".parse::<ShareType>().unwrap(), ShareType::Yes);
        assert_eq!("no".parse::<ShareType>().unwrap(), ShareType::No);
        assert_eq!("No".parse::<ShareType>().unwrap(), ShareType::No);
        assert!("invalid".parse::<ShareType>().is_err());
    }

    #[test]
    fn test_market_status_tradable() {
        assert!(MarketStatus::Active.is_tradable());
        assert!(!MarketStatus::Paused.is_tradable());
        assert!(!MarketStatus::Resolved.is_tradable());
        assert!(!MarketStatus::Cancelled.is_tradable());
    }

    #[test]
    fn test_market_status_finalized() {
        assert!(!MarketStatus::Active.is_finalized());
        assert!(!MarketStatus::Paused.is_finalized());
        assert!(MarketStatus::Resolved.is_finalized());
        assert!(MarketStatus::Cancelled.is_finalized());
    }
}
