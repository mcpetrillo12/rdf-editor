use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::fs::{File, OpenOptions};
use tokio::io::{AsyncWriteExt, AsyncBufReadExt, BufReader};
use std::sync::Arc;
use tokio::sync::Mutex;
use crate::error::RdfEditorError;
use crate::models::Triple;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum TransactionType {
    AddTriple,
    DeleteTriple,
    ReplaceTriple,
    AddTriplesBatch,
    DeleteTriplesBatch,
    DropGraph,
    ImportData,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TransactionRecord {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub transaction_type: TransactionType,
    pub graph: Option<String>,
    pub old_data: Option<Vec<Triple>>,
    pub new_data: Option<Vec<Triple>>,
    pub description: String,
    // For future use when we add user authentication
    pub user_id: Option<String>,
    pub user_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TransactionLogEntry {
    pub record: TransactionRecord,
    pub can_undo: bool,
}

pub struct TransactionLogger {
    log_file: Arc<Mutex<File>>,
    batch_mode: Arc<Mutex<bool>>,
    batch_buffer: Arc<Mutex<Vec<TransactionRecord>>>,
}

impl TransactionLogger {
    pub async fn new(log_path: &str) -> Result<Self, RdfEditorError> {
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
            .await
            .map_err(|e| RdfEditorError::Configuration(format!("Failed to open log file: {}", e)))?;
            
        Ok(TransactionLogger {
            log_file: Arc::new(Mutex::new(file)),
            batch_mode: Arc::new(Mutex::new(false)),
            batch_buffer: Arc::new(Mutex::new(Vec::new())),
        })
    }
    
    pub async fn start_batch(&self) {
        let mut batch_mode = self.batch_mode.lock().await;
        *batch_mode = true;
    }
    
    pub async fn end_batch(&self) -> Result<(), RdfEditorError> {
        let mut batch_mode = self.batch_mode.lock().await;
        *batch_mode = false;
        
        // Flush the batch buffer
        let mut buffer = self.batch_buffer.lock().await;
        if !buffer.is_empty() {
            let mut file = self.log_file.lock().await;
            
            // Write all buffered records
            for record in buffer.drain(..) {
                let json = serde_json::to_string(&record)
                    .map_err(|e| RdfEditorError::Serialization(e))?;
                file.write_all(format!("{}\n", json).as_bytes()).await
                    .map_err(|e| RdfEditorError::Configuration(format!("Failed to write log: {}", e)))?;
            }
            
            file.flush().await
                .map_err(|e| RdfEditorError::Configuration(format!("Failed to flush log: {}", e)))?;
        }
        
        Ok(())
    }
    
    pub async fn log_add_triple(
        &self,
        graph: Option<&str>,
        triple: &Triple,
        user_id: Option<&str>,
    ) -> Result<String, RdfEditorError> {
        let record = TransactionRecord {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            transaction_type: TransactionType::AddTriple,
            graph: graph.map(String::from),
            old_data: None,
            new_data: Some(vec![triple.clone()]),
            description: format!("Added triple: {}", triple.to_sparql_pattern()),
            user_id: user_id.map(String::from),
            user_name: None,
        };
        
        self.write_record(record).await
    }
    
    pub async fn log_delete_triple(
        &self,
        graph: Option<&str>,
        triple: &Triple,
        user_id: Option<&str>,
    ) -> Result<String, RdfEditorError> {
        let record = TransactionRecord {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            transaction_type: TransactionType::DeleteTriple,
            graph: graph.map(String::from),
            old_data: Some(vec![triple.clone()]),
            new_data: None,
            description: format!("Deleted triple: {}", triple.to_sparql_pattern()),
            user_id: user_id.map(String::from),
            user_name: None,
        };
        
        self.write_record(record).await
    }
    
    pub async fn log_replace_triple(
        &self,
        graph: Option<&str>,
        old_triple: &Triple,
        new_triple: &Triple,
        user_id: Option<&str>,
    ) -> Result<String, RdfEditorError> {
        let record = TransactionRecord {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            transaction_type: TransactionType::ReplaceTriple,
            graph: graph.map(String::from),
            old_data: Some(vec![old_triple.clone()]),
            new_data: Some(vec![new_triple.clone()]),
            description: format!(
                "Replaced triple: {} -> {}",
                old_triple.to_sparql_pattern(),
                new_triple.to_sparql_pattern()
            ),
            user_id: user_id.map(String::from),
            user_name: None,
        };
        
        self.write_record(record).await
    }
    
    pub async fn log_batch_operation(
        &self,
        transaction_type: TransactionType,
        graph: Option<&str>,
        old_triples: Option<&[Triple]>,
        new_triples: Option<&[Triple]>,
        description: &str,
        user_id: Option<&str>,
    ) -> Result<String, RdfEditorError> {
        let record = TransactionRecord {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            transaction_type,
            graph: graph.map(String::from),
            old_data: old_triples.map(|t| t.to_vec()),
            new_data: new_triples.map(|t| t.to_vec()),
            description: description.to_string(),
            user_id: user_id.map(String::from),
            user_name: None,
        };
        
        self.write_record(record).await
    }
    
    async fn write_record(&self, record: TransactionRecord) -> Result<String, RdfEditorError> {
        let id = record.id.clone();
        
        let batch_mode = self.batch_mode.lock().await;
        if *batch_mode {
            // In batch mode, buffer the records
            let mut buffer = self.batch_buffer.lock().await;
            buffer.push(record);
        } else {
            // Write immediately
            let mut file = self.log_file.lock().await;
            let json = serde_json::to_string(&record)
                .map_err(|e| RdfEditorError::Serialization(e))?;
            file.write_all(format!("{}\n", json).as_bytes()).await
                .map_err(|e| RdfEditorError::Configuration(format!("Failed to write log: {}", e)))?;
            file.flush().await
                .map_err(|e| RdfEditorError::Configuration(format!("Failed to flush log: {}", e)))?;
        }
        
        Ok(id)
    }
    
    // Read recent transactions for undo functionality
    pub async fn get_recent_transactions(&self, limit: usize) -> Result<Vec<TransactionLogEntry>, RdfEditorError> {
        let file = tokio::fs::File::open("transaction_log.jsonl").await
            .map_err(|e| RdfEditorError::Configuration(format!("Failed to open log for reading: {}", e)))?;
        let reader = BufReader::new(file);
        let mut lines = reader.lines();
        
        let mut records = Vec::new();
        while let Some(line) = lines.next_line().await
            .map_err(|e| RdfEditorError::Configuration(format!("Failed to read log line: {}", e)))? {
            if let Ok(record) = serde_json::from_str::<TransactionRecord>(&line) {
                records.push(record);
            }
        }
        
        // Return the most recent transactions
        let recent: Vec<TransactionLogEntry> = records
            .into_iter()
            .rev()
            .take(limit)
            .map(|record| {
                let can_undo = matches!(
                    record.transaction_type,
                    TransactionType::AddTriple | 
                    TransactionType::DeleteTriple | 
                    TransactionType::ReplaceTriple
                );
                TransactionLogEntry { record, can_undo }
            })
            .collect();
            
        Ok(recent)
    }
}