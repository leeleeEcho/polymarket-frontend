//! 预测市场订单模型
//!
//! 订单相关的数据结构，包括订单实体、创建请求和响应。

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::fmt;
use uuid::Uuid;

use super::market::ShareType;

/// 序列化 DateTime 为毫秒时间戳
mod datetime_as_millis {
    use chrono::{DateTime, Utc};
    use serde::Serializer;

    pub fn serialize<S>(dt: &DateTime<Utc>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_i64(dt.timestamp_millis())
    }
}

/// 可选 DateTime 序列化为毫秒时间戳
#[allow(dead_code)]
mod option_datetime_as_millis {
    use chrono::{DateTime, Utc};
    use serde::Serializer;

    pub fn serialize<S>(dt: &Option<DateTime<Utc>>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match dt {
            Some(dt) => serializer.serialize_some(&dt.timestamp_millis()),
            None => serializer.serialize_none(),
        }
    }
}

/// 订单方向
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "order_side", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum OrderSide {
    /// 买入份额
    Buy,
    /// 卖出份额
    Sell,
}

impl OrderSide {
    /// 获取相反方向
    pub fn opposite(&self) -> Self {
        match self {
            OrderSide::Buy => OrderSide::Sell,
            OrderSide::Sell => OrderSide::Buy,
        }
    }
}

impl fmt::Display for OrderSide {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            OrderSide::Buy => write!(f, "buy"),
            OrderSide::Sell => write!(f, "sell"),
        }
    }
}

impl std::str::FromStr for OrderSide {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "buy" => Ok(OrderSide::Buy),
            "sell" => Ok(OrderSide::Sell),
            _ => Err(format!("Invalid order side: {}", s)),
        }
    }
}

/// 订单类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "order_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum OrderType {
    /// 限价单 - 指定价格
    Limit,
    /// 市价单 - 最优价格成交
    Market,
}

impl fmt::Display for OrderType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            OrderType::Limit => write!(f, "limit"),
            OrderType::Market => write!(f, "market"),
        }
    }
}

impl std::str::FromStr for OrderType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "limit" => Ok(OrderType::Limit),
            "market" => Ok(OrderType::Market),
            _ => Err(format!("Invalid order type: {}", s)),
        }
    }
}

/// 订单状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "order_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum OrderStatus {
    /// 等待中
    Pending,
    /// 挂单中
    Open,
    /// 部分成交
    PartiallyFilled,
    /// 完全成交
    Filled,
    /// 已取消
    Cancelled,
    /// 已拒绝
    Rejected,
}

impl OrderStatus {
    /// 检查订单是否处于活动状态
    pub fn is_active(&self) -> bool {
        matches!(self, OrderStatus::Pending | OrderStatus::Open | OrderStatus::PartiallyFilled)
    }

    /// 检查订单是否已结束
    pub fn is_final(&self) -> bool {
        matches!(self, OrderStatus::Filled | OrderStatus::Cancelled | OrderStatus::Rejected)
    }
}

impl fmt::Display for OrderStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            OrderStatus::Pending => "pending",
            OrderStatus::Open => "open",
            OrderStatus::PartiallyFilled => "partially_filled",
            OrderStatus::Filled => "filled",
            OrderStatus::Cancelled => "cancelled",
            OrderStatus::Rejected => "rejected",
        };
        write!(f, "{}", s)
    }
}

/// 预测市场订单
///
/// 表示用户在预测市场中的一个订单
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Order {
    /// 订单唯一 ID
    pub id: Uuid,

    /// 用户钱包地址
    pub user_address: String,

    /// 市场 ID
    pub market_id: Uuid,

    /// 结果 ID (对应链上的 tokenId)
    pub outcome_id: Uuid,

    /// 份额类型 (Yes/No)
    pub share_type: ShareType,

    /// 订单方向 (Buy/Sell)
    pub side: OrderSide,

    /// 订单类型 (Limit/Market)
    pub order_type: OrderType,

    /// 概率价格 (0.01 - 0.99)
    /// 对于限价单，这是用户指定的价格
    /// 对于市价单，这是成交后的平均价格
    pub price: Decimal,

    /// 订单份额数量
    pub amount: Decimal,

    /// 已成交份额数量
    pub filled_amount: Decimal,

    /// 订单状态
    pub status: OrderStatus,

    /// EIP-712 签名
    pub signature: String,

    /// 创建时间
    #[serde(serialize_with = "datetime_as_millis::serialize")]
    pub created_at: DateTime<Utc>,

    /// 更新时间
    #[serde(serialize_with = "datetime_as_millis::serialize")]
    pub updated_at: DateTime<Utc>,
}

impl Order {
    /// 获取剩余未成交数量
    pub fn remaining_amount(&self) -> Decimal {
        self.amount - self.filled_amount
    }

    /// 检查价格是否有效 (0 < price < 1)
    pub fn is_valid_price(&self) -> bool {
        self.price > Decimal::ZERO && self.price < Decimal::ONE
    }

    /// 计算互补价格
    /// Yes 价格 + No 价格 = 1
    pub fn complement_price(&self) -> Decimal {
        Decimal::ONE - self.price
    }

    /// 计算订单价值 (USDC)
    /// 买单: amount * price
    /// 卖单: amount * price (卖出份额获得的 USDC)
    pub fn order_value(&self) -> Decimal {
        self.amount * self.price
    }

    /// 计算买入订单所需的 USDC
    pub fn required_collateral(&self) -> Decimal {
        match self.side {
            OrderSide::Buy => self.remaining_amount() * self.price,
            OrderSide::Sell => Decimal::ZERO, // 卖单不需要 USDC，需要份额
        }
    }

    /// 检查订单是否可以取消
    pub fn is_cancellable(&self) -> bool {
        self.status.is_active() && self.remaining_amount() > Decimal::ZERO
    }
}

/// 订单验证错误
#[allow(dead_code)]
#[derive(Debug, Clone, thiserror::Error)]
pub enum OrderValidationError {
    #[error("Invalid price: {0}")]
    InvalidPrice(String),

    #[error("Invalid amount: {0}")]
    InvalidAmount(String),

    #[error("Invalid market: {0}")]
    InvalidMarket(String),

    #[error("Invalid signature: {0}")]
    InvalidSignature(String),

    #[error("Insufficient balance: {0}")]
    InsufficientBalance(String),
}

/// 创建订单请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateOrderRequest {
    /// 市场 ID
    pub market_id: Uuid,

    /// 结果 ID
    pub outcome_id: Uuid,

    /// 份额类型
    pub share_type: ShareType,

    /// 订单方向
    pub side: OrderSide,

    /// 订单类型
    pub order_type: OrderType,

    /// 概率价格 (0.01 - 0.99)
    pub price: Decimal,

    /// 订单数量 (份额)
    pub amount: Decimal,

    /// EIP-712 签名
    pub signature: String,

    /// 签名时间戳 (毫秒)
    pub timestamp: u64,
}

#[allow(dead_code)]
impl CreateOrderRequest {
    /// 最小价格
    pub const MIN_PRICE: &'static str = "0.01";
    /// 最大价格
    pub const MAX_PRICE: &'static str = "0.99";
    /// 最小订单价值 (USDC)
    pub const MIN_ORDER_VALUE: &'static str = "1.0";

    /// 验证请求
    pub fn validate(&self) -> Result<(), OrderValidationError> {
        let min_price = Decimal::from_str_exact(Self::MIN_PRICE).unwrap();
        let max_price = Decimal::from_str_exact(Self::MAX_PRICE).unwrap();
        let min_value = Decimal::from_str_exact(Self::MIN_ORDER_VALUE).unwrap();

        // 价格范围检查
        if self.price < min_price || self.price > max_price {
            return Err(OrderValidationError::InvalidPrice(format!(
                "Price must be between {} and {}, got {}",
                Self::MIN_PRICE,
                Self::MAX_PRICE,
                self.price
            )));
        }

        // 数量检查
        if self.amount <= Decimal::ZERO {
            return Err(OrderValidationError::InvalidAmount(
                "Amount must be positive".to_string(),
            ));
        }

        // 最小订单价值检查
        let order_value = self.amount * self.price;
        if order_value < min_value {
            return Err(OrderValidationError::InvalidAmount(format!(
                "Order value must be at least ${}, got ${}",
                Self::MIN_ORDER_VALUE,
                order_value
            )));
        }

        Ok(())
    }

    /// 计算所需抵押品 (USDC)
    pub fn required_collateral(&self) -> Decimal {
        match self.side {
            OrderSide::Buy => self.amount * self.price,
            OrderSide::Sell => Decimal::ZERO,
        }
    }
}

/// 订单响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderResponse {
    /// 订单 ID
    pub order_id: Uuid,

    /// 市场 ID
    pub market_id: Uuid,

    /// 结果 ID
    pub outcome_id: Uuid,

    /// 份额类型
    pub share_type: ShareType,

    /// 订单方向
    pub side: OrderSide,

    /// 订单类型
    pub order_type: OrderType,

    /// 概率价格
    pub price: Decimal,

    /// 订单数量
    pub amount: Decimal,

    /// 已成交数量
    pub filled_amount: Decimal,

    /// 剩余数量
    pub remaining_amount: Decimal,

    /// 订单状态
    pub status: OrderStatus,

    /// 创建时间
    #[serde(serialize_with = "datetime_as_millis::serialize")]
    pub created_at: DateTime<Utc>,
}

impl From<Order> for OrderResponse {
    fn from(order: Order) -> Self {
        Self {
            order_id: order.id,
            market_id: order.market_id,
            outcome_id: order.outcome_id,
            share_type: order.share_type,
            side: order.side,
            order_type: order.order_type,
            price: order.price,
            amount: order.amount,
            filled_amount: order.filled_amount,
            remaining_amount: order.remaining_amount(),
            status: order.status,
            created_at: order.created_at,
        }
    }
}

/// 取消订单请求
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelOrderRequest {
    /// 订单 ID
    pub order_id: Uuid,

    /// EIP-712 签名
    pub signature: String,

    /// 签名时间戳
    pub timestamp: u64,
}

/// 订单列表查询参数
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OrderListQuery {
    /// 市场 ID 过滤
    pub market_id: Option<Uuid>,

    /// 份额类型过滤
    pub share_type: Option<ShareType>,

    /// 订单方向过滤
    pub side: Option<OrderSide>,

    /// 订单状态过滤
    pub status: Option<OrderStatus>,

    /// 分页: 页码
    pub page: Option<u32>,

    /// 分页: 每页数量
    pub limit: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    #[test]
    fn test_order_side_opposite() {
        assert_eq!(OrderSide::Buy.opposite(), OrderSide::Sell);
        assert_eq!(OrderSide::Sell.opposite(), OrderSide::Buy);
    }

    #[test]
    fn test_order_status_is_active() {
        assert!(OrderStatus::Pending.is_active());
        assert!(OrderStatus::Open.is_active());
        assert!(OrderStatus::PartiallyFilled.is_active());
        assert!(!OrderStatus::Filled.is_active());
        assert!(!OrderStatus::Cancelled.is_active());
        assert!(!OrderStatus::Rejected.is_active());
    }

    #[test]
    fn test_order_remaining_amount() {
        let order = Order {
            id: Uuid::new_v4(),
            user_address: "0x123".to_string(),
            market_id: Uuid::new_v4(),
            outcome_id: Uuid::new_v4(),
            share_type: ShareType::Yes,
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            price: dec!(0.65),
            amount: dec!(100),
            filled_amount: dec!(30),
            status: OrderStatus::PartiallyFilled,
            signature: "0x".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert_eq!(order.remaining_amount(), dec!(70));
    }

    #[test]
    fn test_order_complement_price() {
        let order = Order {
            id: Uuid::new_v4(),
            user_address: "0x123".to_string(),
            market_id: Uuid::new_v4(),
            outcome_id: Uuid::new_v4(),
            share_type: ShareType::Yes,
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            price: dec!(0.65),
            amount: dec!(100),
            filled_amount: dec!(0),
            status: OrderStatus::Open,
            signature: "0x".to_string(),
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert_eq!(order.complement_price(), dec!(0.35));
    }

    #[test]
    fn test_create_order_request_validation() {
        // Valid request
        let valid_req = CreateOrderRequest {
            market_id: Uuid::new_v4(),
            outcome_id: Uuid::new_v4(),
            share_type: ShareType::Yes,
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            price: dec!(0.65),
            amount: dec!(10),
            signature: "0x".to_string(),
            timestamp: 1704067200000,
        };
        assert!(valid_req.validate().is_ok());

        // Invalid price (too low)
        let low_price_req = CreateOrderRequest {
            price: dec!(0.001),
            ..valid_req.clone()
        };
        assert!(low_price_req.validate().is_err());

        // Invalid price (too high)
        let high_price_req = CreateOrderRequest {
            price: dec!(0.999),
            ..valid_req.clone()
        };
        assert!(high_price_req.validate().is_err());

        // Invalid amount (zero)
        let zero_amount_req = CreateOrderRequest {
            amount: dec!(0),
            ..valid_req.clone()
        };
        assert!(zero_amount_req.validate().is_err());

        // Invalid order value (too small)
        let small_value_req = CreateOrderRequest {
            price: dec!(0.10),
            amount: dec!(5), // 0.10 * 5 = 0.5 < 1.0
            ..valid_req
        };
        assert!(small_value_req.validate().is_err());
    }
}
