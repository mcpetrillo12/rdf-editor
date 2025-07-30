use crate::{error::RdfEditorError, models::{Triple, RdfNode, GraphNode, GraphEdge, NodeType}, config::Config};
use reqwest::{Client, header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_TYPE, AUTHORIZATION}};
use serde_json::Value;
use base64::{Engine as _, engine::general_purpose};
use std::collections::HashMap;

pub struct SparqlClient {
    client: Client,
    query_endpoint: String,      // For SELECT, ASK, CONSTRUCT, DESCRIBE
    update_endpoint: String,     // For INSERT, DELETE, etc.
    headers: HeaderMap,
}

impl SparqlClient {
    pub fn new(config: &Config) -> Result<Self, RdfEditorError> {
        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT, HeaderValue::from_static("application/sparql-results+json"));
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/x-www-form-urlencoded"));
        
        // Add authentication if provided
        if let Some(username) = &config.sparql_username {
            let password = config.get_password()
                .ok_or_else(|| RdfEditorError::Configuration("Password required when username is provided".to_string()))?;
            
            let auth = general_purpose::STANDARD.encode(format!("{}:{}", username, password));
            headers.insert(AUTHORIZATION, HeaderValue::from_str(&format!("Basic {}", auth))?);
        }
        
        let client = if config.verify_ssl {
            Client::builder().default_headers(headers.clone()).build()?
        } else {
            Client::builder()
                .danger_accept_invalid_certs(true)
                .default_headers(headers.clone())
                .build()?
        };
        
        Ok(SparqlClient {
            client,
            query_endpoint: config.sparql_endpoint.clone(),
            update_endpoint: config.get_update_endpoint().to_string(),
            headers,
        })
    }
    
    pub async fn query(&self, query: &str) -> Result<Value, RdfEditorError> {
        log::debug!("Executing SPARQL query on endpoint: {}", self.query_endpoint);
        log::debug!("Query: {}", query);
        
        let response = self.client
            .post(&self.query_endpoint)
            .form(&[("query", query)])
            .send()
            .await?;
        
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            log::error!("SPARQL query failed with status {}: {}", status, error_text);
            return Err(RdfEditorError::Sparql(format!("Query failed with status {}: {}", status, error_text)));
        }
        
        let result = response.json::<Value>().await?;
        Ok(result)
    }
    
    pub async fn update(&self, update: &str) -> Result<(), RdfEditorError> {
        log::debug!("Executing SPARQL update on endpoint: {}", self.update_endpoint);
        log::debug!("Update: {}", update);
        
        let response = self.client
            .post(&self.update_endpoint)
            .form(&[("update", update)])
            .send()
            .await?;
        
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
            log::error!("SPARQL update failed with status {}: {}", status, error_text);
            return Err(RdfEditorError::Sparql(format!("Update failed with status {}: {}", status, error_text)));
        }
        
        Ok(())
    }
    
    pub async fn get_triples(&self, graph: Option<&str>) -> Result<Vec<Triple>, RdfEditorError> {
        let query = if let Some(g) = graph {
            format!(
                "SELECT ?s ?p ?o WHERE {{ GRAPH <{}> {{ ?s ?p ?o }} }} LIMIT 1000",
                g
            )
        } else {
            "SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 1000".to_string()
        };
        
        let result = self.query(&query).await?;
        self.parse_triples_from_results(result, graph)
    }
    
    pub async fn get_triples_paginated(&self, graph: Option<&str>, limit: usize, offset: usize) -> Result<Vec<Triple>, RdfEditorError> {
        let query = if let Some(g) = graph {
            format!(
                "SELECT ?s ?p ?o WHERE {{ GRAPH <{}> {{ ?s ?p ?o }} }} LIMIT {} OFFSET {}",
                g, limit, offset
            )
        } else {
            format!("SELECT ?s ?p ?o WHERE {{ ?s ?p ?o }} LIMIT {} OFFSET {}", limit, offset)
        };
        
        let result = self.query(&query).await?;
        self.parse_triples_from_results(result, graph)
    }
    
    pub async fn count_triples(&self, graph: Option<&str>) -> Result<usize, RdfEditorError> {
        let query = if let Some(g) = graph {
            format!(
                "SELECT (COUNT(*) as ?count) WHERE {{ GRAPH <{}> {{ ?s ?p ?o }} }}",
                g
            )
        } else {
            "SELECT (COUNT(*) as ?count) WHERE { ?s ?p ?o }".to_string()
        };
        
        let result = self.query(&query).await?;
        
        // Parse count from results
        if let Some(bindings) = result["results"]["bindings"].as_array() {
            if let Some(first) = bindings.first() {
                if let Some(count_val) = first["count"]["value"].as_str() {
                    return count_val.parse::<usize>()
                        .map_err(|_| RdfEditorError::Sparql("Invalid count value".to_string()));
                }
            }
        }
        
        Ok(0)
    }
    
    // New graph-specific methods
    
    pub async fn get_node_info(&self, uri: &str) -> Result<GraphNode, RdfEditorError> {
        let query = format!(r#"
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
            
            SELECT ?type ?label ?labelProp ?lang WHERE {{
                OPTIONAL {{ <{}> rdf:type ?type }}
                OPTIONAL {{
                    <{}> ?labelProp ?label .
                    FILTER(?labelProp IN (rdfs:label, skos:prefLabel, skos:altLabel))
                    BIND(LANG(?label) as ?lang)
                }}
            }}
        "#, uri, uri);
        
        let result = self.query(&query).await?;
        let bindings = result["results"]["bindings"].as_array()
            .ok_or_else(|| RdfEditorError::Sparql("Invalid query response".to_string()))?;
        
        // Extract types and labels
        let mut types = Vec::new();
        let mut labels = HashMap::new();
        
        for binding in bindings {
            if let Some(type_val) = binding["type"]["value"].as_str() {
                if !types.contains(&type_val.to_string()) {
                    types.push(type_val.to_string());
                }
            }
            
            if let Some(label_val) = binding["label"]["value"].as_str() {
                let lang = binding["lang"]["value"].as_str().unwrap_or("");
                labels.insert(lang.to_string(), label_val.to_string());
            }
        }
        
        // Determine node type
        let node_type = self.determine_node_type(&types);
        
        // Get best label
        let label = self.get_best_label(&labels);
        
        Ok(GraphNode {
            uri: uri.to_string(),
            label,
            types,
            node_type,
        })
    }
    
    pub async fn get_node_connections(&self, uri: &str, limit: usize) -> Result<(Vec<GraphNode>, Vec<GraphEdge>), RdfEditorError> {
        // Query for outgoing connections
        let outgoing_query = format!(r#"
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            
            SELECT DISTINCT ?predicate ?object ?objectType ?objectLabel WHERE {{
                <{}> ?predicate ?object .
                OPTIONAL {{
                    BIND(
                        IF(isURI(?object), "uri",
                        IF(isLiteral(?object), "literal", "blank"))
                        AS ?objectType
                    )
                }}
                OPTIONAL {{
                    ?object rdfs:label ?objectLabel .
                    FILTER(isURI(?object))
                }}
            }} LIMIT {}
        "#, uri, limit / 2);
        
        // Query for incoming connections
        let incoming_query = format!(r#"
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            
            SELECT DISTINCT ?subject ?predicate ?subjectLabel WHERE {{
                ?subject ?predicate <{}> .
                OPTIONAL {{
                    ?subject rdfs:label ?subjectLabel .
                }}
            }} LIMIT {}
        "#, uri, limit / 2);
        
        let outgoing_result = self.query(&outgoing_query).await?;
        let incoming_result = self.query(&incoming_query).await?;
        
        let mut nodes = Vec::new();
        let mut edges = Vec::new();
        let mut node_map = HashMap::new();
        
        // Process outgoing connections
        if let Some(bindings) = outgoing_result["results"]["bindings"].as_array() {
            for binding in bindings {
                let predicate = binding["predicate"]["value"].as_str()
                    .ok_or_else(|| RdfEditorError::Sparql("Missing predicate".to_string()))?;
                
                // Skip rdf:type predicates (too noisy)
                if predicate == "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" {
                    continue;
                }
                
                if let Some(object_val) = binding["object"]["value"].as_str() {
                    let object_type = binding["objectType"]["value"].as_str().unwrap_or("uri");
                    
                    if object_type == "uri" && !node_map.contains_key(object_val) {
                        let label = binding["objectLabel"]["value"].as_str().map(|s| s.to_string());
                        let node = GraphNode {
                            uri: object_val.to_string(),
                            label,
                            types: vec![],
                            node_type: NodeType::Instance,
                        };
                        node_map.insert(object_val.to_string(), nodes.len());
                        nodes.push(node);
                    }
                    
                    edges.push(GraphEdge {
                        source: uri.to_string(),
                        target: object_val.to_string(),
                        predicate: predicate.to_string(),
                        label: self.get_short_label(predicate),
                    });
                }
            }
        }
        
        // Process incoming connections
        if let Some(bindings) = incoming_result["results"]["bindings"].as_array() {
            for binding in bindings {
                let subject = binding["subject"]["value"].as_str()
                    .ok_or_else(|| RdfEditorError::Sparql("Missing subject".to_string()))?;
                let predicate = binding["predicate"]["value"].as_str()
                    .ok_or_else(|| RdfEditorError::Sparql("Missing predicate".to_string()))?;
                
                // Skip rdf:type predicates
                if predicate == "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" {
                    continue;
                }
                
                if !node_map.contains_key(subject) {
                    let label = binding["subjectLabel"]["value"].as_str().map(|s| s.to_string());
                    let node = GraphNode {
                        uri: subject.to_string(),
                        label,
                        types: vec![],
                        node_type: NodeType::Instance,
                    };
                    node_map.insert(subject.to_string(), nodes.len());
                    nodes.push(node);
                }
                
                edges.push(GraphEdge {
                    source: subject.to_string(),
                    target: uri.to_string(),
                    predicate: predicate.to_string(),
                    label: self.get_short_label(predicate),
                });
            }
        }
        
        Ok((nodes, edges))
    }
    
    pub async fn search_nodes_by_label(&self, search_term: &str, limit: usize) -> Result<Vec<GraphNode>, RdfEditorError> {
        let query = format!(r#"
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
            
            SELECT DISTINCT ?resource ?label ?type WHERE {{
                ?resource ?labelProp ?label .
                FILTER(?labelProp IN (rdfs:label, skos:prefLabel, skos:altLabel))
                FILTER(CONTAINS(LCASE(STR(?label)), LCASE("{}")))
                OPTIONAL {{ ?resource rdf:type ?type }}
            }} LIMIT {}
        "#, search_term, limit);
        
        let result = self.query(&query).await?;
        let mut nodes = Vec::new();
        let mut node_map: HashMap<String, GraphNode> = HashMap::new();
        
        if let Some(bindings) = result["results"]["bindings"].as_array() {
            for binding in bindings {
                if let Some(resource) = binding["resource"]["value"].as_str() {
                    let entry = node_map.entry(resource.to_string()).or_insert_with(|| {
                        GraphNode {
                            uri: resource.to_string(),
                            label: None,
                            types: vec![],
                            node_type: NodeType::Instance,
                        }
                    });
                    
                    if let Some(label) = binding["label"]["value"].as_str() {
                        if entry.label.is_none() {
                            entry.label = Some(label.to_string());
                        }
                    }
                    
                    if let Some(type_val) = binding["type"]["value"].as_str() {
                        if !entry.types.contains(&type_val.to_string()) {
                            entry.types.push(type_val.to_string());
                        }
                    }
                }
            }
        }
        
        // Update node types and collect results
        for (_, mut node) in node_map {
            node.node_type = self.determine_node_type(&node.types);
            nodes.push(node);
        }
        
        Ok(nodes)
    }
    
    // Helper methods
    
    fn determine_node_type(&self, types: &[String]) -> NodeType {
        let class_types = [
            "http://www.w3.org/2002/07/owl#Class",
            "http://www.w3.org/2000/01/rdf-schema#Class",
            "http://www.w3.org/2004/02/skos/core#Concept",
            "http://www.w3.org/2004/02/skos/core#ConceptScheme",
        ];
        
        let property_types = [
            "http://www.w3.org/2002/07/owl#ObjectProperty",
            "http://www.w3.org/2002/07/owl#DatatypeProperty",
            "http://www.w3.org/2002/07/owl#AnnotationProperty",
            "http://www.w3.org/1999/02/22-rdf-syntax-ns#Property",
        ];
        
        for t in types {
            if class_types.contains(&t.as_str()) {
                return NodeType::Class;
            }
            if property_types.contains(&t.as_str()) {
                return NodeType::Property;
            }
        }
        
        NodeType::Instance
    }
    
    fn get_best_label(&self, labels: &HashMap<String, String>) -> Option<String> {
        // Prefer English, then no language, then any
        labels.get("en")
            .or_else(|| labels.get(""))
            .or_else(|| labels.values().next())
            .cloned()
    }
    
    fn get_short_label(&self, uri: &str) -> Option<String> {
        let parts: Vec<&str> = uri.split(&['#', '/'][..]).collect();
        parts.last().filter(|s| !s.is_empty()).map(|s| s.to_string())
    }
    
    // Existing methods for triple operations
    
    pub async fn add_triple(&self, triple: &Triple, graph: &str) -> Result<(), RdfEditorError> {
        let update = format!(
            "INSERT DATA {{ GRAPH <{}> {{ {} }} }}",
            graph,
            triple.to_sparql_pattern()
        );
        
        self.update(&update).await
    }
    
    pub async fn add_triple_to_default(&self, triple: &Triple) -> Result<(), RdfEditorError> {
        let update = format!(
            "INSERT DATA {{ {} }}",
            triple.to_sparql_pattern()
        );
        
        self.update(&update).await
    }
    
    pub async fn delete_triple(&self, triple: &Triple, graph: &str) -> Result<(), RdfEditorError> {
        let update = format!(
            "DELETE DATA {{ GRAPH <{}> {{ {} }} }}",
            graph,
            triple.to_sparql_pattern()
        );
        
        self.update(&update).await
    }
    
    pub async fn delete_triple_from_default(&self, triple: &Triple) -> Result<(), RdfEditorError> {
        let update = format!(
            "DELETE DATA {{ {} }}",
            triple.to_sparql_pattern()
        );
        
        self.update(&update).await
    }
    
    pub async fn replace_triple(&self, old_triple: &Triple, new_triple: &Triple, graph: &str) -> Result<(), RdfEditorError> {
        let update = format!(
            "DELETE {{ GRAPH <{}> {{ {} }} }} INSERT {{ GRAPH <{}> {{ {} }} }} WHERE {{ GRAPH <{}> {{ {} }} }}",
            graph, old_triple.to_sparql_pattern(),
            graph, new_triple.to_sparql_pattern(),
            graph, old_triple.to_sparql_pattern()
        );
        
        self.update(&update).await
    }
    
    pub async fn replace_triple_in_default(&self, old_triple: &Triple, new_triple: &Triple) -> Result<(), RdfEditorError> {
        let update = format!(
            "DELETE {{ {} }} INSERT {{ {} }} WHERE {{ {} }}",
            old_triple.to_sparql_pattern(),
            new_triple.to_sparql_pattern(),
            old_triple.to_sparql_pattern()
        );
        
        self.update(&update).await
    }
    
    pub async fn add_triples_batch(&self, triples: &[Triple], graph: &str) -> Result<(), RdfEditorError> {
        if triples.is_empty() {
            return Ok(());
        }
        
        let mut update = format!("INSERT DATA {{ GRAPH <{}> {{", graph);
        for triple in triples {
            update.push_str(&format!(" {}", triple.to_sparql_pattern()));
        }
        update.push_str(" } }");
        
        self.update(&update).await
    }
    
    pub async fn delete_triples_batch(&self, triples: &[Triple], graph: &str) -> Result<(), RdfEditorError> {
        if triples.is_empty() {
            return Ok(());
        }
        
        let mut update = format!("DELETE DATA {{ GRAPH <{}> {{", graph);
        for triple in triples {
            update.push_str(&format!(" {}", triple.to_sparql_pattern()));
        }
        update.push_str(" } }");
        
        self.update(&update).await
    }
    
    fn parse_triples_from_results(&self, result: Value, graph: Option<&str>) -> Result<Vec<Triple>, RdfEditorError> {
        let mut triples = Vec::new();
        
        if let Some(bindings) = result["results"]["bindings"].as_array() {
            for binding in bindings {
                let subject = binding["s"]["value"].as_str()
                    .ok_or_else(|| RdfEditorError::Sparql("Missing subject".to_string()))?
                    .to_string();
                
                let predicate = binding["p"]["value"].as_str()
                    .ok_or_else(|| RdfEditorError::Sparql("Missing predicate".to_string()))?
                    .to_string();
                
                let object = self.parse_rdf_node(&binding["o"])?;
                
                triples.push(Triple {
                    subject,
                    predicate,
                    object,
                    graph: graph.map(|s| s.to_string()),
                });
            }
        }
        
        Ok(triples)
    }
    
    fn parse_rdf_node(&self, node: &Value) -> Result<RdfNode, RdfEditorError> {
        let node_type = node["type"].as_str()
            .ok_or_else(|| RdfEditorError::Sparql("Missing node type".to_string()))?;
        
        let value = node["value"].as_str()
            .ok_or_else(|| RdfEditorError::Sparql("Missing node value".to_string()))?
            .to_string();
        
        match node_type {
            "uri" => Ok(RdfNode::Uri { value }),
            "literal" => {
                let datatype = node["datatype"].as_str().map(|s| s.to_string());
                let language = node["xml:lang"].as_str().map(|s| s.to_string());
                Ok(RdfNode::Literal { value, datatype, language })
            },
            "bnode" => Ok(RdfNode::Blank { value }),
            _ => Err(RdfEditorError::Sparql(format!("Unknown node type: {}", node_type))),
        }
    }
}