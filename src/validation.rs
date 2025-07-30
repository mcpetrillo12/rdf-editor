use crate::error::RdfEditorError;
use url::Url;

pub fn validate_uri(uri: &str) -> Result<(), RdfEditorError> {
    if uri.is_empty() {
        return Err(RdfEditorError::InvalidInput("URI cannot be empty".to_string()));
    }
    
    // Check for SPARQL injection attempts
    if uri.contains('}') || uri.contains('{') || uri.contains(';') {
        return Err(RdfEditorError::InvalidInput(
            "URI contains invalid characters that could be used for injection".to_string()
        ));
    }
    
    // Check if it's a valid URI
    if !uri.starts_with("http://") && !uri.starts_with("https://") && !uri.starts_with("urn:") {
        return Err(RdfEditorError::InvalidInput(
            format!("Invalid URI: {}. URIs should start with http://, https://, or urn:", uri)
        ));
    }
    
    // Try to parse as URL for http/https URIs
    if uri.starts_with("http") {
        Url::parse(uri).map_err(|e| 
            RdfEditorError::InvalidInput(format!("Invalid URI: {}", e))
        )?;
    }
    
    Ok(())
}

pub fn validate_language_tag(lang: &str) -> Result<(), RdfEditorError> {
    // Basic language tag validation (RFC 5646)
    if lang.is_empty() {
        return Err(RdfEditorError::InvalidInput("Language tag cannot be empty".to_string()));
    }
    
    // Check for injection attempts
    if lang.contains('"') || lang.contains('\\') {
        return Err(RdfEditorError::InvalidInput(
            "Language tag contains invalid characters".to_string()
        ));
    }
    
    // Simple check for basic pattern: 2-3 letter language code, optionally followed by subtags
    let parts: Vec<&str> = lang.split('-').collect();
    if parts.is_empty() {
        return Err(RdfEditorError::InvalidInput("Invalid language tag".to_string()));
    }
    
    let primary = parts[0];
    if primary.len() < 2 || primary.len() > 3 || !primary.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err(RdfEditorError::InvalidInput(
            format!("Invalid language tag: {}. Primary tag should be 2-3 letters", lang)
        ));
    }
    
    Ok(())
}

pub fn validate_blank_node_id(id: &str) -> Result<(), RdfEditorError> {
    if id.is_empty() {
        return Err(RdfEditorError::InvalidInput("Blank node ID cannot be empty".to_string()));
    }
    
    // Check for injection attempts
    if id.contains(' ') || id.contains('"') || id.contains('\\') {
        return Err(RdfEditorError::InvalidInput(
            "Blank node ID contains invalid characters".to_string()
        ));
    }
    
    // Blank node IDs should contain only alphanumeric characters and underscores
    if !id.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err(RdfEditorError::InvalidInput(
            format!("Invalid blank node ID: {}. Use only letters, numbers, and underscores", id)
        ));
    }
    
    Ok(())
}

pub fn sanitize_literal_value(value: &str) -> String {
    // Escape special characters in literal values
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}