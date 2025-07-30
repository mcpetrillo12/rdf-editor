use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use chrono::{DateTime, Utc, Duration};
use serde::{Serialize, Deserialize};
use crate::models::{GraphNode, GraphEdge};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedItem<T> {
    pub data: T,
    pub cached_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

impl<T> CachedItem<T> {
    fn new(data: T, ttl_seconds: i64) -> Self {
        let now = Utc::now();
        CachedItem {
            data,
            cached_at: now,
            expires_at: now + Duration::seconds(ttl_seconds),
        }
    }
    
    fn is_expired(&self) -> bool {
        Utc::now() > self.expires_at
    }
}

pub struct Cache<K, V> 
where 
    K: Eq + std::hash::Hash + Clone,
    V: Clone,
{
    data: Arc<RwLock<HashMap<K, CachedItem<V>>>>,
    ttl_seconds: i64,
}

impl<K, V> Cache<K, V> 
where 
    K: Eq + std::hash::Hash + Clone,
    V: Clone,
{
    pub fn new(ttl_seconds: i64) -> Self {
        Cache {
            data: Arc::new(RwLock::new(HashMap::new())),
            ttl_seconds,
        }
    }
    
    pub async fn get(&self, key: &K) -> Option<V> {
        let cache = self.data.read().await;
        if let Some(item) = cache.get(key) {
            if !item.is_expired() {
                return Some(item.data.clone());
            }
        }
        None
    }
    
    pub async fn set(&self, key: K, value: V) {
        let mut cache = self.data.write().await;
        cache.insert(key, CachedItem::new(value, self.ttl_seconds));
    }
    
    pub async fn invalidate(&self, key: &K) {
        let mut cache = self.data.write().await;
        cache.remove(key);
    }
    
    pub async fn clear(&self) {
        let mut cache = self.data.write().await;
        cache.clear();
    }
    
    pub async fn cleanup_expired(&self) {
        let mut cache = self.data.write().await;
        cache.retain(|_, item| !item.is_expired());
    }
    
    pub async fn size(&self) -> usize {
        let cache = self.data.read().await;
        cache.len()
    }
}

// Specific cache types for our use cases
pub type LabelCache = Cache<String, Vec<(String, Option<String>, String)>>; // URI -> [(label, lang, property)]
pub type TypeCache = Cache<String, Vec<String>>; // URI -> [types]
pub type QueryCache = Cache<String, serde_json::Value>; // Query hash -> Results

// Graph-specific caches
pub type NodeCache = Cache<String, GraphNode>; // URI -> GraphNode
pub type ConnectionCache = Cache<String, (Vec<GraphNode>, Vec<GraphEdge>)>; // URI -> (nodes, edges)
pub type PathCache = Cache<(String, String), Option<Vec<String>>>; // (from, to) -> path nodes

// Graph cache manager
pub struct GraphCacheManager {
    pub nodes: Arc<NodeCache>,
    pub connections: Arc<ConnectionCache>,
    pub paths: Arc<PathCache>,
    pub search_results: Arc<Cache<String, Vec<GraphNode>>>, // search term -> results
}

impl GraphCacheManager {
    pub fn new(ttl_seconds: i64) -> Self {
        GraphCacheManager {
            nodes: Arc::new(NodeCache::new(ttl_seconds)),
            connections: Arc::new(ConnectionCache::new(ttl_seconds)),
            paths: Arc::new(PathCache::new(ttl_seconds)),
            search_results: Arc::new(Cache::new(ttl_seconds)),
        }
    }
    
    pub async fn invalidate_node(&self, uri: &str) {
        // When a node changes, invalidate related caches
        self.nodes.invalidate(&uri.to_string()).await;
        self.connections.invalidate(&uri.to_string()).await;
        
        // Invalidate any paths containing this node
        // In production, you might want to track this more efficiently
        self.paths.clear().await;
    }
    
    pub async fn cleanup_all(&self) {
        self.nodes.cleanup_expired().await;
        self.connections.cleanup_expired().await;
        self.paths.cleanup_expired().await;
        self.search_results.cleanup_expired().await;
    }
    
    pub async fn get_stats(&self) -> GraphCacheStats {
        GraphCacheStats {
            node_cache_size: self.nodes.size().await,
            connection_cache_size: self.connections.size().await,
            path_cache_size: self.paths.size().await,
            search_cache_size: self.search_results.size().await,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct GraphCacheStats {
    pub node_cache_size: usize,
    pub connection_cache_size: usize,
    pub path_cache_size: usize,
    pub search_cache_size: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_cache_expiration() {
        let cache: Cache<String, String> = Cache::new(1); // 1 second TTL
        
        cache.set("key".to_string(), "value".to_string()).await;
        
        // Should be available immediately
        assert_eq!(cache.get(&"key".to_string()).await, Some("value".to_string()));
        
        // Wait for expiration
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        
        // Should be expired
        assert_eq!(cache.get(&"key".to_string()).await, None);
    }
    
    #[tokio::test]
    async fn test_cache_cleanup() {
        let cache: Cache<String, String> = Cache::new(1);
        
        cache.set("key1".to_string(), "value1".to_string()).await;
        cache.set("key2".to_string(), "value2".to_string()).await;
        
        assert_eq!(cache.size().await, 2);
        
        // Wait for expiration
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        
        // Cleanup expired items
        cache.cleanup_expired().await;
        
        assert_eq!(cache.size().await, 0);
    }
}