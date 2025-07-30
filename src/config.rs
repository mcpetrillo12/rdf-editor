use serde::Deserialize;
use std::env;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("Missing required environment variable: {0}")]
    MissingEnvVar(String),
    
    #[error("Invalid port number: {0}")]
    InvalidPort(String),
    
    #[error("Invalid boolean value for {0}: {1}")]
    InvalidBool(String, String),
    
    #[error("Invalid number value for {0}: {1}")]
    InvalidNumber(String, String),
}

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    // Core SPARQL configuration
    pub sparql_endpoint: String,
    pub sparql_update_endpoint: Option<String>,
    pub sparql_username: Option<String>,
    pub sparql_password: Option<String>,
    pub sparql_password_hashed: Option<String>,
    
    // Server configuration
    pub host: String,
    pub port: u16,
    pub cors_enabled: bool,
    pub max_payload_size: usize,
    
    // Connection settings
    pub verify_ssl: bool,
    pub timeout_seconds: u64,
    pub max_retries: u32,
    
    // Cache configuration
    pub cache_enabled: bool,
    pub cache_ttl_seconds: u64,
    pub cache_max_entries: usize,
    
    // Security configuration
    pub enable_auth: bool,
    pub api_key: Option<String>,
    pub allowed_origins: Vec<String>,
    
    // Graph visualization settings
    pub graph_max_nodes: usize,
    pub graph_max_edges: usize,
    pub graph_expansion_limit: usize,
    pub graph_search_limit: usize,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        // Load .env file if it exists
        dotenv::dotenv().ok();
        
        // Required SPARQL endpoint
        let sparql_endpoint = env::var("SPARQL_ENDPOINT")
            .map_err(|_| ConfigError::MissingEnvVar("SPARQL_ENDPOINT".to_string()))?;
        
        // Try to get update endpoint, otherwise derive it from the query endpoint
        let sparql_update_endpoint = env::var("SPARQL_UPDATE_ENDPOINT")
            .ok()
            .or_else(|| {
                // If not specified, try to derive it from the query endpoint
                // For Stardog URLs like http://localhost:5820/myDB/query
                // Convert to http://localhost:5820/myDB/update
                if sparql_endpoint.ends_with("/query") {
                    let base = sparql_endpoint.trim_end_matches("/query");
                    Some(format!("{}/update", base))
                } else {
                    None
                }
            });
        
        // Authentication
        let sparql_username = env::var("SPARQL_USERNAME").ok();
        let sparql_password = env::var("SPARQL_PASSWORD").ok();
        let sparql_password_hashed = env::var("SPARQL_PASSWORD_HASHED").ok();
        
        // Validate that we have either password or password_hashed if username is provided
        if sparql_username.is_some() && sparql_password.is_none() && sparql_password_hashed.is_none() {
            return Err(ConfigError::MissingEnvVar(
                "SPARQL_PASSWORD or SPARQL_PASSWORD_HASHED (when USERNAME is set)".to_string()
            ));
        }
        
        // Server settings
        let host = env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
        let port = env::var("PORT")
            .unwrap_or_else(|_| "8080".to_string())
            .parse::<u16>()
            .map_err(|_| ConfigError::InvalidPort(env::var("PORT").unwrap_or_default()))?;
        
        let cors_enabled = env::var("CORS_ENABLED")
            .unwrap_or_else(|_| "true".to_string())
            .parse::<bool>()
            .map_err(|_| ConfigError::InvalidBool(
                "CORS_ENABLED".to_string(),
                env::var("CORS_ENABLED").unwrap_or_default()
            ))?;
        
        let max_payload_size = env::var("MAX_PAYLOAD_SIZE")
            .unwrap_or_else(|_| "10485760".to_string()) // 10MB default
            .parse::<usize>()
            .unwrap_or(10_485_760);
        
        // Connection settings
        let verify_ssl = env::var("VERIFY_SSL")
            .unwrap_or_else(|_| "true".to_string())
            .parse::<bool>()
            .map_err(|_| ConfigError::InvalidBool(
                "VERIFY_SSL".to_string(),
                env::var("VERIFY_SSL").unwrap_or_default()
            ))?;
        
        let timeout_seconds = env::var("SPARQL_TIMEOUT")
            .unwrap_or_else(|_| "30".to_string())
            .parse::<u64>()
            .map_err(|e| ConfigError::InvalidNumber(
                "SPARQL_TIMEOUT".to_string(),
                e.to_string()
            ))?;
        
        let max_retries = env::var("MAX_RETRIES")
            .unwrap_or_else(|_| "3".to_string())
            .parse::<u32>()
            .unwrap_or(3);
        
        // Cache settings
        let cache_enabled = env::var("CACHE_ENABLED")
            .unwrap_or_else(|_| "true".to_string())
            .parse::<bool>()
            .map_err(|_| ConfigError::InvalidBool(
                "CACHE_ENABLED".to_string(),
                env::var("CACHE_ENABLED").unwrap_or_default()
            ))?;
        
        let cache_ttl_seconds = env::var("CACHE_TTL")
            .unwrap_or_else(|_| "300".to_string()) // 5 minutes default
            .parse::<u64>()
            .unwrap_or(300);
        
        let cache_max_entries = env::var("CACHE_MAX_ENTRIES")
            .unwrap_or_else(|_| "1000".to_string())
            .parse::<usize>()
            .unwrap_or(1000);
        
        // Security settings
        let enable_auth = env::var("ENABLE_AUTH")
            .unwrap_or_else(|_| "false".to_string())
            .parse::<bool>()
            .map_err(|_| ConfigError::InvalidBool(
                "ENABLE_AUTH".to_string(),
                env::var("ENABLE_AUTH").unwrap_or_default()
            ))?;
        
        let api_key = env::var("API_KEY").ok();
        
        // Parse allowed origins from comma-separated list
        let allowed_origins = env::var("ALLOWED_ORIGINS")
            .unwrap_or_else(|_| "*".to_string())
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        
        // Graph visualization settings
        let graph_max_nodes = env::var("GRAPH_MAX_NODES")
            .unwrap_or_else(|_| "500".to_string())
            .parse::<usize>()
            .unwrap_or(500);
        
        let graph_max_edges = env::var("GRAPH_MAX_EDGES")
            .unwrap_or_else(|_| "1000".to_string())
            .parse::<usize>()
            .unwrap_or(1000);
        
        let graph_expansion_limit = env::var("GRAPH_EXPANSION_LIMIT")
            .unwrap_or_else(|_| "50".to_string())
            .parse::<usize>()
            .unwrap_or(50);
        
        let graph_search_limit = env::var("GRAPH_SEARCH_LIMIT")
            .unwrap_or_else(|_| "10".to_string())
            .parse::<usize>()
            .unwrap_or(10);
        
        Ok(Config {
            sparql_endpoint,
            sparql_update_endpoint,
            sparql_username,
            sparql_password,
            sparql_password_hashed,
            host,
            port,
            cors_enabled,
            max_payload_size,
            verify_ssl,
            timeout_seconds,
            max_retries,
            cache_enabled,
            cache_ttl_seconds,
            cache_max_entries,
            enable_auth,
            api_key,
            allowed_origins,
            graph_max_nodes,
            graph_max_edges,
            graph_expansion_limit,
            graph_search_limit,
        })
    }
    
    /// Get the update endpoint, using the configured one or the main endpoint as fallback
    pub fn get_update_endpoint(&self) -> &str {
        self.sparql_update_endpoint
            .as_ref()
            .map(|s| s.as_str())
            .unwrap_or(&self.sparql_endpoint)
    }
    
    /// Get the actual password, decoding from base64 if hashed
    pub fn get_password(&self) -> Option<String> {
        if let Some(ref password) = self.sparql_password {
            Some(password.clone())
        } else if let Some(ref hashed) = self.sparql_password_hashed {
            // Decode base64 password
            use base64::{Engine as _, engine::general_purpose};
            match general_purpose::STANDARD.decode(hashed) {
                Ok(decoded) => String::from_utf8(decoded).ok(),
                Err(_) => None,
            }
        } else {
            None
        }
    }
    
    /// Check if caching is enabled
    pub fn is_cache_enabled(&self) -> bool {
        self.cache_enabled
    }
    
    /// Check if authentication is required
    pub fn requires_auth(&self) -> bool {
        self.enable_auth && self.api_key.is_some()
    }
    
    /// Validate API key
    pub fn validate_api_key(&self, key: &str) -> bool {
        if !self.requires_auth() {
            return true;
        }
        
        self.api_key.as_ref().map_or(false, |k| k == key)
    }
    
    /// Check if origin is allowed for CORS
    pub fn is_origin_allowed(&self, origin: &str) -> bool {
        if self.allowed_origins.contains(&"*".to_string()) {
            return true;
        }
        
        self.allowed_origins.iter().any(|allowed| allowed == origin)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_default_config() {
        // Set required env var for test
        env::set_var("SPARQL_ENDPOINT", "http://localhost:3030/ds/sparql");
        
        let config = Config::from_env().unwrap();
        
        assert_eq!(config.host, "127.0.0.1");
        assert_eq!(config.port, 8080);
        assert!(config.cors_enabled);
        assert_eq!(config.timeout_seconds, 30);
        assert!(config.cache_enabled);
        assert_eq!(config.graph_max_nodes, 500);
    }
    
    #[test]
    fn test_stardog_update_endpoint_derivation() {
        env::set_var("SPARQL_ENDPOINT", "http://localhost:5820/myDB/query");
        
        let config = Config::from_env().unwrap();
        
        assert_eq!(
            config.sparql_update_endpoint,
            Some("http://localhost:5820/myDB/update".to_string())
        );
    }
    
    #[test]
    fn test_password_decoding() {
        env::set_var("SPARQL_ENDPOINT", "http://test");
        env::set_var("SPARQL_USERNAME", "user");
        env::set_var("SPARQL_PASSWORD_HASHED", "cGFzc3dvcmQ="); // "password" in base64
        
        let config = Config::from_env().unwrap();
        
        assert_eq!(config.get_password(), Some("password".to_string()));
        
        // Clean up
        env::remove_var("SPARQL_USERNAME");
        env::remove_var("SPARQL_PASSWORD_HASHED");
    }
    
    #[test]
    fn test_allowed_origins_parsing() {
        env::set_var("SPARQL_ENDPOINT", "http://test");
        env::set_var("ALLOWED_ORIGINS", "http://localhost:3000, http://localhost:8080, https://example.com");
        
        let config = Config::from_env().unwrap();
        
        assert_eq!(config.allowed_origins.len(), 3);
        assert!(config.is_origin_allowed("http://localhost:3000"));
        assert!(config.is_origin_allowed("https://example.com"));
        assert!(!config.is_origin_allowed("http://evil.com"));
        
        // Clean up
        env::remove_var("ALLOWED_ORIGINS");
    }
}