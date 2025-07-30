use actix_web::{HttpResponse, web};
use crate::{
    AppState, 
    models::{ExportRequest, ImportRequest, RdfFormat},
    error::RdfEditorError
};

pub async fn export_graph(
    data: web::Data<AppState>,
    query: web::Query<ExportRequest>,
) -> Result<HttpResponse, RdfEditorError> {
    // For now, we'll export as N-Triples which is simple to generate
    // In a real implementation, you'd use a proper RDF library for other formats
    
    let triples = data.sparql_client.get_triples(query.graph.as_deref()).await?;
    
    match query.format {
        RdfFormat::NTriples => {
            let mut output = String::new();
            for triple in triples {
                output.push_str(&format!("{} .\n", triple.to_sparql_pattern()));
            }
            
            Ok(HttpResponse::Ok()
                .content_type("application/n-triples")
                .append_header(("Content-Disposition", 
                    format!("attachment; filename=\"export.{}\"", query.format.file_extension())))
                .body(output))
        },
        _ => Err(RdfEditorError::InvalidInput(
            format!("Export format {:?} not yet implemented", query.format)
        )),
    }
}

pub async fn import_data(
    data: web::Data<AppState>,
    request: web::Json<ImportRequest>,
) -> Result<HttpResponse, RdfEditorError> {
    // For now, we only support N-Triples import
    // In a real implementation, you'd use a proper RDF parser
    
    match request.format {
        RdfFormat::NTriples => {
            // Very basic N-Triples parsing (production code should use a proper parser)
            let lines: Vec<&str> = request.data.lines()
                .filter(|line| !line.trim().is_empty() && !line.trim().starts_with('#'))
                .collect();
                
            if lines.is_empty() {
                return Err(RdfEditorError::InvalidInput("No valid triples found".to_string()));
            }
            
            // Build SPARQL INSERT DATA query
            let mut update = format!("INSERT DATA {{ GRAPH <{}> {{", request.graph);
            let line_count = lines.len();
            for line in &lines {
                let trimmed = line.trim();
                if trimmed.ends_with('.') {
                    update.push_str(&format!(" {}", trimmed));
                } else {
                    update.push_str(&format!(" {} .", trimmed));
                }
            }
            update.push_str(" } }");
            
            data.sparql_client.update(&update).await?;
            
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "message": format!("Imported {} triples", line_count)
            })))
        },
        _ => Err(RdfEditorError::InvalidInput(
            format!("Import format {:?} not yet implemented", request.format)
        )),
    }
}