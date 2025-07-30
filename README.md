# RDF Editor

A modern web-based RDF data editor with powerful graph visualization capabilities. Built with Rust (Actix Web) backend and vanilla JavaScript frontend with Cytoscape.js for interactive graph exploration.

![RDF Editor Screenshot](screenshot.png)

## Features

### Core Functionality
- 🔍 **SPARQL Query Execution** - Execute SELECT, CONSTRUCT, ASK, and DESCRIBE queries
- 📝 **Triple Editing** - Full CRUD operations on RDF triples
- 📊 **Interactive Graph Visualization** - Explore RDF data as an interactive node-link diagram
- 🏷️ **Namespace Management** - Define and use custom namespace prefixes
- 🔄 **Transaction History** - Track changes with undo capabilities
- 📦 **Import/Export** - Support for multiple RDF formats
- ⚡ **Performance Caching** - Intelligent caching for queries and graph data

### Graph Visualization (New!)
- **Dynamic Graph Building** - Start with a single node and expand connections
- **Multiple Layouts** - Force-directed, hierarchical, concentric, and grid layouts
- **Smart Node Styling** - Visual distinction between classes, properties, and instances
- **Bulk Visualization** - Send query results or entire graphs to the visualization
- **Path Finding** - Discover connections between nodes (coming in Phase 3)

## Quick Start

### Prerequisites
- Rust 1.70+ and Cargo
- A SPARQL endpoint (Stardog, Fuseki, GraphDB, Virtuoso, etc.)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/rdf-editor.git
cd rdf-editor
```

2. **Set up environment**
```bash
cp .env.example .env
# Edit .env with your SPARQL endpoint details
```

3. **Build and run**
```bash
cargo run
```

4. **Open in browser**
```
http://localhost:8080
```

## Configuration

### Basic Configuration

```bash
# Required
SPARQL_ENDPOINT=https://localhost:5820/myDatabase/query

# Authentication (if needed)
SPARQL_USERNAME=admin
SPARQL_PASSWORD=admin

# Server
PORT=8080
HOST=127.0.0.1
```

### Graph Visualization Settings

```bash
# Control graph complexity
GRAPH_MAX_NODES=500         # Maximum nodes to display
GRAPH_MAX_EDGES=1000        # Maximum edges to display
GRAPH_EXPANSION_LIMIT=50    # Nodes added per expansion
GRAPH_SEARCH_LIMIT=10       # Search result limit
```

### Advanced Options

See `.env.example` for all configuration options including:
- SSL verification settings
- Cache configuration
- CORS settings
- API authentication
- Request timeouts and retries

## Usage Guide

### Query Tab
Execute SPARQL queries with namespace support:
1. Define prefixes in the Namespaces tab
2. Write your query (prefixes are auto-prepended)
3. Click "Execute Query"
4. Use "Visualize" button to see results as a graph

### Browse & Edit Tab
Browse and modify RDF data:
1. Select a graph from the dropdown
2. Filter by resource type (Classes, Properties, Instances)
3. Enable editing mode to modify triples
4. Click "Visualize Graph" to see the entire graph

### Graph Tab (New!)
Interactive graph exploration:
1. **Search** - Find nodes by URI or label
2. **Expand** - Click nodes to show their connections
3. **Layout** - Choose from multiple layout algorithms
4. **Visualize** - Send data from Query/Browse tabs

### Keyboard Shortcuts
- `Ctrl/Cmd + Enter` - Execute query
- `Alt + 1/2/3/4/5` - Switch tabs
- `Escape` - Close dialogs

## API Reference

### Core Endpoints

#### Query Operations
```http
POST /api/query
Content-Type: application/json

{
  "query": "SELECT * WHERE { ?s ?p ?o } LIMIT 10",
  "graph": "http://example.com/graph" // optional
}
```

#### Triple Operations
```http
# Get triples
GET /api/graph/{graph_name}/triples

# Add triple
POST /api/graph/{graph_name}/triple
{
  "subject": "http://example.com/subject",
  "predicate": "http://example.com/predicate", 
  "object": {
    "type": "uri",
    "value": "http://example.com/object"
  }
}

# Delete triple
DELETE /api/graph/{graph_name}/triple

# Replace triple
PUT /api/graph/{graph_name}/triple/replace
```

### Graph Visualization Endpoints

#### Search Nodes
```http
POST /api/graph/search
{
  "query": "Person",
  "limit": 10
}
```

#### Expand Node
```http
POST /api/graph/expand
{
  "uri": "http://example.com/Person",
  "limit": 50
}
```

#### Get Node Info
```http
GET /api/graph/node/{encoded_uri}
```

#### Find Path (Coming Soon)
```http
POST /api/graph/path
{
  "from": "http://example.com/nodeA",
  "to": "http://example.com/nodeB",
  "max_depth": 5
}
```

## Architecture

### Backend (Rust)
- **Framework**: Actix Web 4
- **SPARQL Client**: Custom implementation with retry logic
- **Caching**: In-memory caching with TTL
- **Validation**: Input sanitization and SPARQL injection prevention

### Frontend (JavaScript)
- **Graph Visualization**: Cytoscape.js
- **UI**: Vanilla JavaScript with modern ES6+
- **Styling**: Custom CSS with responsive design

### Data Flow
```
Browser ←→ Actix Web Server ←→ SPARQL Endpoint
   ↓             ↓                    ↓
   UI         Cache Layer         Triple Store
```

## Development

### Project Structure
```
rdf-editor/
├── src/
│   ├── main.rs              # Application entry
│   ├── config.rs            # Configuration management
│   ├── handlers/            # HTTP request handlers
│   │   ├── query.rs         # Query & graph endpoints
│   │   ├── update.rs        # Triple modifications
│   │   └── ...
│   ├── models.rs            # Data structures
│   └── cache.rs             # Caching system
├── static/
│   ├── index.html           # Main UI
│   ├── app.js               # Frontend logic
│   └── style.css            # Styling
└── Cargo.toml               # Dependencies
```

### Adding New Features

1. **Backend**: Add handler in `src/handlers/`, update `main.rs` routes
2. **Frontend**: Update `static/app.js` and `index.html`
3. **Models**: Define structures in `src/models.rs`
4. **Caching**: Extend `src/cache.rs` for new data types

### Testing

```bash
# Run tests
cargo test

# Run with debug logging
RUST_LOG=debug cargo run

# Check code
cargo clippy
cargo fmt
```

## Troubleshooting

### Connection Issues
- Verify SPARQL endpoint URL format
- Check authentication credentials
- For SSL issues, set `VERIFY_SSL=false` (dev only)

### Performance
- Adjust cache settings (`CACHE_TTL`, `CACHE_MAX_ENTRIES`)
- Limit graph visualization (`GRAPH_MAX_NODES`, `GRAPH_MAX_EDGES`)
- Use pagination for large datasets

### Common Errors
- **404 on queries**: Check if update endpoint differs from query endpoint
- **Graph too large**: Reduce expansion limits
- **Timeout errors**: Increase `SPARQL_TIMEOUT`

## Roadmap

### Phase 1 ✅ - Basic Graph Visualization
- Node search and expansion
- Multiple layout algorithms
- Integration with Query/Browse tabs

### Phase 2 (In Progress) - Enhanced Interaction
- Right-click context menus
- Advanced filtering
- Node grouping/clustering

### Phase 3 (Planned) - Advanced Features
- Path highlighting between nodes
- Multi-class instance styling
- Inferred vs asserted relationship visualization
- Warning indicators for data quality issues

### Phase 4 (Future) - Power User Features
- Debug mode for ontology validation
- Graph statistics and analytics
- Export visualizations (PNG, SVG, GraphML)
- Save/load graph states
- Minimap for large graphs

## Performance Considerations

### Graph Visualization
- **Initial Load**: Graphs start empty, nodes added on demand
- **Expansion Limits**: Configurable limits prevent UI overload
- **Layout Performance**: Force-directed best for <100 nodes, hierarchical for trees
- **Caching**: Node information cached to reduce SPARQL queries

### Large Datasets
- Use pagination in Browse tab
- Apply filters before visualizing
- Consider using graph sampling queries
- Increase server resources if needed

## Security

### Authentication
- Basic Auth support for SPARQL endpoints
- Optional API key authentication
- Password hashing for secure storage

### Input Validation
- URI validation prevents injection
- Literal values properly escaped
- Query size limits enforced

### CORS Configuration
- Configurable allowed origins
- Credentials support for authenticated endpoints

## Examples

### Example 1: Visualizing an Ontology
```sparql
# Query to get class hierarchy
SELECT ?class ?superclass WHERE {
  ?class rdfs:subClassOf ?superclass .
}
```
Click "Visualize" to see the class hierarchy as a graph.

### Example 2: Exploring Instance Data
1. Go to Browse tab
2. Select your data graph
3. Filter to show only instances
4. Click "Visualize Graph"
5. Click on nodes to explore connections

### Example 3: Finding Connections
1. Go to Graph tab
2. Search for "Person"
3. Click on the Person node
4. Continue clicking to explore relationships
5. Change layout to "Hierarchical" for better organization

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup
```bash
# Install development dependencies
cargo install cargo-watch

# Run with auto-reload
cargo watch -x run

# Format code
cargo fmt

# Run linter
cargo clippy -- -D warnings
```

### Submitting Changes
1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Cytoscape.js](https://js.cytoscape.org/) for graph visualization
- [Actix Web](https://actix.rs/) for the web framework
- The RDF and Semantic Web community

## Support

- **Documentation**: See `/docs` folder
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Email**: support@example.com

---

## Appendix: Supported SPARQL Endpoints

### Tested With
- **Stardog** 7.x, 8.x
- **Apache Jena Fuseki** 3.x, 4.x
- **GraphDB** 9.x, 10.x
- **Virtuoso** 7.x
- **Amazon Neptune**
- **Blazegraph**

### Endpoint URL Formats

#### Stardog
```
Query: https://localhost:5820/{database}/query
Update: https://localhost:5820/{database}/update
```

#### Fuseki
```
Query: http://localhost:3030/{dataset}/query
Update: http://localhost:3030/{dataset}/update
```

#### GraphDB
```
Query: http://localhost:7200/repositories/{repository}
Update: http://localhost:7200/repositories/{repository}/statements
```

#### Virtuoso
```
Query/Update: http://localhost:8890/sparql
```

## Appendix: Troubleshooting Graph Visualization

### Issue: Graph is too cluttered
**Solutions:**
- Use filters to show only specific node types
- Adjust layout algorithm (try Hierarchical)
- Reduce expansion limit in settings
- Use the search to focus on specific nodes

### Issue: Nodes overlap
**Solutions:**
- Change layout to "Force Directed" and wait for stabilization
- Manually drag nodes to better positions
- Increase spacing in layout options

### Issue: Can't find specific nodes
**Solutions:**
- Use search with partial labels
- Check if node has a label (some may only show URIs)
- Try searching by URI fragment

### Issue: Performance is slow
**Solutions:**
- Reduce `GRAPH_MAX_NODES` and `GRAPH_MAX_EDGES`
- Clear the graph and start with fewer nodes
- Enable caching if not already enabled
- Use Chrome/Firefox for best performance

## Version History

### v1.2.0 (Current)
- Added interactive graph visualization
- Bulk triple visualization from Query/Browse tabs
- Improved caching system
- Enhanced configuration options

### v1.1.0
- Transaction history with undo
- Batch operations
- Import/export functionality
- Performance improvements

### v1.0.0
- Initial release
- Basic SPARQL query execution
- Triple CRUD operations
- Namespace management