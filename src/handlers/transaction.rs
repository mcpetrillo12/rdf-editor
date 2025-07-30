use actix_web::{HttpResponse, web};
use crate::{AppState, error::RdfEditorError};
use crate::transaction_log::TransactionType;

pub async fn get_recent_transactions(
    data: web::Data<AppState>,
) -> Result<HttpResponse, RdfEditorError> {
    let transactions = data.transaction_logger
        .get_recent_transactions(50)
        .await?;
    
    Ok(HttpResponse::Ok().json(transactions))
}

pub async fn undo_transaction(
    data: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, RdfEditorError> {
    let transaction_id = path.into_inner();
    
    // Get the transaction record
    let transactions = data.transaction_logger
        .get_recent_transactions(100)
        .await?;
    
    let transaction = transactions
        .iter()
        .find(|t| t.record.id == transaction_id)
        .ok_or_else(|| RdfEditorError::NotFound(format!("Transaction {} not found", transaction_id)))?;
    
    if !transaction.can_undo {
        return Err(RdfEditorError::InvalidInput(
            "This transaction type cannot be undone automatically".to_string()
        ));
    }
    
    // Perform the undo based on transaction type
    match &transaction.record.transaction_type {
        TransactionType::AddTriple => {
            // Undo by deleting the added triple
            if let Some(triples) = &transaction.record.new_data {
                if let Some(triple) = triples.first() {
                    if let Some(graph) = &transaction.record.graph {
                        if graph == "default" {
                            data.sparql_client.delete_triple_from_default(triple).await?;
                        } else {
                            data.sparql_client.delete_triple(triple, graph).await?;
                        }
                    }
                }
            }
        },
        TransactionType::DeleteTriple => {
            // Undo by re-adding the deleted triple
            if let Some(triples) = &transaction.record.old_data {
                if let Some(triple) = triples.first() {
                    if let Some(graph) = &transaction.record.graph {
                        if graph == "default" {
                            data.sparql_client.add_triple_to_default(triple).await?;
                        } else {
                            data.sparql_client.add_triple(triple, graph).await?;
                        }
                    }
                }
            }
        },
        TransactionType::ReplaceTriple => {
            // Undo by reversing the replacement
            if let (Some(old_triples), Some(new_triples)) = 
                (&transaction.record.old_data, &transaction.record.new_data) {
                if let (Some(old_triple), Some(new_triple)) = 
                    (old_triples.first(), new_triples.first()) {
                    if let Some(graph) = &transaction.record.graph {
                        if graph == "default" {
                            data.sparql_client.replace_triple_in_default(new_triple, old_triple).await?;
                        } else {
                            data.sparql_client.replace_triple(new_triple, old_triple, graph).await?;
                        }
                    }
                }
            }
        },
        _ => {
            return Err(RdfEditorError::InvalidInput(
                "Undo not implemented for this transaction type".to_string()
            ));
        }
    }
    
    // Log the undo operation
    data.transaction_logger.log_batch_operation(
        TransactionType::AddTriple, // We could add an "Undo" transaction type
        transaction.record.graph.as_deref(),
        None,
        None,
        &format!("Undid transaction: {}", transaction_id),
        None,
    ).await?;
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": format!("Transaction {} has been undone", transaction_id)
    })))
}