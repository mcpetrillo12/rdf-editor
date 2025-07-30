use actix_web::{HttpResponse, web};
use crate::{
    AppState, 
    models::{
        SparqlQuery, QueryResponse, PaginatedQuery, PaginatedResponse,
        GraphSearchRequest, GraphExpandRequest, GraphDataResponse, 
        GraphPathRequest, GraphPath, GraphEdge
    }, 
    error::RdfEditorError
};
use sha2::{Sha256, Digest};
use std::collections::{HashMap, HashSet, VecDeque};

fn hash_query(query: &str, graph: Option<&str>) -> String {
    let mut hasher = Sha256::new();
    hasher.update(query.as_bytes());
    if let Some(g) = graph {
        hasher.update(g.as_bytes());
    }
    format!("{:x}", hasher.finalize())
}

pub async fn execute(
    data: web::Data<AppState>,
    query: web::Json<SparqlQuery>,
) -> Result<HttpResponse, RdfEditorError> {
    // Check cache first for SELECT queries
    let is_select = query.query.trim().to_uppercase().starts_with("SELECT");
    let cache_key = if is_select {
        Some(hash_query(&query.query, query.graph.as_deref()))
    } else {
        None
    };
    
    if let Some(ref key) = cache_key {
        if let Some(cached_result) = data.query_cache.get(key).await {
            return Ok(HttpResponse::Ok().json(QueryResponse {
                results: vec![cached_result],
            }));
        }
    }
    
    // Execute query
    let results = data.sparql_client.query(&query.query).await?;
    
    // Cache SELECT query results
    if let Some(key) = cache_key {
        data.query_cache.set(key, results.clone()).await;
    }
    
    Ok(HttpResponse::Ok().json(QueryResponse {
        results: vec![results],
    }))
}

pub async fn get_triples(
    data: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, RdfEditorError> {
    let graph_name = path.into_inner();
    
    // Handle "default" as a special case for the default graph
    let graph_option = if graph_name == "default" {
        None
    } else {
        Some(graph_name.as_str())
    };
    
    let triples = data.sparql_client.get_triples(graph_option).await?;
    
    Ok(HttpResponse::Ok().json(triples))
}

pub async fn get_triples_paginated(
    data: web::Data<AppState>,
    path: web::Path<String>,
    query: web::Query<PaginatedQuery>,
) -> Result<HttpResponse, RdfEditorError> {
    let graph_name = path.into_inner();
    
    // Get total count
    let total = data.sparql_client.count_triples(Some(&graph_name)).await?;
    
    // Get paginated triples
    let triples = data.sparql_client
        .get_triples_paginated(Some(&graph_name), query.limit, query.offset)
        .await?;
    
    let has_more = query.offset + triples.len() < total;
    
    Ok(HttpResponse::Ok().json(PaginatedResponse {
        data: triples,
        total: Some(total),
        limit: query.limit,
        offset: query.offset,
        has_more,
    }))
}

pub async fn get_resources_with_labels(
    data: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, RdfEditorError> {
    let graph_name = path.into_inner();
    let cache_key = format!("labels:{}", graph_name);
    
    // Check cache first
    if let Some(cached_result) = data.query_cache.get(&cache_key).await {
        return Ok(HttpResponse::Ok().json(cached_result));
    }
    
    // Query to get resources with their types and labels
    let query = if graph_name == "default" {
        // Query the default graph
        r#"
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
        
        SELECT DISTINCT ?resource ?type ?label ?labelProp ?lang
        WHERE {
            ?resource ?p ?o .
            OPTIONAL {
                ?resource rdf:type ?type .
            }
            OPTIONAL {
                {
                    ?resource rdfs:label ?label .
                    BIND(rdfs:label as ?labelProp)
                } UNION {
                    ?resource skos:prefLabel ?label .
                    BIND(skos:prefLabel as ?labelProp)
                } UNION {
                    ?resource skos:altLabel ?label .
                    BIND(skos:altLabel as ?labelProp)
                }
                BIND(LANG(?label) as ?lang)
            }
        }
        ORDER BY ?resource
        LIMIT 5000
        "#.to_string()
    } else {
        // Query a named graph
        format!(r#"
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
        
        SELECT DISTINCT ?resource ?type ?label ?labelProp ?lang
        WHERE {{
            GRAPH <{}> {{
                ?resource ?p ?o .
                OPTIONAL {{
                    ?resource rdf:type ?type .
                }}
                OPTIONAL {{
                    {{
                        ?resource rdfs:label ?label .
                        BIND(rdfs:label as ?labelProp)
                    }} UNION {{
                        ?resource skos:prefLabel ?label .
                        BIND(skos:prefLabel as ?labelProp)
                    }} UNION {{
                        ?resource skos:altLabel ?label .
                        BIND(skos:altLabel as ?labelProp)
                    }}
                    BIND(LANG(?label) as ?lang)
                }}
            }}
        }}
        ORDER BY ?resource
        LIMIT 5000
    "#, graph_name)
    };
    
    let results = data.sparql_client.query(&query).await?;
    
    // Cache the results
    data.query_cache.set(cache_key, results.clone()).await;
    
    Ok(HttpResponse::Ok().json(results))
}

// New graph-specific endpoints

pub async fn search_graph_nodes(
    data: web::Data<AppState>,
    request: web::Json<GraphSearchRequest>,
) -> Result<HttpResponse, RdfEditorError> {
    let nodes = data.sparql_client
        .search_nodes_by_label(&request.query, request.limit)
        .await?;
    
    Ok(HttpResponse::Ok().json(GraphDataResponse {
        nodes,
        edges: vec![],
    }))
}

pub async fn expand_graph_node(
    data: web::Data<AppState>,
    request: web::Json<GraphExpandRequest>,
) -> Result<HttpResponse, RdfEditorError> {
    // Check if expansion limit is reasonable
    let config = &data.config;
    let limit = request.limit.min(config.graph_expansion_limit);
    
    let (nodes, edges) = data.sparql_client
        .get_node_connections(&request.uri, limit)
        .await?;
    
    Ok(HttpResponse::Ok().json(GraphDataResponse {
        nodes,
        edges,
    }))
}

pub async fn get_node_info(
    data: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, RdfEditorError> {
    let encoded_uri = path.into_inner();
    let uri = urlencoding::decode(&encoded_uri)
        .map_err(|_| RdfEditorError::InvalidInput("Invalid URI encoding".to_string()))?
        .into_owned();
    
    let node = data.sparql_client.get_node_info(&uri).await?;
    
    Ok(HttpResponse::Ok().json(node))
}

pub async fn find_path_between_nodes(
    data: web::Data<AppState>,
    request: web::Json<GraphPathRequest>,
) -> Result<HttpResponse, RdfEditorError> {
    // This is a simple BFS implementation for finding shortest path
    // For production, you might want to use SPARQL property paths or a graph database
    
    let max_depth = request.max_depth.min(10); // Limit depth to prevent long searches
    
    // Build a subgraph around the nodes
    let path = find_shortest_path(
        &data.sparql_client,
        &request.from,
        &request.to,
        max_depth
    ).await?;
    
    match path {
        Some(path) => Ok(HttpResponse::Ok().json(path)),
        None => Ok(HttpResponse::Ok().json(serde_json::json!({
            "message": "No path found between the nodes within the specified depth"
        }))),
    }
}

// Helper function for path finding
async fn find_shortest_path(
    client: &crate::sparql::SparqlClient,
    from: &str,
    to: &str,
    max_depth: usize,
) -> Result<Option<GraphPath>, RdfEditorError> {
    // Simple BFS implementation
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    let mut parents: HashMap<String, (String, String)> = HashMap::new(); // node -> (parent, predicate)
    
    queue.push_back((from.to_string(), 0));
    visited.insert(from.to_string());
    
    while let Some((current, depth)) = queue.pop_front() {
        if current == to {
            // Reconstruct path
            let mut path_nodes = vec![current.clone()];
            let mut path_edges = vec![];
            let mut node = current;
            
            while let Some((parent, predicate)) = parents.get(&node) {
                path_nodes.push(parent.clone());
                path_edges.push(GraphEdge {
                    source: parent.clone(),
                    target: node.clone(),
                    predicate: predicate.clone(),
                    label: None,
                });
                node = parent.clone();
            }
            
            path_nodes.reverse();
            path_edges.reverse();
            
            return Ok(Some(GraphPath {
                nodes: path_nodes,
                edges: path_edges.clone(),
                length: path_edges.len(),
            }));
        }
        
        if depth >= max_depth {
            continue;
        }
        
        // Get connections
        let (_nodes, edges) = client.get_node_connections(&current, 50).await?;
        
        for edge in edges {
            let next = if edge.source == current {
                &edge.target
            } else {
                &edge.source
            };
            
            if !visited.contains(next) {
                visited.insert(next.clone());
                parents.insert(next.clone(), (current.clone(), edge.predicate));
                queue.push_back((next.clone(), depth + 1));
            }
        }
    }
    
    Ok(None)
}