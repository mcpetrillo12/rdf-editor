use actix_web::{HttpResponse, web};
use crate::{
    AppState, 
    models::{BatchTripleRequest, BatchOperationResponse},
    error::RdfEditorError,
    transaction_log::TransactionType,
};

pub async fn add_triples_batch(
    data: web::Data<AppState>,
    path: web::Path<String>,
    request: web::Json<BatchTripleRequest>,
) -> Result<HttpResponse, RdfEditorError> {
    let graph_name = path.into_inner();
    
    if request.triples.is_empty() {
        return Err(RdfEditorError::InvalidInput("No triples provided".to_string()));
    }
    
    // Validate all triples have the correct graph
    for triple in &request.triples {
        if let Some(ref g) = triple.graph {
            if g != &graph_name {
                return Err(RdfEditorError::InvalidInput(
                    format!("Triple graph {} does not match target graph {}", g, graph_name)
                ));
            }
        }
    }
    
    // Start batch mode for efficient logging
    data.transaction_logger.start_batch().await;
    
    // Process in batches of 100 to avoid overly large SPARQL updates
    let batch_size = 100;
    let mut processed = 0;
    let mut errors = Vec::new();
    
    for chunk in request.triples.chunks(batch_size) {
        match data.sparql_client.add_triples_batch(chunk, &graph_name).await {
            Ok(_) => processed += chunk.len(),
            Err(e) => {
                errors.push(format!("Failed to add batch starting at index {}: {}", processed, e));
                break;
            }
        }
    }
    
    // Log the batch operation
    if errors.is_empty() {
        data.transaction_logger.log_batch_operation(
            TransactionType::AddTriplesBatch,
            Some(&graph_name),
            None,
            Some(&request.triples),
            &format!("Added {} triples in batch", processed),
            None,
        ).await?;
    }
    
    // End batch mode and flush
    data.transaction_logger.end_batch().await?;
    
    Ok(HttpResponse::Ok().json(BatchOperationResponse {
        success: errors.is_empty(),
        processed,
        failed: request.triples.len() - processed,
        errors,
    }))
}

pub async fn delete_triples_batch(
    data: web::Data<AppState>,
    path: web::Path<String>,
    request: web::Json<BatchTripleRequest>,
) -> Result<HttpResponse, RdfEditorError> {
    let graph_name = path.into_inner();
    
    if request.triples.is_empty() {
        return Err(RdfEditorError::InvalidInput("No triples provided".to_string()));
    }
    
    let batch_size = 100;
    let mut processed = 0;
    let mut errors = Vec::new();
    
    for chunk in request.triples.chunks(batch_size) {
        match data.sparql_client.delete_triples_batch(chunk, &graph_name).await {
            Ok(_) => processed += chunk.len(),
            Err(e) => {
                errors.push(format!("Failed to delete batch starting at index {}: {}", processed, e));
                break;
            }
        }
    }
    
    Ok(HttpResponse::Ok().json(BatchOperationResponse {
        success: errors.is_empty(),
        processed,
        failed: request.triples.len() - processed,
        errors,
    }))
}