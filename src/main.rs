mod config;
mod error;
mod models;
mod sparql;
mod handlers;
mod validation;
mod transaction_log;
mod cache;

use actix_web::{middleware, web, App, HttpServer};
use actix_cors::Cors;
use actix_files as fs;
use log::info;
use std::sync::Arc;

use crate::config::Config;
use crate::sparql::SparqlClient;
use crate::transaction_log::TransactionLogger;
use crate::cache::{LabelCache, TypeCache, QueryCache, GraphCacheManager};
use crate::handlers::{health, query, update, batch, import_export, transaction};

pub struct AppState {
    pub config: Arc<Config>,
    pub sparql_client: Arc<SparqlClient>,
    pub transaction_logger: Arc<TransactionLogger>,
    pub label_cache: Arc<LabelCache>,
    pub type_cache: Arc<TypeCache>,
    pub query_cache: Arc<QueryCache>,
    pub graph_cache: Arc<GraphCacheManager>,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Load .env file if it exists
    dotenv::dotenv().ok();
    
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    let config = Arc::new(Config::from_env().expect("Failed to load configuration"));
    info!("Starting RDF Editor on {}:{}", config.host, config.port);

    let sparql_client = Arc::new(
        SparqlClient::new(&config)
        .expect("Failed to create SPARQL client")
    );
    
    let transaction_logger = Arc::new(
        TransactionLogger::new("transaction_log.jsonl")
            .await
            .expect("Failed to create transaction logger")
    );
    
    // Initialize caches with TTL from config
    let label_cache = Arc::new(LabelCache::new(config.cache_ttl_seconds as i64));
    let type_cache = Arc::new(TypeCache::new(config.cache_ttl_seconds as i64));
    let query_cache = Arc::new(QueryCache::new(config.cache_ttl_seconds as i64));
    let graph_cache = Arc::new(GraphCacheManager::new(config.cache_ttl_seconds as i64));
    
    // Clone for the cleanup task before moving into AppState
    let cache_cleanup_label = label_cache.clone();
    let cache_cleanup_type = type_cache.clone();
    let cache_cleanup_query = query_cache.clone();
    let cache_cleanup_graph = graph_cache.clone();

    let app_state = web::Data::new(AppState { 
        config,
        sparql_client,
        transaction_logger,
        label_cache,
        type_cache,
        query_cache,
        graph_cache,
    });
    
    // Spawn a task to periodically clean up expired cache entries
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(600)); // Every 10 minutes
        loop {
            interval.tick().await;
            cache_cleanup_label.cleanup_expired().await;
            cache_cleanup_type.cleanup_expired().await;
            cache_cleanup_query.cleanup_expired().await;
            cache_cleanup_graph.cleanup_all().await;
        }
    });

    let bind_address = (app_state.config.host.clone(), app_state.config.port);

    HttpServer::new(move || {
        let cors = if app_state.config.cors_enabled {
            Cors::default()
                .allow_any_origin()
                .allow_any_method()
                .allow_any_header()
        } else {
            Cors::default()
        };

        App::new()
            .app_data(app_state.clone())
            .app_data(web::PayloadConfig::new(app_state.config.max_payload_size))
            .wrap(cors)
            .wrap(middleware::Logger::default())
            .service(
                web::scope("/api")
                    // Health check
                    .route("/health", web::get().to(health::check))
                    
                    // Query endpoints
                    .route("/query", web::post().to(query::execute))
                    .route("/graph/{graph_name}/triples", web::get().to(query::get_triples))
                    .route("/graph/{graph_name}/triples/paginated", web::get().to(query::get_triples_paginated))
                    .route("/graph/{graph_name}/resources", web::get().to(query::get_resources_with_labels))
                    
                    // Update endpoints
                    .route("/graph/{graph_name}/triple", web::post().to(update::add_triple))
                    .route("/graph/{graph_name}/triple", web::delete().to(update::delete_triple))
                    .route("/graph/{graph_name}/triple/replace", web::put().to(update::replace_triple))
                    
                    // Batch operations
                    .route("/graph/{graph_name}/triples/batch", web::post().to(batch::add_triples_batch))
                    .route("/graph/{graph_name}/triples/batch", web::delete().to(batch::delete_triples_batch))
                    
                    // Import/Export
                    .route("/export", web::get().to(import_export::export_graph))
                    .route("/import", web::post().to(import_export::import_data))
                    
                    // Transaction history
                    .route("/transactions", web::get().to(transaction::get_recent_transactions))
                    .route("/transaction/{id}/undo", web::post().to(transaction::undo_transaction))
                    
                    // Graph visualization endpoints (NEW)
                    .route("/graph/search", web::post().to(query::search_graph_nodes))
                    .route("/graph/expand", web::post().to(query::expand_graph_node))
                    .route("/graph/node/{uri}", web::get().to(query::get_node_info))
                    .route("/graph/path", web::post().to(query::find_path_between_nodes))
            )
            // Serve static files from the "static" directory
            .service(fs::Files::new("/", "./static").index_file("index.html"))
    })
    .bind(bind_address)?
    .run()
    .await
}