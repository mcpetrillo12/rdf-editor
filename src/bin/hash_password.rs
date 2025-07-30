use std::env;
use base64::{Engine as _, engine::general_purpose};

fn main() {
    let args: Vec<String> = env::args().collect();
    
    if args.len() != 2 {
        eprintln!("Usage: {} <password>", args[0]);
        eprintln!("Example: {} mySecretPassword", args[0]);
        std::process::exit(1);
    }
    
    let password = &args[1];
    let encoded = general_purpose::STANDARD.encode(password.as_bytes());
    
    println!("Original password: {}", password);
    println!("Base64 encoded: {}", encoded);
    println!("\nAdd this to your .env file:");
    println!("SPARQL_PASSWORD_HASHED={}", encoded);
}