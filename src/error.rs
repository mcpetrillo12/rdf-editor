use actix_web::{error::ResponseError, http::StatusCode, HttpResponse};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum RdfEditorError {
    #[error("Configuration error: {0}")]
    Configuration(String),
    
    #[error("SPARQL error: {0}")]
    Sparql(String),
    
    #[error("HTTP request error: {0}")]
    Http(#[from] reqwest::Error),
    
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    
    #[error("Not found: {0}")]
    NotFound(String),
    
    #[error("Cache error: {0}")]
    Cache(String),
    
    #[error("Graph limit exceeded: {0}")]
    GraphLimitExceeded(String),
    
    #[error("Invalid header value: {0}")]
    InvalidHeader(#[from] reqwest::header::InvalidHeaderValue),
    
    #[error("Base64 decode error: {0}")]
    Base64Decode(#[from] base64::DecodeError),
    
    #[error("UTF-8 conversion error: {0}")]
    Utf8Error(#[from] std::string::FromUtf8Error),
}

impl ResponseError for RdfEditorError {
    fn error_response(&self) -> HttpResponse {
        let status = match self {
            RdfEditorError::Configuration(_) => StatusCode::INTERNAL_SERVER_ERROR,
            RdfEditorError::Sparql(_) => StatusCode::BAD_GATEWAY,
            RdfEditorError::Http(_) => StatusCode::BAD_GATEWAY,
            RdfEditorError::Serialization(_) => StatusCode::BAD_REQUEST,
            RdfEditorError::InvalidInput(_) => StatusCode::BAD_REQUEST,
            RdfEditorError::NotFound(_) => StatusCode::NOT_FOUND,
            RdfEditorError::Cache(_) => StatusCode::INTERNAL_SERVER_ERROR,
            RdfEditorError::GraphLimitExceeded(_) => StatusCode::BAD_REQUEST,
            RdfEditorError::InvalidHeader(_) => StatusCode::INTERNAL_SERVER_ERROR,
            RdfEditorError::Base64Decode(_) => StatusCode::BAD_REQUEST,
            RdfEditorError::Utf8Error(_) => StatusCode::BAD_REQUEST,
        };

        HttpResponse::build(status).json(serde_json::json!({
            "error": self.to_string(),
            "type": match self {
                RdfEditorError::Configuration(_) => "configuration",
                RdfEditorError::Sparql(_) => "sparql",
                RdfEditorError::Http(_) => "http",
                RdfEditorError::Serialization(_) => "serialization",
                RdfEditorError::InvalidInput(_) => "invalid_input",
                RdfEditorError::NotFound(_) => "not_found",
                RdfEditorError::Cache(_) => "cache",
                RdfEditorError::GraphLimitExceeded(_) => "graph_limit",
                RdfEditorError::InvalidHeader(_) => "header",
                RdfEditorError::Base64Decode(_) => "base64",
                RdfEditorError::Utf8Error(_) => "utf8",
            }
        }))
    }
}