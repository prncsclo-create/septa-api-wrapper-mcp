/**
 * SEPTA Transit MCP Server - Node.js Implementation
 * Provides real-time bus and trolley information for Philadelphia
 */

const https = require('https');
const http = require('http');

/**
 * Make HTTP GET request
 */
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err) {
            reject(new Error(`Failed to parse JSON: ${err.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', (err) => {
      reject(new Error(`Request failed: ${err.message}`));
    });
  });
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
          description: 'The route number (e.g., "23", "45", "G")'
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
      const url = `https://www3.septa.org/TransitView/index.php?route=${encodeURIComponent(args.route)}`;
      const data = await makeRequest(url);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }]
      };
    }
    
    case 'get_bus_detours': {
      if (!args.route) {
        throw new Error('route parameter is required');
      }
      const url = `https://www3.septa.org/api/BusDetours/index.php?route=${encodeURIComponent(args.route)}`;
      const data = await makeRequest(url);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }]
      };
    }
    
    case 'get_transit_alerts': {
      const url = 'https://www3.septa.org/api/Alerts/index.php';
      const data = await makeRequest(url);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }]
      };
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
              version: '1.0.0'
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
      version: '1.0.0',
      status: 'active',
      protocol: 'MCP JSON-RPC 2.0',
      tools: Object.keys(TOOLS),
      endpoints: {
        health: 'GET /',
        mcp: 'POST /'
      },
      documentation: 'https://github.com/prncsclo-create/septa-api-wrapper-mcp'
    });
    return;
  }
  
  // Handle POST - MCP requests
  if (req.method === 'POST') {
    try {
      const response = await handleMCPRequest(req.body);
      res.status(200).json(response);
    } catch (error) {
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
