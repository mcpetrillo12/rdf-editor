// Combined Query + Browse Tab Functions
let combinedGraph = null;
let combinedGraphTriples = [];
let combinedQueryResults = null;

// Toggle query section visibility
function toggleQuerySection() {
    const content = document.getElementById('query-section-content');
    const icon = document.getElementById('query-toggle-icon');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▼';
    } else {
        content.style.display = 'none';
        icon.textContent = '▶';
    }
}

// Execute query in combined tab
async function executeCombinedQuery() {
    const queryInput = document.getElementById('combined-query-input');
    const query = queryInput.value;
    const selectedGraph = document.getElementById('combined-query-graph').value;
    const resultsDiv = document.getElementById('combined-query-results');
    const fullQueryDiv = document.getElementById('combined-full-query');
    const showPrefixes = document.getElementById('combined-show-prefixes').checked;
    
    // Prepend namespace prefixes
    const namespaces = getNamespaces();
    let prefixedQuery = '';
    namespaces.forEach(ns => {
        prefixedQuery += `PREFIX ${ns.prefix}: <${ns.uri}>\n`;
    });
    if (namespaces.length > 0) {
        prefixedQuery += '\n';
    }
    prefixedQuery += query;
    
    // Show the full query if checkbox is checked
    if (showPrefixes) {
        fullQueryDiv.innerHTML = '<strong>Query with prefixes:</strong>\n' + escapeHtml(prefixedQuery);
        fullQueryDiv.style.display = 'block';
    }
    
    resultsDiv.innerHTML = '<div class="loading">Executing query</div>';
    
    try {
        const requestBody = { query: prefixedQuery };
        if (selectedGraph) {
            requestBody.graph = selectedGraph;
        }
        
        const response = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        combinedQueryResults = data.results[0];
        displayCombinedQueryResults(data.results[0]);
        
        // Show load button if results could be triples
        const loadButton = document.getElementById('load-into-browse');
        if (combinedQueryResults && combinedQueryResults.results && combinedQueryResults.results.bindings && 
            combinedQueryResults.results.bindings.length > 0 && combinedQueryResults.head && combinedQueryResults.head.vars) {
            
            const vars = combinedQueryResults.head.vars;
            if ((vars.includes('s') && vars.includes('p') && vars.includes('o')) || vars.length === 3) {
                loadButton.style.display = 'inline-block';
            } else {
                loadButton.style.display = 'none';
            }
        }
        
    } catch (error) {
        resultsDiv.innerHTML = `<div class="message error">Error: ${error.message}</div>`;
        document.getElementById('load-into-browse').style.display = 'none';
    }
}

// Display query results in combined tab
function displayCombinedQueryResults(results) {
    const resultsDiv = document.getElementById('combined-query-results');
    
    if (!results || !results.results || !results.results.bindings || results.results.bindings.length === 0) {
        resultsDiv.innerHTML = '<div class="message">No results found.</div>';
        return;
    }
    
    const bindings = results.results.bindings;
    const vars = results.head.vars;
    
    let html = `
        <p>Found ${bindings.length} results</p>
        <table>
            <thead>
                <tr>
                    ${vars.map(v => `<th>${v}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
    `;
    
    bindings.forEach(binding => {
        html += '<tr>';
        vars.forEach(v => {
            if (binding[v]) {
                const value = binding[v].value;
                const type = binding[v].type;
                html += `<td><code class="${type}">${escapeHtml(value)}</code></td>`;
            } else {
                html += '<td>-</td>';
            }
        });
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    resultsDiv.innerHTML = html;
}

// Load query results into browse section
function loadResultsIntoBrowse() {
    if (!combinedQueryResults || !combinedQueryResults.results || !combinedQueryResults.results.bindings) {
        alert('No query results to load');
        return;
    }
    
    const vars = combinedQueryResults.head.vars;
    let subjectVar, predicateVar, objectVar;
    
    if (vars.includes('s') && vars.includes('p') && vars.includes('o')) {
        subjectVar = 's';
        predicateVar = 'p';
        objectVar = 'o';
    } else if (vars.length === 3) {
        subjectVar = vars[0];
        predicateVar = vars[1];
        objectVar = vars[2];
    } else {
        alert('Cannot determine which columns represent subject, predicate, and object');
        return;
    }
    
    combinedGraphTriples = [];
    
    combinedQueryResults.results.bindings.forEach(binding => {
        if (binding[subjectVar] && binding[predicateVar] && binding[objectVar]) {
            const triple = {
                subject: binding[subjectVar].value,
                predicate: binding[predicateVar].value,
                object: convertSparqlNodeToRdfNode(binding[objectVar]),
                graph: binding.g ? binding.g.value : null
            };
            combinedGraphTriples.push(triple);
        }
    });
    
    if (combinedGraphTriples.length === 0) {
        alert('No valid triples found in query results');
        return;
    }
    
    // Update the graph selector to show query results
    const graphSelect = document.getElementById('combined-graph-select');
    const queryOption = Array.from(graphSelect.options).find(opt => opt.value === 'query-results');
    if (!queryOption) {
        const newOption = document.createElement('option');
        newOption.value = 'query-results';
        newOption.textContent = 'Query Results';
        graphSelect.insertBefore(newOption, graphSelect.firstChild.nextSibling);
    }
    graphSelect.value = 'query-results';
    
    combinedGraph = 'query-results';
    displayCombinedFilteredTriples();
    
    // Minimize query section
    document.getElementById('query-section-content').style.display = 'none';
    document.getElementById('query-toggle-icon').textContent = '▶';
}

// Load graphs for combined tab
async function loadGraphsForCombined() {
    const query = 'SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s ?p ?o } }';
    
    try {
        const response = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
        });
        
        const data = await response.json();
        updateCombinedGraphDropdowns(data.results[0]);
    } catch (error) {
        console.error('Error loading graphs:', error);
    }
}

// Update dropdowns in combined tab
function updateCombinedGraphDropdowns(results) {
    const queryGraphSelect = document.getElementById('combined-query-graph');
    const browseGraphSelect = document.getElementById('combined-graph-select');
    
    // Update query graph dropdown
    if (queryGraphSelect) {
        queryGraphSelect.innerHTML = '<option value="">Default Graph</option>';
        
        if (results && results.results && results.results.bindings) {
            results.results.bindings.forEach(binding => {
                const graphUri = binding.g.value;
                const option = new Option(graphUri, graphUri);
                queryGraphSelect.add(option);
            });
        }
    }
    
    // Update browse graph dropdown
    if (browseGraphSelect) {
        let options = '<option value="">Select a graph...</option>';
        if (browseGraphSelect.querySelector('[value="query-results"]')) {
            options = '<option value="">Select a graph...</option><option value="query-results">Query Results</option>';
        }
        options += '<option value="default">Default Graph</option>';
        
        if (results && results.results && results.results.bindings) {
            results.results.bindings.forEach(binding => {
                const graphUri = binding.g.value;
                options += `<option value="${escapeHtml(graphUri)}">${escapeHtml(graphUri)}</option>`;
            });
        }
        
        browseGraphSelect.innerHTML = options;
    }
}

// Load selected graph in combined tab
async function loadSelectedCombinedGraph() {
    const graphSelect = document.getElementById('combined-graph-select');
    const selectedGraph = graphSelect.value;
    
    if (!selectedGraph) {
        document.getElementById('combined-browse-results').innerHTML = '';
        return;
    }
    
    combinedGraph = selectedGraph;
    
    if (selectedGraph === 'query-results') {
        displayCombinedFilteredTriples();
    } else {
        const resultsDiv = document.getElementById('combined-browse-results');
        resultsDiv.innerHTML = '<div class="loading">Loading triples</div>';
        
        try {
            const encodedGraph = selectedGraph === 'default' ? 'default' : encodeURIComponent(selectedGraph);
            
            const response = await fetch(`${API_BASE}/graph/${encodedGraph}/triples`);
            const triples = await response.json();
            
            combinedGraphTriples = triples;
            displayCombinedFilteredTriples();
        } catch (error) {
            resultsDiv.innerHTML = `<div class="message error">Error loading triples: ${error.message}</div>`;
        }
    }
}

// Display filtered triples in combined tab
function displayCombinedFilteredTriples() {
    const showClasses = document.getElementById('combined-filter-classes').checked;
    const showProperties = document.getElementById('combined-filter-properties').checked;
    const showInstances = document.getElementById('combined-filter-instances').checked;
    
    const subjects = [...new Set(combinedGraphTriples.map(t => t.subject))];
    
    const filteredSubjects = subjects.filter(subject => {
        const category = getResourceCategory(subject);
        return (category === 'class' && showClasses) ||
               (category === 'property' && showProperties) ||
               (category === 'instance' && showInstances) ||
               (category === 'shacl' && showClasses);
    });
    
    const filteredTriples = combinedGraphTriples.filter(t => 
        filteredSubjects.includes(t.subject)
    );
    
    // Use the enhanced displayTriples function
    displayTriples(filteredTriples, document.getElementById('combined-browse-results'));
}

// Filter combined triples
function filterCombinedTriples() {
    displayCombinedFilteredTriples();
}

// Toggle combined label display
function toggleCombinedLabelDisplay() {
    document.getElementById('show-labels').checked = document.getElementById('combined-show-labels').checked;
    displayCombinedFilteredTriples();
}

// Toggle combined edit mode
function toggleCombinedEditMode() {
    const editingEnabled = document.getElementById('combined-enable-editing').checked;
    const addTripleSection = document.getElementById('combined-add-triple-section');
    
    if (editingEnabled && combinedGraph && combinedGraph !== 'query-results') {
        addTripleSection.style.display = 'block';
    } else {
        addTripleSection.style.display = 'none';
    }
    
    displayCombinedFilteredTriples();
}

// Toggle combined prefix display
function toggleCombinedPrefixDisplay() {
    const fullQueryDiv = document.getElementById('combined-full-query');
    const showPrefixes = document.getElementById('combined-show-prefixes').checked;
    
    if (!showPrefixes) {
        fullQueryDiv.style.display = 'none';
    }
}

// Update combined object input
function updateCombinedObjectInput() {
    const type = document.getElementById('combined-add-object-type').value;
    const literalOptions = document.getElementById('combined-literal-options');
    const valueInput = document.getElementById('combined-add-object-value');
    
    if (type === 'literal') {
        literalOptions.style.display = 'block';
        valueInput.placeholder = 'Enter literal value';
    } else {
        literalOptions.style.display = 'none';
        if (type === 'uri') {
            valueInput.placeholder = 'http://example.com/object';
        } else {
            valueInput.placeholder = 'b1';
        }
    }
}

// Add triple from combined tab
async function addTripleFromCombined() {
    if (!combinedGraph || combinedGraph === 'query-results') {
        alert('Please select a real graph to add triples to.');
        return;
    }
    
    const subject = document.getElementById('combined-add-subject').value;
    const predicate = document.getElementById('combined-add-predicate').value;
    const objectType = document.getElementById('combined-add-object-type').value;
    const objectValue = document.getElementById('combined-add-object-value').value;
    
    if (!subject || !predicate || !objectValue) {
        alert('Please fill in all required fields');
        return;
    }
    
    let object = { type: objectType, value: objectValue };
    
    if (objectType === 'literal') {
        const language = document.getElementById('combined-add-language').value;
        const datatype = document.getElementById('combined-add-datatype').value;
        if (language) object.language = language;
        if (datatype) object.datatype = datatype;
    }
    
    try {
        const encodedGraph = combinedGraph === 'default' ? 'default' : encodeURIComponent(combinedGraph);
        const response = await fetch(`${API_BASE}/graph/${encodedGraph}/triple`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ subject, predicate, object }),
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        alert('Triple added successfully!');
        
        // Clear form
        document.getElementById('combined-add-subject').value = '';
        document.getElementById('combined-add-predicate').value = '';
        document.getElementById('combined-add-object-value').value = '';
        document.getElementById('combined-add-language').value = '';
        document.getElementById('combined-add-datatype').value = '';
        
        // Reload the graph
        await loadSelectedCombinedGraph();
    } catch (error) {
        alert(`Error adding triple: ${error.message}`);
    }
}// Load namespaces/graphs for graph visualization
async function loadGraphNamespaces() {
    const graphSelect = document.getElementById('graph-namespace-select');
    
    try {
        const query = 'SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s ?p ?o } }';
        
        const response = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        
        const data = await response.json();
        
        let options = '<option value="all">All Graphs</option>';
        options += '<option value="">Default Graph</option>';
        
        if (data.results && data.results[0] && data.results[0].results.bindings) {
            data.results[0].results.bindings.forEach(binding => {
                const graphUri = binding.g.value;
                options += `<option value="${escapeHtml(graphUri)}">${escapeHtml(graphUri)}</option>`;
            });
        }
        
        graphSelect.innerHTML = options;
        
    } catch (error) {
        console.error('Error loading graphs for visualization:', error);
        graphSelect.innerHTML = '<option value="all">All Graphs</option>';
    }
}// API base URL
const API_BASE = '/api';

// Store namespaces in localStorage
const NAMESPACE_STORAGE_KEY = 'rdf-editor-namespaces';

// Global variables
let resourceLabels = {};
let resourceTypes = {};
let currentGraphTriples = [];
let currentGraph = null;
let queryResultsTriples = [];
let lastQueryResults = null;
let querySourceGraph = null;
let editingTriple = null;
let cy = null; // Cytoscape instance
let graphNodes = new Map(); // Track nodes in graph

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    checkConnection();
    loadNamespaces();
    loadGraphsForDropdowns();
    setupKeyboardShortcuts();
    // Check connection every 30 seconds
    setInterval(checkConnection, 30000);
});

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Enter to execute query
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const queryTab = document.getElementById('query-tab');
            if (queryTab.classList.contains('active')) {
                e.preventDefault();
                executeQuery();
            }
        }
        
        // Ctrl/Cmd + S to save (in edit mode)
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            const editDialog = document.getElementById('edit-triple-dialog');
            if (editDialog && editDialog.style.display === 'flex') {
                saveEditedTriple();
            }
        }
        
        // Escape to close dialogs
        if (e.key === 'Escape') {
            const editDialog = document.getElementById('edit-triple-dialog');
            if (editDialog && editDialog.style.display === 'flex') {
                cancelEdit();
            }
        }
        
        // Alt + 1,2,3,4,5 to switch tabs
        if (e.altKey) {
            switch(e.key) {
                case '1':
                    e.preventDefault();
                    showTab('query');
                    break;
                case '2':
                    e.preventDefault();
                    showTab('browse');
                    break;
                case '3':
                    e.preventDefault();
                    showTab('graph');
                    break;
                case '4':
                    e.preventDefault();
                    showTab('namespaces');
                    break;
                case '5':
                    e.preventDefault();
                    showTab('history');
                    break;
            }
        }
    });
}

// Tab switching
function showTab(tabName) {
    console.log('Switching to tab:', tabName);
    
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Find and activate the corresponding button
    const buttons = document.querySelectorAll('.tab-button');
    buttons.forEach(button => {
        if (button.textContent.toLowerCase().includes(tabName.toLowerCase()) ||
            (tabName === 'graph' && button.textContent === 'Graph') ||
            (tabName === 'history' && button.textContent === 'History')) {
            button.classList.add('active');
        }
    });
    
    // Load data for specific tabs
    if (tabName === 'browse') {
        if (!document.getElementById('browse-graph-select').options.length || 
            document.getElementById('browse-graph-select').options[0].value === '') {
            loadGraphsForBrowse();
        }
    } else if (tabName === 'namespaces') {
        displayNamespaces();
    } else if (tabName === 'history') {
        loadTransactionHistory();
    } else if (tabName === 'graph') {
        // Initialize Cytoscape when graph tab is shown
        setTimeout(() => {
            initializeCytoscape();
        }, 100);
    }
}

// Check connection status
async function checkConnection() {
    const statusDiv = document.getElementById('connection-status');
    try {
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        
        if (data.status === 'healthy') {
            statusDiv.textContent = 'Connected to SPARQL endpoint';
            statusDiv.className = 'status connected';
        } else {
            statusDiv.textContent = 'SPARQL endpoint disconnected';
            statusDiv.className = 'status disconnected';
        }
    } catch (error) {
        statusDiv.textContent = 'Server connection error';
        statusDiv.className = 'status disconnected';
    }
}

// Execute SPARQL query
async function executeQuery() {
    const queryInput = document.getElementById('query-input');
    const query = queryInput.value;
    const selectedGraph = document.getElementById('query-graph').value;
    const resultsDiv = document.getElementById('query-results');
    const fullQueryDiv = document.getElementById('full-query');
    const showPrefixes = document.getElementById('show-prefixes').checked;
    
    // Store the source graph for later use
    querySourceGraph = selectedGraph || 'default';
    
    // Prepend namespace prefixes
    const namespaces = getNamespaces();
    let prefixedQuery = '';
    namespaces.forEach(ns => {
        prefixedQuery += `PREFIX ${ns.prefix}: <${ns.uri}>\n`;
    });
    if (namespaces.length > 0) {
        prefixedQuery += '\n';
    }
    prefixedQuery += query;
    
    // Show the full query if checkbox is checked
    if (showPrefixes) {
        fullQueryDiv.innerHTML = '<strong>Query with prefixes:</strong>\n' + escapeHtml(prefixedQuery);
        fullQueryDiv.style.display = 'block';
    }
    
    resultsDiv.innerHTML = '<div class="loading">Executing query</div>';
    
    try {
        const requestBody = { query: prefixedQuery };
        if (selectedGraph) {
            requestBody.graph = selectedGraph;
        }
        
        const response = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        lastQueryResults = data.results[0];
        displayQueryResults(data.results[0]);
        
        // Show buttons if results could be triples or graph data
        const sendButton = document.getElementById('send-to-browse');
        const graphButton = document.getElementById('send-to-graph');
        
        let canSendToBrowse = false;
        let canVisualize = false;
        
        if (lastQueryResults && lastQueryResults.results && lastQueryResults.results.bindings && 
            lastQueryResults.results.bindings.length > 0 && lastQueryResults.head && lastQueryResults.head.vars) {
            
            const vars = lastQueryResults.head.vars;
            
            // Check for triple pattern
            if (vars.includes('s') && vars.includes('p') && vars.includes('o')) {
                canSendToBrowse = true;
                canVisualize = true;
            } else if (vars.length === 3) {
                canSendToBrowse = true;
                canVisualize = true;
            }
        }
        
        sendButton.style.display = canSendToBrowse ? 'inline-block' : 'none';
        graphButton.style.display = canVisualize ? 'inline-block' : 'none';
        
    } catch (error) {
        resultsDiv.innerHTML = `<div class="message error">Error: ${error.message}</div>`;
        document.getElementById('send-to-browse').style.display = 'none';
        document.getElementById('send-to-graph').style.display = 'none';
    }
}

// Toggle prefix display
function togglePrefixDisplay() {
    const fullQueryDiv = document.getElementById('full-query');
    const showPrefixes = document.getElementById('show-prefixes').checked;
    
    if (!showPrefixes) {
        fullQueryDiv.style.display = 'none';
    }
}

// Display query results
function displayQueryResults(results) {
    const resultsDiv = document.getElementById('query-results');
    
    if (!results || !results.results || !results.results.bindings || results.results.bindings.length === 0) {
        resultsDiv.innerHTML = '<div class="message">No results found.</div>';
        return;
    }
    
    const bindings = results.results.bindings;
    const vars = results.head.vars;
    
    let html = `
        <p>Found ${bindings.length} results</p>
        <table>
            <thead>
                <tr>
                    ${vars.map(v => `<th>${v}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
    `;
    
    bindings.forEach(binding => {
        html += '<tr>';
        vars.forEach(v => {
            if (binding[v]) {
                const value = binding[v].value;
                const type = binding[v].type;
                html += `<td><code class="${type}">${escapeHtml(value)}</code></td>`;
            } else {
                html += '<td>-</td>';
            }
        });
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    resultsDiv.innerHTML = html;
}

// Load graphs for dropdown menus
async function loadGraphsForDropdowns() {
    const query = 'SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s ?p ?o } }';
    
    try {
        const response = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
        });
        
        const data = await response.json();
        updateGraphDropdowns(data.results[0]);
    } catch (error) {
        console.error('Error loading graphs for dropdowns:', error);
    }
}

// Update graph dropdown menus
function updateGraphDropdowns(results) {
    const queryGraphSelect = document.getElementById('query-graph');
    
    if (queryGraphSelect) {
        queryGraphSelect.innerHTML = '<option value="">Default Graph</option>';
        
        if (results && results.results && results.results.bindings) {
            results.results.bindings.forEach(binding => {
                const graphUri = binding.g.value;
                const option = new Option(graphUri, graphUri);
                queryGraphSelect.add(option);
            });
        }
    }
}

// Load graphs for browse dropdown
async function loadGraphsForBrowse() {
    const query = 'SELECT DISTINCT ?g WHERE { GRAPH ?g { ?s ?p ?o } }';
    
    try {
        const response = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
        });
        
        const data = await response.json();
        updateBrowseGraphDropdown(data.results[0]);
    } catch (error) {
        console.error('Error loading graphs:', error);
    }
}

// Update browse graph dropdown
function updateBrowseGraphDropdown(results) {
    const graphSelect = document.getElementById('browse-graph-select');
    const currentSelection = graphSelect.value;
    
    let options = '';
    if (currentSelection === 'query-results') {
        options = '<option value="query-results" selected>Query Results</option>';
    } else {
        options = '<option value="">Select a graph...</option>';
    }
    
    options += '<option value="default">Default Graph</option>';
    
    if (results && results.results && results.results.bindings) {
        results.results.bindings.forEach(binding => {
            const graphUri = binding.g.value;
            const selected = graphUri === currentSelection ? 'selected' : '';
            options += `<option value="${escapeHtml(graphUri)}" ${selected}>${escapeHtml(graphUri)}</option>`;
        });
    }
    
    graphSelect.innerHTML = options;
    
    // Show/hide visualize button
    const visualizeButton = document.getElementById('visualize-graph');
    if (visualizeButton) {
        visualizeButton.style.display = currentSelection && currentSelection !== '' ? 'inline-block' : 'none';
    }
}

// Load selected graph
async function loadSelectedGraph() {
    const graphSelect = document.getElementById('browse-graph-select');
    const selectedGraph = graphSelect.value;
    
    if (!selectedGraph) {
        document.getElementById('browse-results').innerHTML = '';
        return;
    }
    
    currentGraph = selectedGraph;
    
    // Update visualize button visibility
    const visualizeButton = document.getElementById('visualize-graph');
    if (visualizeButton) {
        visualizeButton.style.display = 'inline-block';
    }
    
    if (selectedGraph === 'query-results') {
        currentGraphTriples = queryResultsTriples;
        resourceLabels = {};
        resourceTypes = {};
        displayFilteredTriples();
    } else if (selectedGraph === 'default') {
        await loadGraphTriples(null);
    } else {
        await loadGraphTriples(selectedGraph);
    }
}

// Load triples from a specific graph
async function loadGraphTriples(graphUri) {
    const resultsDiv = document.getElementById('browse-results');
    resultsDiv.innerHTML = '<div class="loading">Loading triples and labels</div>';
    
    try {
        const encodedGraph = graphUri ? encodeURIComponent(graphUri) : 'default';
        
        // First, load resources with labels
        const labelsResponse = await fetch(`${API_BASE}/graph/${encodedGraph}/resources`);
        const labelsData = await labelsResponse.json();
        processResourceLabels(labelsData);
        
        // Then load all triples
        const response = await fetch(`${API_BASE}/graph/${encodedGraph}/triples`);
        const triples = await response.json();
        
        currentGraphTriples = triples;
        displayFilteredTriples();
    } catch (error) {
        resultsDiv.innerHTML = `<div class="message error">Error loading triples: ${error.message}</div>`;
    }
}

// Process resource labels from SPARQL results
function processResourceLabels(data) {
    resourceLabels = {};
    resourceTypes = {};
    
    if (!data.results || !data.results.bindings) return;
    
    data.results.bindings.forEach(binding => {
        const resource = binding.resource.value;
        
        if (binding.type) {
            if (!resourceTypes[resource]) {
                resourceTypes[resource] = [];
            }
            if (!resourceTypes[resource].includes(binding.type.value)) {
                resourceTypes[resource].push(binding.type.value);
            }
        }
        
        if (binding.label) {
            if (!resourceLabels[resource]) {
                resourceLabels[resource] = [];
            }
            resourceLabels[resource].push({
                value: binding.label.value,
                lang: binding.lang ? binding.lang.value : '',
                property: binding.labelProp.value
            });
        }
    });
}

// Determine resource type category
function getResourceCategory(uri) {
    const types = resourceTypes[uri] || [];
    
    const shaclTypes = [
        'http://www.w3.org/ns/shacl#NodeShape',
        'http://www.w3.org/ns/shacl#PropertyShape',
        'http://www.w3.org/ns/shacl#Shape'
    ];
    
    const classTypes = [
        'http://www.w3.org/2002/07/owl#Class',
        'http://www.w3.org/2000/01/rdf-schema#Class',
        'http://www.w3.org/2004/02/skos/core#Concept',
        'http://www.w3.org/2004/02/skos/core#ConceptScheme'
    ];
    
    const propertyTypes = [
        'http://www.w3.org/2002/07/owl#ObjectProperty',
        'http://www.w3.org/2002/07/owl#DatatypeProperty',
        'http://www.w3.org/2002/07/owl#AnnotationProperty',
        'http://www.w3.org/1999/02/22-rdf-syntax-ns#Property'
    ];
    
    for (const type of types) {
        if (shaclTypes.includes(type)) return 'shacl';
    }
    
    for (const type of types) {
        if (classTypes.includes(type)) return 'class';
    }
    
    for (const type of types) {
        if (propertyTypes.includes(type)) return 'property';
    }
    
    const isUsedAsPredicate = currentGraphTriples.some(t => t.predicate === uri);
    if (isUsedAsPredicate) return 'property';
    
    const hasShaclProperties = currentGraphTriples.some(t => 
        t.subject === uri && (
            t.predicate === 'http://www.w3.org/ns/shacl#targetClass' ||
            t.predicate === 'http://www.w3.org/ns/shacl#property' ||
            t.predicate === 'http://www.w3.org/ns/shacl#path' ||
            t.predicate === 'http://www.w3.org/ns/shacl#datatype' ||
            t.predicate === 'http://www.w3.org/ns/shacl#minCount' ||
            t.predicate === 'http://www.w3.org/ns/shacl#maxCount'
        )
    );
    if (hasShaclProperties) return 'shacl';
    
    if (types.length > 0) return 'instance';
    
    return 'instance';
}

// Filter and display triples
function filterTriples() {
    displayFilteredTriples();
}

// Toggle label display
function toggleLabelDisplay() {
    displayFilteredTriples();
}

// Toggle edit mode
function toggleEditMode() {
    const editingEnabled = document.getElementById('enable-editing').checked;
    const addTripleSection = document.getElementById('add-triple-section');
    
    if (editingEnabled && currentGraph && currentGraph !== 'query-results') {
        addTripleSection.style.display = 'block';
    } else {
        addTripleSection.style.display = 'none';
    }
    
    displayFilteredTriples();
}

// Display filtered triples
function displayFilteredTriples() {
    const showClasses = document.getElementById('filter-classes').checked;
    const showProperties = document.getElementById('filter-properties').checked;
    const showInstances = document.getElementById('filter-instances').checked;
    
    const subjects = [...new Set(currentGraphTriples.map(t => t.subject))];
    
    const filteredSubjects = subjects.filter(subject => {
        const category = getResourceCategory(subject);
        return (category === 'class' && showClasses) ||
               (category === 'property' && showProperties) ||
               (category === 'instance' && showInstances) ||
               (category === 'shacl' && showClasses);
    });
    
    const filteredTriples = currentGraphTriples.filter(t => 
        filteredSubjects.includes(t.subject)
    );
    
    displayTriples(filteredTriples, document.getElementById('browse-results'));
}

// Display triples with sorting and filtering
let currentSortColumn = null;
let currentSortDirection = 'asc';
let browseSearchTerm = '';

function displayTriples(triples, container) {
    if (!triples || triples.length === 0) {
        container.innerHTML = '<div class="message">No triples found matching the selected filters.</div>';
        return;
    }
    
    // Filter by search term if present
    let filteredTriples = triples;
    if (browseSearchTerm) {
        const searchLower = browseSearchTerm.toLowerCase();
        filteredTriples = triples.filter(triple => {
            const subjectLabel = getBestLabel(triple.subject);
            const predicateLabel = getBestLabel(triple.predicate);
            let objectText = '';
            
            if (triple.object.type === 'uri') {
                const objectLabel = getBestLabel(triple.object.value);
                objectText = objectLabel ? objectLabel.value : triple.object.value;
            } else {
                objectText = triple.object.value;
            }
            
            return (
                triple.subject.toLowerCase().includes(searchLower) ||
                (subjectLabel && subjectLabel.value.toLowerCase().includes(searchLower)) ||
                triple.predicate.toLowerCase().includes(searchLower) ||
                (predicateLabel && predicateLabel.value.toLowerCase().includes(searchLower)) ||
                objectText.toLowerCase().includes(searchLower)
            );
        });
    }
    
    // Store filtered triples globally for edit/delete functions
    window.currentDisplayedTriples = filteredTriples;
    
    const editingEnabled = document.getElementById('enable-editing') && document.getElementById('enable-editing').checked;
    const showActions = editingEnabled && currentGraph && currentGraph !== 'query-results';
    
    // Sort triples if a sort column is selected
    if (currentSortColumn) {
        filteredTriples = [...filteredTriples].sort((a, b) => {
            let aVal, bVal;
            
            switch (currentSortColumn) {
                case 'subject':
                    aVal = a.subject;
                    bVal = b.subject;
                    break;
                case 'predicate':
                    aVal = a.predicate;
                    bVal = b.predicate;
                    break;
                case 'object':
                    if (a.object.type === 'uri' && b.object.type === 'uri') {
                        aVal = a.object.value;
                        bVal = b.object.value;
                    } else {
                        aVal = a.object.value;
                        bVal = b.object.value;
                    }
                    break;
            }
            
            const result = aVal.localeCompare(bVal);
            return currentSortDirection === 'asc' ? result : -result;
        });
    }
    
    const bySubject = {};
    filteredTriples.forEach((triple, index) => {
        if (!bySubject[triple.subject]) {
            bySubject[triple.subject] = [];
        }
        bySubject[triple.subject].push({ triple, globalIndex: index });
    });
    
    // Add search bar
    let html = `
        <div class="browse-search-bar">
            <input type="text" id="browse-search" placeholder="Search in results..." value="${escapeHtml(browseSearchTerm)}" onkeyup="searchInBrowseResults()">
            <span class="search-results-count">${filteredTriples.length} of ${triples.length} triples</span>
        </div>
    `;
    
    html += `
        <h3>Resources (${Object.keys(bySubject).length}):</h3>
        <div class="table-wrapper">
            <table class="triples-table">
                <thead>
                    <tr>
                        <th class="subject-column sortable" onclick="sortBrowseTable('subject')">
                            Subject ${getSortIndicator('subject')}
                        </th>
                        <th class="predicate-column sortable" onclick="sortBrowseTable('predicate')">
                            Predicate ${getSortIndicator('predicate')}
                        </th>
                        <th class="object-column sortable" onclick="sortBrowseTable('object')">
                            Object ${getSortIndicator('object')}
                        </th>
                        ${showActions ? '<th class="actions-column">Actions</th>' : ''}
                    </tr>
                </thead>
                <tbody>
    `;
    
    Object.entries(bySubject).forEach(([subject, subjectData]) => {
        subjectData.forEach((data, index) => {
            const { triple, globalIndex } = data;
            html += '<tr>';
            
            if (index === 0) {
                const category = getResourceCategory(subject);
                let categoryBadge = '';
                switch(category) {
                    case 'class':
                        categoryBadge = ' <small class="category-badge category-class">[Class]</small>';
                        break;
                    case 'property':
                        categoryBadge = ' <small class="category-badge category-property">[Property]</small>';
                        break;
                    case 'shacl':
                        categoryBadge = ' <small class="category-badge category-shacl">[SHACL]</small>';
                        break;
                }
                html += `<td rowspan="${subjectData.length}" class="subject-cell">${formatUriWithLabel(subject)}${categoryBadge}</td>`;
            }
            
            html += `<td class="predicate-cell">${formatUriWithLabel(triple.predicate)}</td>`;
            html += '<td class="object-cell">';
            
            if (triple.object.type === 'uri') {
                html += formatUriWithLabel(triple.object.value);
            } else if (triple.object.type === 'literal') {
                const literalTitle = `Literal: "${triple.object.value}"${triple.object.language ? '@' + triple.object.language : ''}${triple.object.datatype ? ' ^^' + triple.object.datatype : ''}`;
                html += `<span class="literal-value" title="${escapeHtml(literalTitle)}">"${escapeHtml(triple.object.value)}"</span>`;
                if (triple.object.language) {
                    html += `<span class="lang-tag">@${triple.object.language}</span>`;
                } else if (triple.object.datatype) {
                    const compressedDatatype = compressUri(triple.object.datatype);
                    html += `<span class="datatype-tag" title="${escapeHtml(triple.object.datatype)}">^^${escapeHtml(compressedDatatype)}</span>`;
                }
            } else if (triple.object.type === 'blank') {
                html += `<span class="blank-node" title="Blank node: ${escapeHtml(triple.object.value)}">_:${escapeHtml(triple.object.value)}</span>`;
            }
            
            html += '</td>';
            
            if (showActions) {
                html += `
                    <td class="actions-cell">
                        <button onclick="editTripleByIndex(${globalIndex})" class="action-button edit-button" title="Edit this triple">Edit</button>
                        <button onclick="deleteTripleByIndex(${globalIndex})" class="action-button delete-button" title="Delete this triple">Delete</button>
                    </td>
                `;
            }
            
            html += '</tr>';
        });
    });
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// Get sort indicator
function getSortIndicator(column) {
    if (currentSortColumn !== column) return '<span class="sort-indicator">⇅</span>';
    return currentSortDirection === 'asc' ? 
        '<span class="sort-indicator active">▲</span>' : 
        '<span class="sort-indicator active">▼</span>';
}

// Sort browse table
function sortBrowseTable(column) {
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }
    
    displayFilteredTriples();
}

// Search in browse results
function searchInBrowseResults() {
    const searchInput = document.getElementById('browse-search');
    browseSearchTerm = searchInput ? searchInput.value : '';
    displayFilteredTriples();
}

// Edit triple by index
function editTripleByIndex(index) {
    const triple = window.currentDisplayedTriples[index];
    if (!triple) return;
    editTriple(triple);
}

// Delete triple by index
function deleteTripleByIndex(index) {
    const triple = window.currentDisplayedTriples[index];
    if (!triple) return;
    deleteTripleFromBrowse(triple);
}

// Edit triple
function editTriple(triple) {
    editingTriple = triple;
    
    document.getElementById('edit-subject').value = triple.subject;
    document.getElementById('edit-predicate').value = triple.predicate;
    
    let currentObjectDisplay = '';
    if (triple.object.type === 'uri') {
        currentObjectDisplay = `URI: ${triple.object.value}`;
        document.getElementById('edit-object-type').value = 'uri';
        document.getElementById('edit-object-value').value = triple.object.value;
    } else if (triple.object.type === 'literal') {
        currentObjectDisplay = `Literal: "${triple.object.value}"`;
        if (triple.object.language) currentObjectDisplay += `@${triple.object.language}`;
        if (triple.object.datatype) currentObjectDisplay += ` (${triple.object.datatype})`;
        
        document.getElementById('edit-object-type').value = 'literal';
        document.getElementById('edit-object-value').value = triple.object.value;
        document.getElementById('edit-language').value = triple.object.language || '';
        document.getElementById('edit-datatype').value = triple.object.datatype || '';
    } else if (triple.object.type === 'blank') {
        currentObjectDisplay = `Blank Node: _:${triple.object.value}`;
        document.getElementById('edit-object-type').value = 'blank';
        document.getElementById('edit-object-value').value = triple.object.value;
    }
    
    document.getElementById('edit-current-object').textContent = currentObjectDisplay;
    updateEditObjectInput();
    document.getElementById('edit-triple-dialog').style.display = 'flex';
    document.getElementById('edit-object-value').focus();
}

// Update edit object input based on type
function updateEditObjectInput() {
    const type = document.getElementById('edit-object-type').value;
    const literalOptions = document.getElementById('edit-literal-options');
    const valueInput = document.getElementById('edit-object-value');
    
    if (type === 'literal') {
        literalOptions.style.display = 'block';
        valueInput.placeholder = 'Enter literal value';
    } else {
        literalOptions.style.display = 'none';
        if (type === 'uri') {
            valueInput.placeholder = 'http://example.com/object';
        } else {
            valueInput.placeholder = 'b1';
        }
    }
}

// Cancel edit
function cancelEdit() {
    editingTriple = null;
    document.getElementById('edit-triple-dialog').style.display = 'none';
}

// Save edited triple
async function saveEditedTriple() {
    if (!editingTriple || !currentGraph || currentGraph === 'query-results') {
        alert('Cannot edit this triple');
        return;
    }
    
    const newObjectType = document.getElementById('edit-object-type').value;
    const newObjectValue = document.getElementById('edit-object-value').value;
    
    if (!newObjectValue) {
        alert('Please enter a new object value');
        return;
    }
    
    let newObject = { type: newObjectType, value: newObjectValue };
    
    if (newObjectType === 'literal') {
        const language = document.getElementById('edit-language').value;
        const datatype = document.getElementById('edit-datatype').value;
        if (language) newObject.language = language;
        if (datatype) newObject.datatype = datatype;
    }
    
    const objectChanged = JSON.stringify(editingTriple.object) !== JSON.stringify(newObject);
    
    if (!objectChanged) {
        alert('No changes made');
        cancelEdit();
        return;
    }
    
    try {
        const encodedGraph = currentGraph === 'default' ? 'default' : encodeURIComponent(currentGraph);
        
        const response = await fetch(`${API_BASE}/graph/${encodedGraph}/triple/replace`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                old_triple: {
                    subject: editingTriple.subject,
                    predicate: editingTriple.predicate,
                    object: editingTriple.object
                },
                new_triple: {
                    subject: editingTriple.subject,
                    predicate: editingTriple.predicate,
                    object: newObject
                }
            }),
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP error! status: ${response.status}`);
        }
        
        alert('Triple updated successfully!');
        cancelEdit();
        await loadGraphTriples(currentGraph === 'default' ? null : currentGraph);
    } catch (error) {
        alert(`Error updating triple: ${error.message}`);
    }
}

// Delete triple from browse
async function deleteTripleFromBrowse(triple) {
    if (!currentGraph || currentGraph === 'query-results') {
        alert('Cannot delete from query results. Please select a real graph.');
        return;
    }
    
    if (!confirm('Are you sure you want to delete this triple?')) {
        return;
    }
    
    try {
        const encodedGraph = currentGraph === 'default' ? 'default' : encodeURIComponent(currentGraph);
        const response = await fetch(`${API_BASE}/graph/${encodedGraph}/triple`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                subject: triple.subject,
                predicate: triple.predicate,
                object: triple.object
            }),
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        alert('Triple deleted successfully!');
        await loadGraphTriples(currentGraph === 'default' ? null : currentGraph);
    } catch (error) {
        alert(`Error deleting triple: ${error.message}`);
    }
}

// Update object input based on type
function updateObjectInput() {
    const type = document.getElementById('add-object-type').value;
    const literalOptions = document.getElementById('literal-options');
    const valueInput = document.getElementById('add-object-value');
    
    if (type === 'literal') {
        literalOptions.style.display = 'block';
        valueInput.placeholder = 'Enter literal value';
    } else {
        literalOptions.style.display = 'none';
        if (type === 'uri') {
            valueInput.placeholder = 'http://example.com/object';
        } else {
            valueInput.placeholder = 'b1';
        }
    }
}

// Add triple from browse
async function addTripleFromBrowse() {
    if (!currentGraph || currentGraph === 'query-results') {
        alert('Please select a real graph to add triples to.');
        return;
    }
    
    const subject = document.getElementById('add-subject').value;
    const predicate = document.getElementById('add-predicate').value;
    const objectType = document.getElementById('add-object-type').value;
    const objectValue = document.getElementById('add-object-value').value;
    
    if (!subject || !predicate || !objectValue) {
        alert('Please fill in all required fields');
        return;
    }
    
    let object = { type: objectType, value: objectValue };
    
    if (objectType === 'literal') {
        const language = document.getElementById('add-language').value;
        const datatype = document.getElementById('add-datatype').value;
        if (language) object.language = language;
        if (datatype) object.datatype = datatype;
    }
    
    try {
        const encodedGraph = currentGraph === 'default' ? 'default' : encodeURIComponent(currentGraph);
        const response = await fetch(`${API_BASE}/graph/${encodedGraph}/triple`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ subject, predicate, object }),
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        alert('Triple added successfully!');
        
        document.getElementById('add-subject').value = '';
        document.getElementById('add-predicate').value = '';
        document.getElementById('add-object-value').value = '';
        document.getElementById('add-language').value = '';
        document.getElementById('add-datatype').value = '';
        
        await loadGraphTriples(currentGraph === 'default' ? null : currentGraph);
    } catch (error) {
        alert(`Error adding triple: ${error.message}`);
    }
}

// Get best label for a resource
function getBestLabel(uri, preferredLang = 'en') {
    const labels = resourceLabels[uri];
    if (!labels || labels.length === 0) return null;
    
    const labelPriority = {
        'http://www.w3.org/2004/02/skos/core#prefLabel': 1,
        'http://www.w3.org/2000/01/rdf-schema#label': 2,
        'http://www.w3.org/2004/02/skos/core#altLabel': 3
    };
    
    const sorted = labels.sort((a, b) => {
        const priorityDiff = (labelPriority[a.property] || 999) - (labelPriority[b.property] || 999);
        if (priorityDiff !== 0) return priorityDiff;
        
        if (a.lang === preferredLang && b.lang !== preferredLang) return -1;
        if (b.lang === preferredLang && a.lang !== preferredLang) return 1;
        
        if (a.lang === '' && b.lang !== '') return -1;
        if (b.lang === '' && a.lang !== '') return 1;
        
        return 0;
    });
    
    return sorted[0];
}

// Compress URI using namespaces
function compressUri(uri) {
    const namespaces = getNamespaces();
    const sortedNamespaces = [...namespaces].sort((a, b) => b.uri.length - a.uri.length);
    
    for (const ns of sortedNamespaces) {
        if (uri.startsWith(ns.uri)) {
            const localPart = uri.substring(ns.uri.length);
            if (localPart && !localPart.includes('/') && !localPart.includes('#')) {
                return `${ns.prefix}:${localPart}`;
            }
        }
    }
    
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
        const shortened = uri.replace(/^https?:\/\//, '');
        return `<${shortened}>`;
    }
    
    return uri;
}

// Format URI with label if available
function formatUriWithLabel(uri) {
    const showLabels = document.getElementById('show-labels') && document.getElementById('show-labels').checked;
    const compressed = compressUri(uri);
    
    if (!showLabels) {
        return `<code class="uri-display" title="${escapeHtml(uri)}">${escapeHtml(compressed)}</code>`;
    }
    
    const label = getBestLabel(uri);
    if (label) {
        const langTag = label.lang ? `@${label.lang}` : '';
        return `<span class="label-display" title="${escapeHtml(uri)}">${escapeHtml(label.value)}${langTag}</span> <span class="label-info">(<code title="${escapeHtml(uri)}">${escapeHtml(compressed)}</code>)</span>`;
    }
    
    return `<code class="uri-display" title="${escapeHtml(uri)}">${escapeHtml(compressed)}</code>`;
}

// Utility function to escape HTML
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Send query results to browse tab
function sendQueryResultsToBrowse() {
    if (!lastQueryResults || !lastQueryResults.results || !lastQueryResults.results.bindings) {
        alert('No query results to send');
        return;
    }
    
    const vars = lastQueryResults.head.vars;
    let subjectVar, predicateVar, objectVar;
    
    if (vars.includes('s') && vars.includes('p') && vars.includes('o')) {
        subjectVar = 's';
        predicateVar = 'p';
        objectVar = 'o';
    } else if (vars.includes('subject') && vars.includes('predicate') && vars.includes('object')) {
        subjectVar = 'subject';
        predicateVar = 'predicate';
        objectVar = 'object';
    } else if (vars.includes('subj') && vars.includes('pred') && vars.includes('obj')) {
        subjectVar = 'subj';
        predicateVar = 'pred';
        objectVar = 'obj';
    } else if (vars.length === 3) {
        subjectVar = vars[0];
        predicateVar = vars[1];
        objectVar = vars[2];
    } else {
        alert('Cannot determine which columns represent subject, predicate, and object');
        return;
    }
    
    queryResultsTriples = [];
    
    lastQueryResults.results.bindings.forEach(binding => {
        if (binding[subjectVar] && binding[predicateVar] && binding[objectVar]) {
            const triple = {
                subject: binding[subjectVar].value,
                predicate: binding[predicateVar].value,
                object: convertSparqlNodeToRdfNode(binding[objectVar]),
                graph: binding.g ? binding.g.value : null
            };
            queryResultsTriples.push(triple);
        }
    });
    
    if (queryResultsTriples.length === 0) {
        alert('No valid triples found in query results');
        return;
    }
    
    showTab('browse');
    
    setTimeout(() => {
        currentGraph = 'query-results';
        currentGraphTriples = queryResultsTriples;
        
        const graphSelect = document.getElementById('browse-graph-select');
        if (graphSelect) {
            loadGraphsForBrowse().then(() => {
                const firstOption = graphSelect.firstChild;
                const queryOption = document.createElement('option');
                queryOption.value = 'query-results';
                queryOption.textContent = `Query Results (from ${querySourceGraph === 'default' ? 'Default Graph' : querySourceGraph})`;
                queryOption.selected = true;
                graphSelect.insertBefore(queryOption, firstOption);
                
                if (querySourceGraph && querySourceGraph !== 'default') {
                    let foundSourceGraph = false;
                    for (let i = 0; i < graphSelect.options.length; i++) {
                        if (graphSelect.options[i].value === querySourceGraph) {
                            foundSourceGraph = true;
                            break;
                        }
                    }
                    
                    if (!foundSourceGraph) {
                        const sourceOption = document.createElement('option');
                        sourceOption.value = querySourceGraph;
                        sourceOption.textContent = querySourceGraph;
                        graphSelect.appendChild(sourceOption);
                    }
                }
            });
        }
        
        resourceLabels = {};
        resourceTypes = {};
        displayFilteredTriples();
    }, 100);
}

// Send query results to graph visualization
function sendQueryResultsToGraph() {
    if (!lastQueryResults || !lastQueryResults.results || !lastQueryResults.results.bindings) {
        alert('No query results to visualize');
        return;
    }
    
    const vars = lastQueryResults.head.vars;
    let subjectVar, predicateVar, objectVar;
    
    if (vars.includes('s') && vars.includes('p') && vars.includes('o')) {
        subjectVar = 's';
        predicateVar = 'p';
        objectVar = 'o';
    } else if (vars.length === 3) {
        subjectVar = vars[0];
        predicateVar = vars[1];
        objectVar = vars[2];
    } else {
        alert('Cannot determine which columns represent triples for visualization');
        return;
    }
    
    showTab('graph');
    
    setTimeout(() => {
        if (!cy) {
            initializeCytoscape();
        }
        
        // Clear existing graph
        clearGraph();
        
        // Add nodes and edges from query results
        const nodes = new Set();
        const edges = [];
        
        lastQueryResults.results.bindings.forEach(binding => {
            if (binding[subjectVar] && binding[predicateVar] && binding[objectVar]) {
                const subject = binding[subjectVar].value;
                const predicate = binding[predicateVar].value;
                const object = binding[objectVar].value;
                const objectType = binding[objectVar].type;
                
                nodes.add(subject);
                
                if (objectType === 'uri') {
                    nodes.add(object);
                    edges.push({ source: subject, target: object, predicate });
                } else if (objectType === 'literal') {
                    const literalId = `literal_${Math.random().toString(36).substr(2, 9)}`;
                    nodes.add(literalId);
                    edges.push({ source: subject, target: literalId, predicate, literal: object });
                }
            }
        });
        
        // Add all nodes first
        nodes.forEach(nodeId => {
            if (nodeId.startsWith('literal_')) {
                // Find the literal value
                const edge = edges.find(e => e.target === nodeId);
                if (edge && edge.literal) {
                    cy.add({
                        data: {
                            id: nodeId,
                            label: edge.literal.length > 30 ? edge.literal.substring(0, 30) + '...' : edge.literal,
                            color: '#808080',
                            nodeType: 'literal'
                        }
                    });
                }
            } else {
                cy.add({
                    data: {
                        id: nodeId,
                        label: getShortLabel(nodeId, []),
                        color: '#FF8C00',
                        nodeType: 'resource'
                    }
                });
            }
            graphNodes.set(nodeId, true);
        });
        
        // Add all edges
        edges.forEach((edge, index) => {
            cy.add({
                data: {
                    id: `edge_${index}`,
                    source: edge.source,
                    target: edge.target,
                    label: getShortLabel(edge.predicate, [])
                }
            });
        });
        
        // Run layout
        applyLayout();
        
        document.getElementById('graph-info').innerHTML = `<p>Visualizing ${nodes.size} nodes and ${edges.length} edges from query results</p>`;
    }, 200);
}

// Visualize current graph
function visualizeCurrentGraph() {
    if (!currentGraph || currentGraph === 'query-results') {
        // If it's query results, convert them
        if (currentGraph === 'query-results' && currentGraphTriples.length > 0) {
            // Switch to graph tab
            showTab('graph');
            
            setTimeout(() => {
                if (!cy) {
                    initializeCytoscape();
                }
                
                clearGraph();
                
                // Add nodes and edges from current triples
                const nodes = new Set();
                const edges = [];
                
                currentGraphTriples.forEach(triple => {
                    nodes.add(triple.subject);
                    
                    if (triple.object.type === 'uri') {
                        nodes.add(triple.object.value);
                        edges.push({
                            source: triple.subject,
                            target: triple.object.value,
                            predicate: triple.predicate
                        });
                    } else if (triple.object.type === 'literal') {
                        const literalId = `literal_${Math.random().toString(36).substr(2, 9)}`;
                        nodes.add(literalId);
                        edges.push({
                            source: triple.subject,
                            target: literalId,
                            predicate: triple.predicate,
                            literal: triple.object.value
                        });
                    }
                });
                
                // Add nodes
                nodes.forEach(nodeId => {
                    if (nodeId.startsWith('literal_')) {
                        const edge = edges.find(e => e.target === nodeId);
                        if (edge && edge.literal) {
                            cy.add({
                                data: {
                                    id: nodeId,
                                    label: edge.literal.length > 30 ? edge.literal.substring(0, 30) + '...' : edge.literal,
                                    color: '#808080',
                                    nodeType: 'literal'
                                }
                            });
                        }
                    } else {
                        cy.add({
                            data: {
                                id: nodeId,
                                label: getShortLabel(nodeId, resourceLabels[nodeId]),
                                color: getNodeColor(resourceTypes[nodeId] || []),
                                nodeType: 'resource'
                            }
                        });
                    }
                    graphNodes.set(nodeId, true);
                });
                
                // Add edges
                edges.forEach((edge, index) => {
                    cy.add({
                        data: {
                            id: `edge_${index}`,
                            source: edge.source,
                            target: edge.target,
                            label: getShortLabel(edge.predicate, [])
                        }
                    });
                });
                
                applyLayout();
                
                document.getElementById('graph-info').innerHTML = `<p>Visualizing ${nodes.size} nodes and ${edges.length} edges</p>`;
            }, 200);
        } else {
            alert('Please select a graph to visualize');
        }
        return;
    }
    
    // Otherwise load the selected graph into the visualization
    showTab('graph');
    
    setTimeout(async () => {
        if (!cy) {
            initializeCytoscape();
        }
        
        clearGraph();
        
        // Load a sample of triples from the graph
        const encodedGraph = currentGraph === 'default' ? 'default' : encodeURIComponent(currentGraph);
        
        try {
            const response = await fetch(`${API_BASE}/graph/${encodedGraph}/triples`);
            const triples = await response.json();
            
            // Limit to first 100 triples for performance
            const limitedTriples = triples.slice(0, 100);
            
            const nodes = new Set();
            const edges = [];
            
            limitedTriples.forEach(triple => {
                nodes.add(triple.subject);
                
                if (triple.object.type === 'uri') {
                    nodes.add(triple.object.value);
                    edges.push({
                        source: triple.subject,
                        target: triple.object.value,
                        predicate: triple.predicate
                    });
                }
            });
            
            // Add nodes
            nodes.forEach(nodeId => {
                cy.add({
                    data: {
                        id: nodeId,
                        label: getShortLabel(nodeId, resourceLabels[nodeId]),
                        color: getNodeColor(resourceTypes[nodeId] || []),
                        nodeType: 'resource'
                    }
                });
                graphNodes.set(nodeId, true);
            });
            
            // Add edges
            edges.forEach((edge, index) => {
                cy.add({
                    data: {
                        id: `edge_${index}`,
                        source: edge.source,
                        target: edge.target,
                        label: getShortLabel(edge.predicate, [])
                    }
                });
            });
            
            applyLayout();
            
            document.getElementById('graph-info').innerHTML = `<p>Showing first 100 triples. Total nodes: ${nodes.size}</p>`;
            
        } catch (error) {
            document.getElementById('graph-info').innerHTML = `<p class="error">Error loading graph: ${error.message}</p>`;
        }
    }, 200);
}

// Convert SPARQL result node to RDF node format
function convertSparqlNodeToRdfNode(node) {
    if (node.type === 'uri') {
        return { type: 'uri', value: node.value };
    } else if (node.type === 'literal') {
        const result = { type: 'literal', value: node.value };
        if (node['xml:lang']) result.language = node['xml:lang'];
        if (node.datatype) result.datatype = node.datatype;
        return result;
    } else if (node.type === 'bnode') {
        return { type: 'blank', value: node.value };
    }
    return { type: 'uri', value: node.value };
}

// Namespace management
function getNamespaces() {
    const stored = localStorage.getItem(NAMESPACE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
}

function saveNamespaces(namespaces) {
    localStorage.setItem(NAMESPACE_STORAGE_KEY, JSON.stringify(namespaces));
}

function loadNamespaces() {
    let namespaces = getNamespaces();
    if (namespaces.length === 0) {
        namespaces = [
            { prefix: 'rdf', uri: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#' },
            { prefix: 'rdfs', uri: 'http://www.w3.org/2000/01/rdf-schema#' },
            { prefix: 'xsd', uri: 'http://www.w3.org/2001/XMLSchema#' },
            { prefix: 'owl', uri: 'http://www.w3.org/2002/07/owl#' },
            { prefix: 'skos', uri: 'http://www.w3.org/2004/02/skos/core#' },
            { prefix: 'foaf', uri: 'http://xmlns.com/foaf/0.1/' },
            { prefix: 'dc', uri: 'http://purl.org/dc/elements/1.1/' },
            { prefix: 'dcterms', uri: 'http://purl.org/dc/terms/' },
            { prefix: 'schema', uri: 'http://schema.org/' },
            { prefix: 'sh', uri: 'http://www.w3.org/ns/shacl#' },
            { prefix: 'ex', uri: 'http://example.com/' },
            { prefix: 'exo', uri: 'http://example.org/' }
        ];
        saveNamespaces(namespaces);
    }
}

function displayNamespaces() {
    const namespaces = getNamespaces();
    const listDiv = document.getElementById('namespace-list');
    
    if (namespaces.length === 0) {
        listDiv.innerHTML = '<p>No namespaces defined. Add some below!</p>';
        return;
    }
    
    let html = '';
    namespaces.forEach((ns, index) => {
        html += `
            <div class="namespace-item">
                <div>
                    <code>${ns.prefix}:</code> <code>${escapeHtml(ns.uri)}</code>
                </div>
                <button onclick="removeNamespace(${index})" class="danger-button">Remove</button>
            </div>
        `;
    });
    
    listDiv.innerHTML = html;
}

function addNamespace() {
    const prefix = document.getElementById('new-prefix').value.trim();
    const uri = document.getElementById('new-uri').value.trim();
    
    if (!prefix || !uri) {
        alert('Please enter both prefix and URI');
        return;
    }
    
    const namespaces = getNamespaces();
    
    if (namespaces.some(ns => ns.prefix === prefix)) {
        alert(`Prefix "${prefix}" already exists`);
        return;
    }
    
    namespaces.push({ prefix, uri });
    saveNamespaces(namespaces);
    
    document.getElementById('new-prefix').value = '';
    document.getElementById('new-uri').value = '';
    
    displayNamespaces();
}

function removeNamespace(index) {
    const namespaces = getNamespaces();
    namespaces.splice(index, 1);
    saveNamespaces(namespaces);
    displayNamespaces();
}

function addCommonNamespace(prefix, uri) {
    const namespaces = getNamespaces();
    
    if (namespaces.some(ns => ns.prefix === prefix)) {
        alert(`Prefix "${prefix}" already exists`);
        return;
    }
    
    namespaces.push({ prefix, uri });
    saveNamespaces(namespaces);
    displayNamespaces();
}

// Load transaction history
async function loadTransactionHistory() {
    const listDiv = document.getElementById('transaction-list');
    listDiv.innerHTML = '<div class="loading">Loading transaction history</div>';
    
    try {
        const response = await fetch(`${API_BASE}/transactions`);
        const transactions = await response.json();
        
        displayTransactionHistory(transactions);
    } catch (error) {
        listDiv.innerHTML = `<div class="message error">Error loading history: ${error.message}</div>`;
    }
}

// Display transaction history
function displayTransactionHistory(transactions) {
    const listDiv = document.getElementById('transaction-list');
    
    if (!transactions || transactions.length === 0) {
        listDiv.innerHTML = '<div class="message">No transaction history found.</div>';
        return;
    }
    
    let html = '';
    transactions.forEach(entry => {
        const transaction = entry.record;
        const timestamp = new Date(transaction.timestamp).toLocaleString();
        
        let typeLabel = transaction.transaction_type;
        switch (transaction.transaction_type) {
            case 'AddTriple': typeLabel = 'Added Triple'; break;
            case 'DeleteTriple': typeLabel = 'Deleted Triple'; break;
            case 'ReplaceTriple': typeLabel = 'Replaced Triple'; break;
            case 'AddTriplesBatch': typeLabel = 'Added Batch'; break;
            case 'DeleteTriplesBatch': typeLabel = 'Deleted Batch'; break;
            case 'ImportData': typeLabel = 'Imported Data'; break;
            case 'DropGraph': typeLabel = 'Dropped Graph'; break;
        }
        
        html += `
            <div class="transaction-item">
                <div class="transaction-info">
                    <div class="transaction-type">${typeLabel}</div>
                    <div class="transaction-timestamp">${timestamp}</div>
                    <div class="transaction-description">${escapeHtml(transaction.description)}</div>
                    ${transaction.graph ? `<div class="transaction-graph">Graph: ${escapeHtml(transaction.graph)}</div>` : ''}
                </div>
                <div class="transaction-actions">
                    ${entry.can_undo ? 
                        `<button class="undo-button" onclick="undoTransaction('${transaction.id}')">Undo</button>` : 
                        '<button class="undo-button" disabled title="Cannot undo this operation">Undo</button>'
                    }
                </div>
            </div>
        `;
    });
    
    listDiv.innerHTML = html;
}

// Undo a transaction
async function undoTransaction(transactionId) {
    if (!confirm('Are you sure you want to undo this operation?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/transaction/${transactionId}/undo`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        alert(result.message);
        
        loadTransactionHistory();
        
        if (document.getElementById('browse-tab').classList.contains('active') && currentGraph && currentGraph !== 'query-results') {
            await loadGraphTriples(currentGraph === 'default' ? null : currentGraph);
        }
    } catch (error) {
        alert(`Error undoing transaction: ${error.message}`);
    }
}

// Graph Visualization Functions
let autoExpand = true; // Toggle for automatic expansion
let expandedNodes = new Set(); // Track which nodes have been expanded
let expansionQueue = []; // Queue for controlled expansion
let isExpanding = false; // Flag to prevent concurrent expansions

function initializeCytoscape() {
    if (cy) return;
    
    const container = document.getElementById('cy');
    if (!container) {
        console.error('Cytoscape container not found');
        return;
    }
    
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        console.warn('Cytoscape container has no dimensions, retrying...');
        setTimeout(initializeCytoscape, 100);
        return;
    }
    
    console.log('Initializing Cytoscape...');
    
    cy = cytoscape({
        container: container,
        
        style: [
            {
                selector: 'node',
                style: {
                    'background-color': 'data(color)',
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '12px',
                    'width': '60px',
                    'height': '60px',
                    'text-wrap': 'wrap',
                    'text-max-width': '80px',
                    'border-width': 2,
                    'border-color': '#666'
                }
            },
            {
                selector: 'node[nodeType="literal"]',
                style: {
                    'shape': 'rectangle',
                    'width': '80px',
                    'height': '40px'
                }
            },
            {
                selector: 'edge',
                style: {
                    'width': 2,
                    'line-color': '#999',
                    'target-arrow-color': '#999',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'label': 'data(label)',
                    'font-size': '10px',
                    'text-rotation': 'autorotate',
                    'text-margin-y': -10
                }
            },
            {
                selector: 'edge[edgeType="subClassOf"]',
                style: {
                    'line-color': '#4169E1',
                    'target-arrow-color': '#4169E1',
                    'width': 3
                }
            },
            {
                selector: 'edge[edgeType="domain"]',
                style: {
                    'line-color': '#228B22',
                    'target-arrow-color': '#228B22',
                    'line-style': 'dashed'
                }
            },
            {
                selector: 'edge[edgeType="range"]',
                style: {
                    'line-color': '#228B22',
                    'target-arrow-color': '#228B22',
                    'line-style': 'dotted'
                }
            },
            {
                selector: ':selected',
                style: {
                    'border-width': 4,
                    'border-color': '#FFD700'
                }
            },
            {
                selector: 'node[expanded="true"]',
                style: {
                    'border-width': 3,
                    'border-color': '#90EE90'
                }
            }
        ],
        
        layout: {
            name: 'cose',
            padding: 50
        },
        
        minZoom: 0.1,
        maxZoom: 3,
        wheelSensitivity: 0.2
    });
    
    cy.on('tap', 'node[nodeType!="literal"]', function(evt) {
        const node = evt.target;
        if (!autoExpand || !expandedNodes.has(node.id())) {
            expandNode(node.id());
        }
    });
    
    console.log('Cytoscape initialized successfully');
    
    // Add auto-expand toggle to the UI
    addAutoExpandToggle();
}

// Add toggle for automatic expansion
function addAutoExpandToggle() {
    const graphInfo = document.getElementById('graph-info');
    if (graphInfo && !document.getElementById('auto-expand-toggle')) {
        const toggleHtml = `
            <div style="margin-top: 10px;">
                <label style="cursor: pointer;">
                    <input type="checkbox" id="auto-expand-toggle" checked onchange="toggleAutoExpand()">
                    Automatic expansion (uncheck for manual click-to-expand)
                </label>
            </div>
        `;
        graphInfo.insertAdjacentHTML('beforeend', toggleHtml);
    }
}

// Toggle automatic expansion
function toggleAutoExpand() {
    autoExpand = document.getElementById('auto-expand-toggle').checked;
    if (!autoExpand) {
        // Stop any ongoing expansion
        expansionQueue = [];
        isExpanding = false;
    }
}

// Get node color based on type
function getNodeColor(types) {
    const classTypes = [
        'http://www.w3.org/2002/07/owl#Class',
        'http://www.w3.org/2000/01/rdf-schema#Class'
    ];
    
    const propertyTypes = [
        'http://www.w3.org/2002/07/owl#ObjectProperty',
        'http://www.w3.org/2002/07/owl#DatatypeProperty',
        'http://www.w3.org/2002/07/owl#AnnotationProperty',
        'http://www.w3.org/1999/02/22-rdf-syntax-ns#Property'
    ];
    
    if (types.some(t => classTypes.includes(t))) return '#4169E1';
    if (types.some(t => propertyTypes.includes(t))) return '#228B22';
    return '#FF8C00';
}

// Get short label for display
function getShortLabel(uri, labels) {
    if (labels && labels.length > 0) {
        const englishLabel = labels.find(l => l.lang === 'en');
        if (englishLabel) return englishLabel.value;
        return labels[0].value;
    }
    
    const parts = uri.split(/[#\/]/);
    return parts[parts.length - 1] || uri;
}

// Initialize typeahead for graph search
function initializeGraphTypeahead() {
    const searchInput = document.getElementById('graph-search');
    const graphSelect = document.getElementById('graph-namespace-select');
    let typeaheadTimeout = null;
    let currentSuggestions = [];
    
    // Create suggestions container if it doesn't exist
    if (!document.getElementById('graph-suggestions')) {
        const suggestionsDiv = document.createElement('div');
        suggestionsDiv.id = 'graph-suggestions';
        suggestionsDiv.className = 'suggestions-dropdown';
        searchInput.parentNode.insertBefore(suggestionsDiv, searchInput.nextSibling);
    }
    
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.trim();
        
        // Clear previous timeout
        if (typeaheadTimeout) {
            clearTimeout(typeaheadTimeout);
        }
        
        // Hide suggestions if search is too short
        if (searchTerm.length < 3) {
            document.getElementById('graph-suggestions').style.display = 'none';
            return;
        }
        
        // Debounce the search
        typeaheadTimeout = setTimeout(async () => {
            await performGraphSearch(searchTerm, graphSelect.value);
        }, 300);
    });
    
    // Handle keyboard navigation
    searchInput.addEventListener('keydown', function(e) {
        const suggestions = document.getElementById('graph-suggestions');
        const items = suggestions.querySelectorAll('.suggestion-item');
        const selected = suggestions.querySelector('.suggestion-item.selected');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!selected && items.length > 0) {
                items[0].classList.add('selected');
            } else if (selected && selected.nextElementSibling) {
                selected.classList.remove('selected');
                selected.nextElementSibling.classList.add('selected');
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (selected && selected.previousElementSibling) {
                selected.classList.remove('selected');
                selected.previousElementSibling.classList.add('selected');
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selected) {
                const index = parseInt(selected.dataset.index);
                selectGraphSuggestion(index);
            } else {
                searchAndAddNode();
            }
        } else if (e.key === 'Escape') {
            suggestions.style.display = 'none';
        }
    });
    
    // Hide suggestions when clicking outside
    document.addEventListener('click', function(e) {
        if (!searchInput.contains(e.target) && !document.getElementById('graph-suggestions').contains(e.target)) {
            document.getElementById('graph-suggestions').style.display = 'none';
        }
    });
}

// Perform search for typeahead
async function performGraphSearch(searchTerm, graphUri) {
    const suggestionsDiv = document.getElementById('graph-suggestions');
    suggestionsDiv.innerHTML = '<div class="loading">Searching...</div>';
    suggestionsDiv.style.display = 'block';
    
    try {
        // Build query that searches for both classes and instances
        let searchQuery = `
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
            PREFIX owl: <http://www.w3.org/2002/07/owl#>
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
            
            SELECT DISTINCT ?resource ?label ?type WHERE {
        `;
        
        if (graphUri && graphUri !== 'all') {
            searchQuery += `GRAPH <${graphUri}> {`;
        }
        
        searchQuery += `
            {
                # Search for classes
                ?resource rdf:type ?classType .
                FILTER(?classType IN (owl:Class, rdfs:Class))
                ?resource ?labelProp ?label .
                FILTER(?labelProp IN (rdfs:label, skos:prefLabel))
                FILTER(CONTAINS(LCASE(STR(?label)), LCASE("${searchTerm}")))
                BIND("Class" AS ?type)
            } UNION {
                # Search for instances
                ?resource rdf:type ?class .
                ?class rdf:type ?classType .
                FILTER(?classType IN (owl:Class, rdfs:Class))
                ?resource ?labelProp ?label .
                FILTER(?labelProp IN (rdfs:label, skos:prefLabel))
                FILTER(CONTAINS(LCASE(STR(?label)), LCASE("${searchTerm}")))
                BIND("Instance" AS ?type)
            } UNION {
                # Search by URI fragment
                ?resource ?p ?o .
                FILTER(CONTAINS(LCASE(STR(?resource)), LCASE("${searchTerm}")))
                OPTIONAL { 
                    ?resource ?labelProp ?label .
                    FILTER(?labelProp IN (rdfs:label, skos:prefLabel))
                }
                OPTIONAL {
                    ?resource rdf:type ?class .
                    BIND(IF(EXISTS{?resource rdf:type owl:Class} || EXISTS{?resource rdf:type rdfs:Class}, "Class", "Instance") AS ?type)
                }
            }
        `;
        
        if (graphUri && graphUri !== 'all') {
            searchQuery += '}';
        }
        
        searchQuery += `
            } LIMIT 20
        `;
        
        const response = await fetch(`${API_BASE}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: searchQuery })
        });
        
        const data = await response.json();
        
        if (data.results && data.results[0] && data.results[0].results.bindings) {
            currentSuggestions = data.results[0].results.bindings;
            displayGraphSuggestions(currentSuggestions);
        } else {
            suggestionsDiv.innerHTML = '<div class="no-results">No matches found</div>';
        }
        
    } catch (error) {
        suggestionsDiv.innerHTML = '<div class="error">Search error</div>';
        console.error('Search error:', error);
    }
}

// Display suggestions
function displayGraphSuggestions(suggestions) {
    const suggestionsDiv = document.getElementById('graph-suggestions');
    
    if (suggestions.length === 0) {
        suggestionsDiv.innerHTML = '<div class="no-results">No matches found</div>';
        return;
    }
    
    let html = '';
    suggestions.forEach((suggestion, index) => {
        const resource = suggestion.resource.value;
        const label = suggestion.label ? suggestion.label.value : getShortLabel(resource, []);
        const type = suggestion.type ? suggestion.type.value : 'Resource';
        
        html += `
            <div class="suggestion-item" data-index="${index}" onclick="selectGraphSuggestion(${index})">
                <div class="suggestion-label">${escapeHtml(label)}</div>
                <div class="suggestion-details">
                    <span class="suggestion-type">${type}</span>
                    <span class="suggestion-uri">${escapeHtml(compressUri(resource))}</span>
                </div>
            </div>
        `;
    });
    
    suggestionsDiv.innerHTML = html;
    suggestionsDiv.style.display = 'block';
}

// Select a suggestion
function selectGraphSuggestion(index) {
    if (index >= 0 && index < currentSuggestions.length) {
        const suggestion = currentSuggestions[index];
        const resource = suggestion.resource.value;
        const label = suggestion.label ? suggestion.label.value : getShortLabel(resource, []);
        
        document.getElementById('graph-search').value = label;
        document.getElementById('graph-suggestions').style.display = 'none';
        
        // Show confirmation
        const infoDiv = document.getElementById('graph-info');
        const type = suggestion.type ? suggestion.type.value : 'Resource';
        infoDiv.innerHTML = `<p>• Found: <strong>${escapeHtml(label)}</strong> (${type}) - <code>${escapeHtml(compressUri(resource))}</code></p>`;
        
        // Store the selected URI for adding to graph
        document.getElementById('graph-search').dataset.selectedUri = resource;
    }
}

// Updated search and add node function
async function searchAndAddNode() {
    const searchInput = document.getElementById('graph-search');
    const searchTerm = searchInput.value.trim();
    
    if (!searchTerm) return;
    
    const infoDiv = document.getElementById('graph-info');
    
    // Check if we have a pre-selected URI from typeahead
    let resourceUri = searchInput.dataset.selectedUri;
    
    if (!resourceUri) {
        // If no pre-selected URI, treat as direct URI or search
        if (searchTerm.startsWith('http://') || searchTerm.startsWith('https://')) {
            resourceUri = searchTerm;
        } else {
            infoDiv.innerHTML = '<p class="error">Please select a resource from the search suggestions</p>';
            return;
        }
    }
    
    // Clear the selection
    delete searchInput.dataset.selectedUri;
    
    try {
        await addNodeToGraph(resourceUri);
        
        infoDiv.innerHTML += '<p>✓ Node added to graph. ' + (autoExpand ? 'Automatically expanding connections...' : 'Click on it to expand connections.') + '</p>';
        searchInput.value = '';
        document.getElementById('graph-suggestions').style.display = 'none';
        
        // If auto-expand is on, start the expansion process
        if (autoExpand && !expandedNodes.has(resourceUri)) {
            setTimeout(() => {
                expandNode(resourceUri);
            }, 500);
        }
        
    } catch (error) {
        infoDiv.innerHTML = '<p class="error">Error adding node: ' + escapeHtml(error.message) + '</p>';
    }
}

// Add a node to the graph
async function addNodeToGraph(uri, isLiteral = false, literalValue = null) {
    if (graphNodes.has(uri)) {
        cy.$id(uri).select();
        cy.center(cy.$id(uri));
        return;
    }
    
    if (isLiteral) {
        cy.add({
            data: {
                id: uri,
                label: literalValue || uri,
                color: '#808080',
                nodeType: 'literal'
            }
        });
        graphNodes.set(uri, true);
        return;
    }
    
    const query = `
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
        
        SELECT ?type ?label ?labelProp ?lang WHERE {
            OPTIONAL { <${uri}> rdf:type ?type }
            OPTIONAL {
                <${uri}> ?labelProp ?label .
                FILTER(?labelProp IN (rdfs:label, skos:prefLabel, skos:altLabel))
                BIND(LANG(?label) as ?lang)
            }
        }
    `;
    
    const response = await fetch(`${API_BASE}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    
    const data = await response.json();
    const bindings = data.results[0].results.bindings;
    
    const types = [...new Set(bindings.filter(b => b.type).map(b => b.type.value))];
    const labels = bindings.filter(b => b.label).map(b => ({
        value: b.label.value,
        lang: b.lang ? b.lang.value : '',
        property: b.labelProp.value
    }));
    
    const nodeData = {
        id: uri,
        label: getShortLabel(uri, labels),
        color: getNodeColor(types),
        fullUri: uri,
        types: types,
        labels: labels,
        nodeType: 'resource'
    };
    
    cy.add({ data: nodeData });
    graphNodes.set(uri, true);
    
    applyLayout();
}

// Expand a node (show its connections) - Fixed for ontology visualization
async function expandNode(nodeId) {
    if (expandedNodes.has(nodeId)) {
        return; // Already expanded
    }
    
    const infoDiv = document.getElementById('graph-info');
    infoDiv.innerHTML = '<p>Loading connections...</p>';
    
    try {
        // Mark node as expanded
        expandedNodes.add(nodeId);
        if (cy.$id(nodeId).length > 0) {
            cy.$id(nodeId).data('expanded', 'true');
        }
        
        // For ontology visualization, use different queries
        // 1. Get subclasses
        const subclassQuery = `
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            PREFIX owl: <http://www.w3.org/2002/07/owl#>
            
            SELECT DISTINCT ?class WHERE {
                ?class rdfs:subClassOf <${nodeId}> .
                FILTER (!isBlank(?class))
            } LIMIT 20
        `;
        
        // 2. Get superclasses
        const superclassQuery = `
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            
            SELECT DISTINCT ?class WHERE {
                <${nodeId}> rdfs:subClassOf ?class .
                FILTER (!isBlank(?class))
            } LIMIT 20
        `;
        
        // 3. Get properties that have this class as domain
        const domainQuery = `
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            PREFIX owl: <http://www.w3.org/2002/07/owl#>
            
            SELECT DISTINCT ?property ?range WHERE {
                ?property rdfs:domain <${nodeId}> .
                OPTIONAL { ?property rdfs:range ?range }
                FILTER (!isBlank(?property))
            } LIMIT 15
        `;
        
        // 4. Get properties that have this class as range
        const rangeQuery = `
            PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
            PREFIX owl: <http://www.w3.org/2002/07/owl#>
            
            SELECT DISTINCT ?property ?domain WHERE {
                ?property rdfs:range <${nodeId}> .
                OPTIONAL { ?property rdfs:domain ?domain }
                FILTER (!isBlank(?property))
            } LIMIT 15
        `;
        
        let addedCount = 0;
        const nodesToExpand = [];
        
        // Execute all queries in parallel
        const [subclassResponse, superclassResponse, domainResponse, rangeResponse] = await Promise.all([
            fetch(`${API_BASE}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: subclassQuery })
            }),
            fetch(`${API_BASE}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: superclassQuery })
            }),
            fetch(`${API_BASE}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: domainQuery })
            }),
            fetch(`${API_BASE}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: rangeQuery })
            })
        ]);
        
        const [subclassData, superclassData, domainData, rangeData] = await Promise.all([
            subclassResponse.json(),
            superclassResponse.json(),
            domainResponse.json(),
            rangeResponse.json()
        ]);
        
        // Process subclasses
        if (subclassData.results && subclassData.results[0]) {
            const bindings = subclassData.results[0].results.bindings || [];
            for (const binding of bindings) {
                const classUri = binding.class.value;
                if (!graphNodes.has(classUri)) {
                    await addNodeToGraph(classUri);
                    nodesToExpand.push(classUri);
                    addedCount++;
                }
                
                const edgeId = `${classUri}-subClassOf-${nodeId}`;
                if (cy.$id(edgeId).length === 0) {
                    cy.add({
                        data: {
                            id: edgeId,
                            source: classUri,
                            target: nodeId,
                            label: 'subClassOf',
                            edgeType: 'subClassOf'
                        }
                    });
                }
            }
        }
        
        // Process superclasses
        if (superclassData.results && superclassData.results[0]) {
            const bindings = superclassData.results[0].results.bindings || [];
            for (const binding of bindings) {
                const classUri = binding.class.value;
                if (!graphNodes.has(classUri)) {
                    await addNodeToGraph(classUri);
                    nodesToExpand.push(classUri);
                    addedCount++;
                }
                
                const edgeId = `${nodeId}-subClassOf-${classUri}`;
                if (cy.$id(edgeId).length === 0) {
                    cy.add({
                        data: {
                            id: edgeId,
                            source: nodeId,
                            target: classUri,
                            label: 'subClassOf',
                            edgeType: 'subClassOf'
                        }
                    });
                }
            }
        }
        
        // Process properties with this class as domain
        if (domainData.results && domainData.results[0]) {
            const bindings = domainData.results[0].results.bindings || [];
            for (const binding of bindings) {
                const propertyUri = binding.property.value;
                const rangeUri = binding.range ? binding.range.value : null;
                
                // Add property edge from this class
                if (rangeUri && !graphNodes.has(rangeUri)) {
                    await addNodeToGraph(rangeUri);
                    nodesToExpand.push(rangeUri);
                    addedCount++;
                }
                
                if (rangeUri) {
                    const edgeId = `${nodeId}-${propertyUri}-${rangeUri}`;
                    if (cy.$id(edgeId).length === 0) {
                        cy.add({
                            data: {
                                id: edgeId,
                                source: nodeId,
                                target: rangeUri,
                                label: getShortLabel(propertyUri, []),
                                edgeType: 'property'
                            }
                        });
                    }
                }
            }
        }
        
        // Process properties with this class as range
        if (rangeData.results && rangeData.results[0]) {
            const bindings = rangeData.results[0].results.bindings || [];
            for (const binding of bindings) {
                const propertyUri = binding.property.value;
                const domainUri = binding.domain ? binding.domain.value : null;
                
                if (domainUri && !graphNodes.has(domainUri)) {
                    await addNodeToGraph(domainUri);
                    nodesToExpand.push(domainUri);
                    addedCount++;
                }
                
                if (domainUri) {
                    const edgeId = `${domainUri}-${propertyUri}-${nodeId}`;
                    if (cy.$id(edgeId).length === 0) {
                        cy.add({
                            data: {
                                id: edgeId,
                                source: domainUri,
                                target: nodeId,
                                label: getShortLabel(propertyUri, []),
                                edgeType: 'property'
                            }
                        });
                    }
                }
            }
        }
        
        // Apply hierarchical layout for better visualization
        cy.layout({
            name: 'breadthfirst',
            directed: true,
            padding: 50,
            spacingFactor: 1.5,
            animate: true,
            animationDuration: 500
        }).run();
        
        infoDiv.innerHTML = `<p>Added ${addedCount} new nodes. Total nodes: ${graphNodes.size}</p>`;
        
        // If auto-expand is on, queue the new nodes for expansion
        if (autoExpand && nodesToExpand.length > 0) {
            // Add nodes to expansion queue
            expansionQueue.push(...nodesToExpand);
            
            // Process queue with delay
            if (!isExpanding) {
                processExpansionQueue();
            }
        }
        
    } catch (error) {
        infoDiv.innerHTML = '<p class="error">Error expanding node: ' + escapeHtml(error.message) + '</p>';
        expandedNodes.delete(nodeId); // Remove from expanded set on error
    }
}

// Process expansion queue with delays to create visual effect
async function processExpansionQueue() {
    if (!autoExpand || expansionQueue.length === 0) {
        isExpanding = false;
        return;
    }
    
    isExpanding = true;
    
    // Take next node from queue
    const nodeId = expansionQueue.shift();
    
    // Only expand if not already expanded and if we haven't expanded too many
    if (!expandedNodes.has(nodeId) && graphNodes.size < 50) {
        await expandNode(nodeId);
    }
    
    // Continue processing queue after delay
    if (expansionQueue.length > 0 && autoExpand) {
        setTimeout(() => {
            processExpansionQueue();
        }, 1000); // 1 second delay between expansions
    } else {
        isExpanding = false;
    }
}

// Apply selected layout
function applyLayout() {
    const layoutName = document.getElementById('layout-select').value;
    
    const layoutOptions = {
        name: layoutName,
        padding: 50,
        animate: true,
        animationDuration: 500
    };
    
    if (layoutName === 'breadthfirst') {
        layoutOptions.directed = true;
        layoutOptions.spacingFactor = 1.5;
    } else if (layoutName === 'concentric') {
        layoutOptions.levelWidth = function() { return 2; };
    }
    
    cy.layout(layoutOptions).run();
}

// Clear the graph
function clearGraph() {
    if (cy) {
        cy.elements().remove();
        graphNodes.clear();
        expandedNodes.clear();
        expansionQueue = [];
        isExpanding = false;
        document.getElementById('graph-info').innerHTML = '<p>Graph cleared. Search for a node to begin.</p>';
        addAutoExpandToggle(); // Re-add the toggle
    }
}

// Test graph functionality
function testGraph() {
    if (!cy) {
        console.error('Cytoscape not initialized');
        return;
    }
    
    cy.add([
        { data: { id: 'a', label: 'Node A' } },
        { data: { id: 'b', label: 'Node B' } },
        { data: { id: 'ab', source: 'a', target: 'b', label: 'connects to' } }
    ]);
    
    cy.layout({ name: 'cose' }).run();
    cy.fit();
}