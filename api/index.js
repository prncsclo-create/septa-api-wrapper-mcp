/**
 * SEPTA Transit MCP Server - Node.js Implementation with GTFS-Realtime Support
 * Provides real-time bus and trolley information for Philadelphia
 * Version 3.0 - GTFS-RT Integration
 */

const https = require('https');
const http = require('http');
const gtfsParser = require('./gtfs-parser');

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
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`[DEBUG] Response body length: ${data.length}`);
        
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
 * Get bus locations using SEPTA TransitView API (legacy fallback)
 */
async function getTransitViewData(route) {
  const primaryUrl = `https://www3.septa.org/api/TransitView/index.php?route=${route}`;
  
  console.log(`[INFO] Fetching TransitView data for route: ${route}`);
  console.log(`[DEBUG] Using TransitView API endpoint: ${primaryUrl}`);
  
  try {
    const data = await makeRequest(primaryUrl);
    console.log(`[DEBUG] TransitView API request successful`);
    return data;
  } catch (error) {
    console.error(`[ERROR] TransitView API request failed: ${error.message}`);
    
    // Fallback to HTTP if HTTPS fails
    console.log(`[DEBUG] Attempting HTTP fallback`);
    const fallbackUrl = `http://www3.septa.org/api/TransitView/index.php?route=${route}`;
    
    try {
      const data = await makeRequest(fallbackUrl);
      console.log(`[DEBUG] HTTP fallback successful`);
      return data;
    } catch (fallbackError) {
      console.error(`[ERROR] HTTP fallback also failed: ${fallbackError.message}`);
      throw new Error(`TransitView API failed for route ${route}. HTTPS error: ${error.message}. HTTP error: ${fallbackError.message}`);
    }
  }
}

/**
 * Format GTFS-RT vehicle data to match TransitView format (for compatibility)
 */
function formatGTFSVehicleData(gtfsData) {
  return {
    route: gtfsData.routeId,
    timestamp: new Date(gtfsData.timestamp).toISOString(),
    vehicleCount: gtfsData.vehicleCount,
    isLoopRoute: gtfsData.isLoopRoute,
    dataSource: 'GTFS-Realtime',
    vehicles: gtfsData.vehicles.map(v => ({
      // GTFS-RT native fields
      vehicleId: v.vehicleId,
      label: v.label,
      lat: v.latitude ? v.latitude.toString() : null,
      lng: v.longitude ? v.longitude.toString() : null,
      latitude: v.latitude,
      longitude: v.longitude,
      
      // Movement data
      bearing: v.bearing,
      speed: v.speed,
      
      // Trip information
      tripId: v.tripId,
      routeId: v.routeId,
      directionId: v.directionId,
      direction: v.directionId === 0 ? 'Outbound' : 'Inbound',
      
      // Stop information
      currentStopSequence: v.currentStopSequence,
      stopId: v.stopId,
      currentStatus: v.currentStatus,
      
      // Service information
      delay: v.delay || 0,
      congestionLevel: v.congestionLevel,
      occupancyStatus: v.occupancyStatus,
      
      // Special flags
      isLoopRoute: v.isLoopRoute,
      
      // Timestamp
      timestamp: v.timestamp ? new Date(v.timestamp * 1000).toISOString() : null,
    }))
  };
}

/**
 * Tool definitions for MCP
 */
const TOOLS = {
  get_bus_locations: {
    name: 'get_bus_locations',
    description: 'Get real-time locations for all vehicles on a specific SEPTA route using GTFS-Realtime feed. Returns comprehensive vehicle data including positions, directions, speeds, delays, and trip information. Supports loop route detection and proper direction_id handling.',
    inputSchema: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          description: 'The route number (e.g., "23", "33", "45", "G", "36"). Use official SEPTA route numbers.'
        },
        useLegacy: {
          type: 'boolean',
          description: 'If true, use legacy TransitView API instead of GTFS-Realtime. Default: false',
          default: false
        }
      },
      required: ['route']
    }
  },
  get_bus_locations_gtfs: {
    name: 'get_bus_locations_gtfs',
    description: 'Get real-time vehicle positions using SEPTA GTFS-Realtime feed with enhanced data including bearing, speed, delay, and direction detection. This is the recommended method for real-time tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          description: 'The route number to track'
        }
      },
      required: ['route']
    }
  },
  get_trip_updates: {
    name: 'get_trip_updates',
    description: 'Get real-time trip updates including delays and stop time predictions for a specific route using GTFS-Realtime feed.',
    inputSchema: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          description: 'The route number to get trip updates for'
        }
      },
      required: ['route']
    }
  },
  get_service_alerts: {
    name: 'get_service_alerts',
    description: 'Get service alerts and advisories from GTFS-Realtime feed. Optionally filter by route.',
    inputSchema: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          description: 'Optional route number to filter alerts. If not provided, returns all alerts.'
        }
      }
    }
  },
  get_bus_detours: {
    name: 'get_bus_detours',
    description: 'Check for active detours on a specific SEPTA route using the Bus Detours API (legacy endpoint).',
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
    description: 'Get general system alerts using the legacy Alerts API (use get_service_alerts for GTFS-RT alerts).',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  clear_gtfs_cache: {
    name: 'clear_gtfs_cache',
    description: 'Clear the GTFS-Realtime feed cache. Useful for testing or forcing fresh data retrieval.',
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
      
      const route = args.route.toString();
      console.log(`[INFO] Getting bus locations for route: ${route}`);
      
      // Use GTFS-RT by default unless useLegacy is true
      if (args.useLegacy === true) {
        console.log(`[INFO] Using legacy TransitView API`);
        try {
          const data = await getTransitViewData(encodeURIComponent(route));
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
      } else {
        console.log(`[INFO] Using GTFS-Realtime feed`);
        try {
          const gtfsData = await gtfsParser.getRouteData(route);
          const formattedData = formatGTFSVehicleData(gtfsData);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(formattedData, null, 2)
            }]
          };
        } catch (error) {
          console.error(`[ERROR] GTFS-RT failed, falling back to TransitView:`, error);
          // Fallback to TransitView if GTFS-RT fails
          const data = await getTransitViewData(encodeURIComponent(route));
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                ...data,
                dataSource: 'TransitView (fallback)',
                note: `GTFS-RT unavailable: ${error.message}`
              }, null, 2)
            }]
          };
        }
      }
    }
    
    case 'get_bus_locations_gtfs': {
      if (!args.route) {
        throw new Error('route parameter is required');
      }
      
      const route = args.route.toString();
      console.log(`[INFO] Getting GTFS-RT bus locations for route: ${route}`);
      
      try {
        const gtfsData = await gtfsParser.getRouteData(route);
        const formattedData = formatGTFSVehicleData(gtfsData);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(formattedData, null, 2)
          }]
        };
      } catch (error) {
        console.error(`[ERROR] Failed to get GTFS-RT bus locations:`, error);
        throw error;
      }
    }
    
    case 'get_trip_updates': {
      if (!args.route) {
        throw new Error('route parameter is required');
      }
      
      const route = args.route.toString();
      console.log(`[INFO] Getting trip updates for route: ${route}`);
      
      try {
        const updates = await gtfsParser.getTripUpdates(route);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              route: route,
              timestamp: new Date().toISOString(),
              updateCount: updates.length,
              updates: updates
            }, null, 2)
          }]
        };
      } catch (error) {
        console.error(`[ERROR] Failed to get trip updates:`, error);
        throw error;
      }
    }
    
    case 'get_service_alerts': {
      const route = args.route ? args.route.toString() : null;
      console.log(`[INFO] Getting service alerts${route ? ` for route ${route}` : ''}`);
      
      try {
        const alerts = await gtfsParser.getServiceAlerts(route);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              route: route || 'all',
              timestamp: new Date().toISOString(),
              alertCount: alerts.length,
              alerts: alerts
            }, null, 2)
          }]
        };
      } catch (error) {
        console.error(`[ERROR] Failed to get service alerts:`, error);
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
      console.log(`[INFO] Getting transit alerts (legacy API)`);
      
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
    
    case 'clear_gtfs_cache': {
      console.log(`[INFO] Clearing GTFS-RT cache`);
      gtfsParser.clearCache();
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'GTFS-Realtime cache cleared',
            timestamp: new Date().toISOString()
          }, null, 2)
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
              name: 'SEPTA Transit MCP with GTFS-Realtime',
              version: '3.0.0'
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
      name: 'SEPTA Transit MCP with GTFS-Realtime',
      version: '3.0.0',
      status: 'active',
      protocol: 'MCP JSON-RPC 2.0',
      tools: Object.keys(TOOLS),
      features: [
        'GTFS-Realtime vehicle positions',
        'GTFS-Realtime trip updates',
        'GTFS-Realtime service alerts',
        'Direction detection from bearing',
        'Loop route handling',
        '30-second feed caching',
        'Legacy TransitView API fallback'
      ],
      endpoints: {
        health: 'GET /',
        mcp: 'POST /'
      },
      gtfsFeeds: {
        busPositions: 'https://www3.septa.org/gtfsrt/septa-pa-us/Service/rtBusPositions.pb',
        tripUpdates: 'https://www3.septa.org/gtfsrt/septa-pa-us/Trip/rtTripUpdates.pb',
        alerts: 'https://www3.septa.org/gtfsrt/septa-pa-us/Alerts/rtAlerts.pb'
      },
      legacyEndpoints: {
        transitView: 'https://www3.septa.org/api/TransitView/index.php?route={route}',
        busDetours: 'https://www3.septa.org/api/BusDetours/index.php?route={route}',
        alerts: 'https://www3.septa.org/api/Alerts/index.php'
      },
      documentation: 'https://github.com/prncsclo-create/septa-api-wrapper-mcp',
      caching: {
        enabled: true,
        ttl: '30 seconds',
        scope: 'GTFS-Realtime feeds only'
      }
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
