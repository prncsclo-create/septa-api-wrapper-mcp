/**
 * SEPTA Transit MCP Server - Node.js Implementation
 * Provides real-time bus and trolley information for Philadelphia
 */

const https = require('https');
const http = require('http');

/**
 * Make HTTP/HTTPS GET request with enhanced debugging
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    console.log(`[DEBUG] Making request to: ${url}`);
    
    protocol.get(url, (res) => {
      let data = '';
      
      console.log(`[DEBUG] Response status: ${res.statusCode}`);
      console.log(`[DEBUG] Response headers:`, res.headers);
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`[DEBUG] Response body length: ${data.length}`);
        console.log(`[DEBUG] Response body preview:`, data.substring(0, 200));
        
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err) {
            reject(new Error(`Failed to parse JSON: ${err.message}. Response: ${data.substring(0, 200)}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', (err) => {
      console.error(`[ERROR] Request failed:`, err);
      reject(new Error(`Request failed: ${err.message}`));
    });
  });
}

/**
 * Try multiple endpoint variations for TransitView
 */
async function tryTransitViewEndpoints(route) {
  const endpoints = [
    // Official API endpoint (HTTPS)
    `https://www3.septa.org/api/TransitView/index.php?route=${route}`,
    // Official API endpoint (HTTP)
    `http://www3.septa.org/api/TransitView/index.php?route=${route}`,
    // Hackathon endpoint (HTTP)
    `http://www3.septa.org/hackathon/TransitView/${route}`,
    // TransitViewAll endpoint
    `https://www3.septa.org/api/TransitViewAll/index.php`
  ];
  
  console.log(`[DEBUG] Trying ${endpoints.length} endpoint variations for route: ${route}`);
  
  let lastError = null;
  
  for (const endpoint of endpoints) {
    try {
      console.log(`[DEBUG] Attempting endpoint: ${endpoint}`);
      const data = await makeRequest(endpoint);
      
      // If TransitViewAll, filter by route
      if (endpoint.includes('TransitViewAll')) {
        console.log(`[DEBUG] TransitViewAll response received, filtering for route ${route}`);
        // TransitViewAll returns all routes, need to filter
        if (data.routes && data.routes[route]) {
          return data.routes[route];
        }
        // Try alternate structure
        if (Array.isArray(data)) {
          const filtered = data.filter(item => item.route === route);
          if (filtered.length > 0) {
            return { bus: filtered };
          }
        }
      }
      
      // Success - return data
      console.log(`[DEBUG] Success with endpoint: ${endpoint}`);
      return data;
      
    } catch (error) {
      console.log(`[DEBUG] Failed with endpoint ${endpoint}: ${error.message}`);
      lastError = error;
      // Continue to next endpoint
    }
  }
  
  // If all endpoints failed, throw the last error with context
  throw new Error(`All TransitView endpoints failed. Last error: ${lastError?.message}. Tried ${endpoints.length} variations.`);
}

/**
 * Tool definitions for MCP
 */
const TOOLS = {
  get_bus_locations: {
    name: 'get_bus_locations',
    description: 'Get real-time locations for all vehicles on a specific SEPTA route (bus or trolley).',
    inputSchema: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          description: 'The route number (e.g., "23", "33", "45", "G")'
        }
      },
      required: ['route']
    }
  },
  get_bus_detours: {
    name: 'get_bus_detours',
    description: 'Check for active detours on a specific SEPTA route.',
    inputSchema: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          description: 'The route number to check for detours'
        }
      },
      required: ['route']
    }
  },
  get_transit_alerts: {
    name: 'get_transit_alerts',
    description: 'Get general system alerts and advisories for SEPTA services.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
};

/**
 * Execute tool call
 */
async function executeTool(toolName, args) {
  switch (toolName) {
    case 'get_bus_locations': {
      if (!args.route) {
        throw new Error('route parameter is required');
      }
      
      const route = encodeURIComponent(args.route);
      console.log(`[INFO] Getting bus locations for route: ${args.route}`);
      
      try {
        const data = await tryTransitViewEndpoints(route);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (error) {
        console.error(`[ERROR] Failed to get bus locations:`, error);
        throw error;
      }
    }
    
    case 'get_bus_detours': {
      if (!args.route) {
        throw new Error('route parameter is required');
      }
      
      const route = encodeURIComponent(args.route);
      console.log(`[INFO] Getting bus detours for route: ${args.route}`);
      
      // Try both HTTPS and HTTP
      try {
        const url = `https://www3.septa.org/api/BusDetours/index.php?route=${route}`;
        const data = await makeRequest(url);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (error) {
        console.log(`[DEBUG] HTTPS failed, trying HTTP for BusDetours`);
        const url = `http://www3.septa.org/api/BusDetours/index.php?route=${route}`;
        const data = await makeRequest(url);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      }
    }
    
    case 'get_transit_alerts': {
      console.log(`[INFO] Getting transit alerts`);
      
      // Try both HTTPS and HTTP
      try {
        const url = 'https://www3.septa.org/api/Alerts/index.php';
        const data = await makeRequest(url);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      } catch (error) {
        console.log(`[DEBUG] HTTPS failed, trying HTTP for Alerts`);
        const url = 'http://www3.septa.org/api/Alerts/index.php';
        const data = await makeRequest(url);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(data, null, 2)
          }]
        };
      }
    }
    
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Handle MCP JSON-RPC 2.0 requests
 */
async function handleMCPRequest(body) {
  const { jsonrpc, method, params, id } = body;
  
  // Validate JSON-RPC version
  if (jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid Request: jsonrpc must be "2.0"'
      },
      id: id || null
    };
  }
  
  try {
    switch (method) {
      case 'initialize': {
        return {
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'SEPTA Transit MCP',
              version: '1.0.2'
            }
          },
          id
        };
      }
      
      case 'tools/list': {
        return {
          jsonrpc: '2.0',
          result: {
            tools: Object.values(TOOLS)
          },
          id
        };
      }
      
      case 'tools/call': {
        const { name, arguments: args } = params;
        const result = await executeTool(name, args || {});
        return {
          jsonrpc: '2.0',
          result,
          id
        };
      }
      
      default:
        return {
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          },
          id
        };
    }
  } catch (error) {
    console.error(`[ERROR] MCP request failed:`, error);
    return {
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error.message || 'Internal error'
      },
      id
    };
  }
}

/**
 * Vercel serverless function handler
 */
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // Handle GET - Health check / Info
  if (req.method === 'GET') {
    res.status(200).json({
      name: 'SEPTA Transit MCP',
      version: '1.0.2',
      status: 'active',
      protocol: 'MCP JSON-RPC 2.0',
      tools: Object.keys(TOOLS),
      endpoints: {
        health: 'GET /',
        mcp: 'POST /'
      },
      apiEndpoints: {
        primary: [
          'https://www3.septa.org/api/TransitView/index.php?route={route}',
          'http://www3.septa.org/api/TransitView/index.php?route={route}'
        ],
        fallback: [
          'http://www3.septa.org/hackathon/TransitView/{route}',
          'https://www3.septa.org/api/TransitViewAll/index.php'
        ],
        other: {
          busDetours: 'https://www3.septa.org/api/BusDetours/index.php',
          alerts: 'https://www3.septa.org/api/Alerts/index.php'
        }
      },
      documentation: 'https://github.com/prncsclo-create/septa-api-wrapper-mcp',
      note: 'Automatically tries multiple endpoint variations for maximum reliability'
    });
    return;
  }
  
  // Handle POST - MCP requests
  if (req.method === 'POST') {
    try {
      const response = await handleMCPRequest(req.body);
      res.status(200).json(response);
    } catch (error) {
      console.error(`[ERROR] Server error:`, error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
          data: error.message
        },
        id: null
      });
    }
    return;
  }
  
  // Method not allowed
  res.status(405).json({
    error: 'Method not allowed',
    allowed: ['GET', 'POST', 'OPTIONS']
  });
};
