use actix_web::{HttpResponse, web};
use crate::AppState;

pub async fn check(data: web::Data<AppState>) -> HttpResponse {
    // Try a simple ASK query to verify SPARQL endpoint connectivity
    match data.sparql_client.query("ASK { ?s ?p ?o }").await {
        Ok(_) => HttpResponse::Ok().json(serde_json::json!({
            "status": "healthy",
            "sparql_endpoint": "connected"
        })),
        Err(e) => HttpResponse::ServiceUnavailable().json(serde_json::json!({
            "status": "unhealthy",
            "sparql_endpoint": "disconnected",
            "error": e.to_string()
        }))
    }
}