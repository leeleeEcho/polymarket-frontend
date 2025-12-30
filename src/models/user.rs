#![allow(dead_code)]
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub address: String,
    pub nonce: i64,
    pub referral_code: Option<String>,
    pub referrer_address: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateUser {
    pub address: String,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct UserProfile {
    pub address: String,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<User> for UserProfile {
    fn from(user: User) -> Self {
        Self {
            address: user.address,
            username: None,
            avatar_url: None,
            created_at: user.created_at,
            updated_at: user.updated_at,
        }
    }
}
