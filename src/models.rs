use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Triple {
    pub subject: String,
    pub predicate: String,
    pub object: RdfNode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub graph: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum RdfNode {
    Uri { value: String },
    Literal { 
        value: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        datatype: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        language: Option<String>,
    },
    Blank { value: String },
}

// Graph visualization models

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphNode {
    pub uri: String,
    pub label: Option<String>,
    pub types: Vec<String>,
    pub node_type: NodeType,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub predicate: String,
    pub label: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "lowercase")]
pub enum NodeType {
    Class,
    Property,
    Instance,
    Literal,
}

#[derive(Debug, Deserialize)]
pub struct GraphSearchRequest {
    pub query: String,
    #[serde(default = "default_search_limit")]
    pub limit: usize,
}

#[derive(Debug, Deserialize)]
pub struct GraphExpandRequest {
    pub uri: String,
    #[serde(default = "default_expansion_limit")]
    pub limit: usize,
}

#[derive(Debug, Serialize)]
pub struct GraphDataResponse {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

#[derive(Debug, Deserialize)]
pub struct GraphPathRequest {
    pub from: String,
    pub to: String,
    #[serde(default = "default_path_depth")]
    pub max_depth: usize,
}

#[derive(Debug, Serialize)]
pub struct GraphPath {
    pub nodes: Vec<String>,
    pub edges: Vec<GraphEdge>,
    pub length: usize,
}

fn default_search_limit() -> usize {
    10
}

fn default_expansion_limit() -> usize {
    50
}

fn default_path_depth() -> usize {
    5
}

// Query and update models

#[derive(Debug, Deserialize)]
pub struct SparqlQuery {
    pub query: String,
    #[serde(default)]
    pub graph: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PaginatedQuery {
    pub query: String,
    #[serde(default)]
    pub graph: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: usize,
    #[serde(default)]
    pub offset: usize,
}

fn default_limit() -> usize {
    100
}

#[derive(Debug, Deserialize)]
pub struct SparqlUpdate {
    pub update: String,
    #[serde(default)]
    pub graph: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct QueryResponse {
    pub results: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub total: Option<usize>,
    pub limit: usize,
    pub offset: usize,
    pub has_more: bool,
}

#[derive(Debug, Serialize)]
pub struct UpdateResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct AddTripleRequest {
    pub subject: String,
    pub predicate: String,
    pub object: RdfNode,
}

#[derive(Debug, Deserialize)]
pub struct DeleteTripleRequest {
    pub subject: String,
    pub predicate: String,
    pub object: RdfNode,
}

#[derive(Debug, Deserialize)]
pub struct ReplaceTripleRequest {
    pub old_triple: Triple,
    pub new_triple: Triple,
}

#[derive(Debug, Deserialize)]
pub struct BatchTripleRequest {
    pub triples: Vec<Triple>,
}

#[derive(Debug, Serialize)]
pub struct BatchOperationResponse {
    pub success: bool,
    pub processed: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Namespace {
    pub prefix: String,
    pub uri: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NamespaceList {
    pub namespaces: Vec<Namespace>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum RdfFormat {
    Turtle,
    NTriples,
    JsonLd,
    RdfXml,
}

impl RdfFormat {
    pub fn content_type(&self) -> &'static str {
        match self {
            RdfFormat::Turtle => "text/turtle",
            RdfFormat::NTriples => "application/n-triples",
            RdfFormat::JsonLd => "application/ld+json",
            RdfFormat::RdfXml => "application/rdf+xml",
        }
    }
    
    pub fn file_extension(&self) -> &'static str {
        match self {
            RdfFormat::Turtle => "ttl",
            RdfFormat::NTriples => "nt",
            RdfFormat::JsonLd => "jsonld",
            RdfFormat::RdfXml => "rdf",
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct ExportRequest {
    pub graph: Option<String>,
    pub format: RdfFormat,
}

#[derive(Debug, Deserialize)]
pub struct ImportRequest {
    pub graph: String,
    pub format: RdfFormat,
    pub data: String,
}

impl Triple {
    pub fn to_sparql_pattern(&self) -> String {
        let object_str = match &self.object {
            RdfNode::Uri { value } => format!("<{}>", value),
            RdfNode::Literal { value, datatype, language } => {
                let escaped_value = crate::validation::sanitize_literal_value(value);
                let mut lit = format!("\"{}\"", escaped_value);
                if let Some(lang) = language {
                    lit.push_str(&format!("@{}", lang));
                } else if let Some(dt) = datatype {
                    lit.push_str(&format!("^^<{}>", dt));
                }
                lit
            },
            RdfNode::Blank { value } => format!("_:{}", value),
        };
        
        format!("<{}> <{}> {}", self.subject, self.predicate, object_str)
    }
}