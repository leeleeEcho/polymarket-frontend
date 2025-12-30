use axum::{
    body::Body,
    extract::State,
    http::{header, Request, StatusCode},
    middleware::Next,
    response::Response,
};
use std::sync::Arc;

use crate::auth::jwt::JwtManager;
use crate::AppState;

/// User role enum
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UserRole {
    User,
    Admin,
    SuperAdmin,
}

impl UserRole {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "admin" => UserRole::Admin,
            "superadmin" => UserRole::SuperAdmin,
            _ => UserRole::User,
        }
    }

    pub fn is_admin(&self) -> bool {
        matches!(self, UserRole::Admin | UserRole::SuperAdmin)
    }
}

#[derive(Clone)]
pub struct AuthUser {
    pub address: String,
    pub role: UserRole,
}

pub async fn auth_middleware(
    State(state): State<Arc<AppState>>,
    mut request: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    // Check if auth is disabled (development mode)
    if state.config.is_auth_disabled() {
        // Use a default test address when auth is disabled
        // Try to extract address from header if provided, otherwise use default
        let address = request
            .headers()
            .get("X-Test-Address")
            .and_then(|h| h.to_str().ok())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "0x0000000000000000000000000000000000000001".to_string());

        // Check for admin role header in dev mode
        let role = request
            .headers()
            .get("X-Test-Role")
            .and_then(|h| h.to_str().ok())
            .map(UserRole::from_str)
            .unwrap_or(UserRole::User);

        tracing::debug!("Auth disabled - using address: {}, role: {:?}", address, role);
        request.extensions_mut().insert(AuthUser { address, role });
        return Ok(next.run(request).await);
    }

    // Extract token from Authorization header
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok());

    let token = match auth_header {
        Some(header) if header.starts_with("Bearer ") => &header[7..],
        _ => return Err(StatusCode::UNAUTHORIZED),
    };

    // Verify token
    let jwt_manager = JwtManager::new(&state.config.jwt_secret, state.config.jwt_expiry_seconds);
    let claims = jwt_manager
        .verify_token(token)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    let address = claims.sub.to_lowercase();

    // Fetch user role from database
    let role = fetch_user_role(&state.db.pool, &address).await;

    // Insert auth user into request extensions
    request.extensions_mut().insert(AuthUser { address, role });

    Ok(next.run(request).await)
}

/// Admin middleware - requires admin or superadmin role
/// Must be used AFTER auth_middleware in the middleware chain
pub async fn admin_middleware(
    request: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    // Get AuthUser from extensions (set by auth_middleware)
    let auth_user = request
        .extensions()
        .get::<AuthUser>()
        .ok_or(StatusCode::UNAUTHORIZED)?;

    // Check if user has admin role
    if !auth_user.role.is_admin() {
        tracing::warn!(
            "Admin access denied for user: {} (role: {:?})",
            auth_user.address,
            auth_user.role
        );
        return Err(StatusCode::FORBIDDEN);
    }

    tracing::debug!(
        "Admin access granted for user: {} (role: {:?})",
        auth_user.address,
        auth_user.role
    );

    Ok(next.run(request).await)
}

/// Fetch user role from database
async fn fetch_user_role(pool: &sqlx::PgPool, address: &str) -> UserRole {
    let result: Option<(String,)> = sqlx::query_as(
        r#"SELECT role::text FROM users WHERE address = $1"#
    )
    .bind(address)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    match result {
        Some((role_str,)) => UserRole::from_str(&role_str),
        None => UserRole::User,
    }
}
