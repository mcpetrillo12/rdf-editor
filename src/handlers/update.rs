use actix_web::{HttpResponse, web};
use crate::{
    AppState, 
    models::{SparqlUpdate, UpdateResponse, AddTripleRequest, DeleteTripleRequest, Triple, RdfNode, ReplaceTripleRequest},
    error::RdfEditorError,
    validation::{validate_uri, validate_language_tag, validate_blank_node_id}
};

pub async fn execute(
    data: web::Data<AppState>,
    update: web::Json<SparqlUpdate>,
) -> Result<HttpResponse, RdfEditorError> {
    // If a graph is specified, wrap the update in a GRAPH clause
    let final_update = if let Some(graph) = &update.graph {
        format!("WITH <{}> {}", graph, update.update)
    } else {
        update.update.clone()
    };
    
    data.sparql_client.update(&final_update).await?;
    
    Ok(HttpResponse::Ok().json(UpdateResponse {
        success: true,
        message: "Update executed successfully".to_string(),
    }))
}

pub async fn add_triple(
    data: web::Data<AppState>,
    path: web::Path<String>,
    request: web::Json<AddTripleRequest>,
) -> Result<HttpResponse, RdfEditorError> {
    let graph_name = path.into_inner();
    
    // Validate URIs
    validate_uri(&request.subject)?;
    validate_uri(&request.predicate)?;
    
    // Validate object based on type
    match &request.object {
        RdfNode::Uri { value } => validate_uri(value)?,
        RdfNode::Literal { value: _, language, datatype } => {
            if let Some(lang) = language {
                validate_language_tag(lang)?;
            }
            if let Some(dt) = datatype {
                validate_uri(dt)?;
            }
        },
        RdfNode::Blank { value } => validate_blank_node_id(&value)?,
    }
    
    let triple = Triple {
        subject: request.subject.clone(),
        predicate: request.predicate.clone(),
        object: request.object.clone(),
        graph: if graph_name == "default" { None } else { Some(graph_name.clone()) },
    };
    
    // Handle default graph
    if graph_name == "default" {
        data.sparql_client.add_triple_to_default(&triple).await?;
    } else {
        data.sparql_client.add_triple(&triple, &graph_name).await?;
    }
    
    // Log the transaction
    data.transaction_logger.log_add_triple(
        if graph_name == "default" { None } else { Some(&graph_name) },
        &triple,
        None, // No user ID yet
    ).await?;
    
    // Invalidate relevant caches
    let cache_key = format!("labels:{}", graph_name);
    data.query_cache.invalidate(&cache_key).await;
    
    Ok(HttpResponse::Ok().json(UpdateResponse {
        success: true,
        message: "Triple added successfully".to_string(),
    }))
}

pub async fn delete_triple(
    data: web::Data<AppState>,
    path: web::Path<String>,
    request: web::Json<DeleteTripleRequest>,
) -> Result<HttpResponse, RdfEditorError> {
    let graph_name = path.into_inner();
    
    let triple = Triple {
        subject: request.subject.clone(),
        predicate: request.predicate.clone(),
        object: request.object.clone(),
        graph: if graph_name == "default" { None } else { Some(graph_name.clone()) },
    };
    
    // Handle default graph
    if graph_name == "default" {
        data.sparql_client.delete_triple_from_default(&triple).await?;
    } else {
        data.sparql_client.delete_triple(&triple, &graph_name).await?;
    }
    
    // Log the transaction
    data.transaction_logger.log_delete_triple(
        if graph_name == "default" { None } else { Some(&graph_name) },
        &triple,
        None, // No user ID yet
    ).await?;
    
    Ok(HttpResponse::Ok().json(UpdateResponse {
        success: true,
        message: "Triple deleted successfully".to_string(),
    }))
}

pub async fn replace_triple(
    data: web::Data<AppState>,
    path: web::Path<String>,
    request: web::Json<ReplaceTripleRequest>,
) -> Result<HttpResponse, RdfEditorError> {
    let graph_name = path.into_inner();
    
    // Validate the new triple's URIs
    validate_uri(&request.new_triple.subject)?;
    validate_uri(&request.new_triple.predicate)?;
    
    // Validate new object based on type
    match &request.new_triple.object {
        RdfNode::Uri { value } => validate_uri(value)?,
        RdfNode::Literal { value: _, language, datatype } => {
            if let Some(lang) = language {
                validate_language_tag(lang)?;
            }
            if let Some(dt) = datatype {
                validate_uri(dt)?;
            }
        },
        RdfNode::Blank { value } => validate_blank_node_id(value.as_str())?,
    }
    
    // Ensure subject and predicate haven't changed
    if request.old_triple.subject != request.new_triple.subject ||
       request.old_triple.predicate != request.new_triple.predicate {
        return Err(RdfEditorError::InvalidInput(
            "Cannot change subject or predicate during replace. Delete and add new triple instead.".to_string()
        ));
    }
    
    // Handle default graph
    if graph_name == "default" {
        data.sparql_client.replace_triple_in_default(&request.old_triple, &request.new_triple).await?;
    } else {
        data.sparql_client.replace_triple(&request.old_triple, &request.new_triple, &graph_name).await?;
    }
    
    // Log the transaction
    data.transaction_logger.log_replace_triple(
        if graph_name == "default" { None } else { Some(&graph_name) },
        &request.old_triple,
        &request.new_triple,
        None, // No user ID yet
    ).await?;
    
    Ok(HttpResponse::Ok().json(UpdateResponse {
        success: true,
        message: "Triple replaced successfully".to_string(),
    }))
}