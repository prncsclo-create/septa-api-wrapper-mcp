/**
 * SEPTA Transit MCP Server - Node.js Implementation with TransitView JSON API
 * Provides real-time bus and trolley information for Philadelphia
 * Version 4.0 - Switched to TransitView JSON API (GTFS-RT fallback)
 */

const https = require('https');
const http = require('http');
const gtfsParser = require('./gtfs-parser');

/**
 * Cache for API responses
 */
class ResponseCache {
  constructor(ttlSeconds = 30) {
    this.cache = new Map();
    this.ttl = ttlSeconds * 1000;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }
}

// Global cache instance (30 second TTL)
const apiCache = new ResponseCache(30);

/**
 * Make HTTP/HTTPS GET request
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    console.log(`[DEBUG] Making request to: ${url}`);
    
    const request = protocol.get(url, (res) => {
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
    });
    
    request.on('error', (err) => {
      console.error(`[ERROR] Request failed:`, err);
      reject(new Error(`Request failed: ${err.message}`));
    });
    
    // Set timeout
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Request timeout after 30 seconds'));
    });
  });
}

/**
 * Get bus locations using SEPTA TransitView JSON API (PRIMARY)
 */
async function getTransitViewData(route) {
  const cacheKey = `transitview_${route}`;
  
  // Check cache first
  const cached = apiCache.get(cacheKey);
  if (cached) {
    console.log(`[INFO] Using cached TransitView data for route: ${route}`);
    return cached;
  }
  
  console.log(`[INFO] Fetching TransitView data for route: ${route}`);
  
  // Try HTTPS first
  const primaryUrl = `https://www3.septa.org/api/TransitView/index.php?route=${route}`;
  console.log(`[DEBUG] Using TransitView API endpoint: ${primaryUrl}`);
  
  try {
    const data = await makeRequest(primaryUrl);
    console.log(`[DEBUG] TransitView API request successful`);
    
    // Parse and enhance the data
    const enhancedData = parseTransitViewResponse(data, route);
    
    // Cache the result
    apiCache.set(cacheKey, enhancedData);
    
    return enhancedData;
  } catch (error) {
    console.error(`[ERROR] TransitView HTTPS request failed: ${error.message}`);
    
    // Fallback to HTTP if HTTPS fails
    console.log(`[DEBUG] Attempting HTTP fallback`);
    const fallbackUrl = `http://www3.septa.org/api/TransitView/index.php?route=${route}`;
    
    try {
      const data = await makeRequest(fallbackUrl);
      console.log(`[DEBUG] HTTP fallback successful`);
      
      const enhancedData = parseTransitViewResponse(data, route);
      apiCache.set(cacheKey, enhancedData);
      
      return enhancedData;
    } catch (fallbackError) {
      console.error(`[ERROR] HTTP fallback also failed: ${fallbackError.message}`);
      throw new Error(`TransitView API failed for route ${route}. HTTPS: ${error.message}, HTTP: ${fallbackError.message}`);
    }
  }
}

/**
 * Get all bus locations using TransitViewAll endpoint
 */
async function getAllTransitViewData() {
  const cacheKey = 'transitview_all';
  
  // Check cache first
  const cached = apiCache.get(cacheKey);
  if (cached) {
    console.log(`[INFO] Using cached TransitViewAll data`);
    return cached;
  }
  
  console.log(`[INFO] Fetching TransitViewAll data`);
  
  // Try HTTPS first
  const primaryUrl = 'https://www3.septa.org/api/TransitViewAll/index.php';
  console.log(`[DEBUG] Using TransitViewAll API endpoint: ${primaryUrl}`);
  
  try {
    const data = await makeRequest(primaryUrl);
    console.log(`[DEBUG] TransitViewAll API request successful`);
    
    // Cache the result
    apiCache.set(cacheKey, data);
    
    return data;
  } catch (error) {
    console.error(`[ERROR] TransitViewAll HTTPS request failed: ${error.message}`);
    
    // Fallback to HTTP if HTTPS fails
    console.log(`[DEBUG] Attempting HTTP fallback`);
    const fallbackUrl = 'http://www3.septa.org/api/TransitViewAll/index.php';
    
    try {
      const data = await makeRequest(fallbackUrl);
      console.log(`[DEBUG] HTTP fallback successful`);
      
      apiCache.set(cacheKey, data);
      
      return data;
    } catch (fallbackError) {
      console.error(`[ERROR] HTTP fallback also failed: ${fallbackError.message}`);
      throw new Error(`TransitViewAll API failed. HTTPS: ${error.message}, HTTP: ${fallbackError.message}`);
    }
  }
}

/**
 * Parse and enhance TransitView JSON response
 */
function parseTransitViewResponse(data, route) {
  if (!data || !data.bus || data.bus.length === 0) {
    console.log(`[INFO] No bus data found for route ${route}`);
    return {
      route: route,
      timestamp: new Date().toISOString(),
      vehicleCount: 0,
      dataSource: 'TransitView JSON API',
      vehicles: []
    };
  }
  
  const buses = Array.isArray(data.bus) ? data.bus : [data.bus];
  
  // Enhance vehicle data with computed fields
  const vehicles = buses.map(bus => {
    // Determine direction from heading/direction field
    let directionId = 0;
    let directionName = 'Unknown';
    
    if (bus.Direction) {
      const dir = bus.Direction.toLowerCase();
      if (dir.includes('south') || dir.includes('west')) {
        directionId = 1;
        directionName = bus.Direction;
      } else if (dir.includes('north') || dir.includes('east')) {
        directionId = 0;
        directionName = bus.Direction;
      } else {
        directionName = bus.Direction;
      }
    }
    
    // Parse coordinates
    const lat = bus.lat ? parseFloat(bus.lat) : null;
    const lng = bus.lng ? parseFloat(bus.lng) : null;
    
    return {
      // Basic identification
      vehicleId: bus.VehicleID || bus.label,
      label: bus.label,
      blockId: bus.BlockID,
      
      // Location data
      lat: bus.lat,
      lng: bus.lng,
      latitude: lat,
      longitude: lng,
      
      // Direction data
      direction: directionName,
      directionId: directionId,
      heading: bus.heading ? parseInt(bus.heading) : null,
      
      // Trip data
      tripId: bus.trip,
      routeId: route,
      
      // Stop data
      destination: bus.destination,
      nextStop: bus.next_stop_name,
      nextStopId: bus.next_stop_id,
      
      // Status
      offset: bus.Offset ? parseInt(bus.Offset) : 0,
      delay: bus.Offset ? parseInt(bus.Offset) * 60 : 0, // Convert to seconds
      late: bus.late ? parseInt(bus.late) : 0,
      
      // Timestamps
      timestamp: new Date().toISOString(),
    };
  });
  
  return {
    route: route,
    timestamp: new Date().toISOString(),
    vehicleCount: vehicles.length,
    dataSource: 'TransitView JSON API',
    vehicles: vehicles
  };
}

/**
 * Get bus locations with fallback logic: TransitView (primary) -> GTFS-RT (fallback)
 */
async function getBusLocationsWithFallback(route) {
  console.log(`[INFO] Getting bus locations for route: ${route}`);
  
  // Try TransitView JSON API first (PRIMARY)
  try {
    console.log(`[INFO] Attempting TransitView JSON API (primary)`);
    const data = await getTransitViewData(encodeURIComponent(route));
    return {
      success: true,
      data: data,
      source: 'TransitView JSON API'
    };
  } catch (error) {
    console.error(`[ERROR] TransitView failed: ${error.message}`);
    console.log(`[INFO] Falling back to GTFS-Realtime`);
    
    // Fallback to GTFS-RT
    try {
      const gtfsData = await gtfsParser.getRouteData(route);
      
      // Format GTFS data to match TransitView structure
      const formattedData = {
        route: gtfsData.routeId,
        timestamp: new Date(gtfsData.timestamp).toISOString(),
        vehicleCount: gtfsData.vehicleCount,
        isLoopRoute: gtfsData.isLoopRoute,
        dataSource: 'GTFS-Realtime (fallback)',
        fallbackReason: error.message,
        vehicles: gtfsData.vehicles.map(v => ({
          vehicleId: v.vehicleId,
          label: v.label,
          lat: v.latitude ? v.latitude.toString() : null,
          lng: v.longitude ? v.longitude.toString() : null,
          latitude: v.latitude,
          longitude: v.longitude,
          heading: v.bearing,
          bearing: v.bearing,
          speed: v.speed,
          tripId: v.tripId,
          routeId: v.routeId,
          directionId: v.directionId,
          direction: v.directionId === 0 ? 'Outbound' : 'Inbound',
          currentStopSequence: v.currentStopSequence,
          stopId: v.stopId,
          currentStatus: v.currentStatus,
          delay: v.delay || 0,
          congestionLevel: v.congestionLevel,
          occupancyStatus: v.occupancyStatus,
          isLoopRoute: v.isLoopRoute,
          timestamp: v.timestamp ? new Date(v.timestamp * 1000).toISOString() : null,
        }))
      };
      
      return {
        success: true,
        data: formattedData,
        source: 'GTFS-Realtime (fallback)'
      };
    } catch (gtfsError) {
      console.error(`[ERROR] GTFS-RT fallback also failed: ${gtfsError.message}`);
      throw new Error(`Both TransitView and GTFS-RT failed. TransitView: ${error.message}, GTFS-RT: ${gtfsError.message}`);
    }
  }
}

/**
 * Tool definitions for MCP
 */
const TOOLS = {
  get_bus_locations: {
    name: 'get_bus_locations',
    description: 'Get real-time locations for all vehicles on a specific SEPTA route using TransitView JSON API (primary) with GTFS-Realtime fallback. Returns comprehensive vehicle data including positions, directions, delays, and trip information.',
    inputSchema: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          description: 'The route number (e.g., "23", "33", "45", "G", "36"). Use official SEPTA route numbers.'
        }
      },
      required: ['route']
    }
  },
  get_all_bus_locations: {
    name: 'get_all_bus_locations',
    description: 'Get real-time locations for ALL buses on ALL routes using TransitViewAll JSON API. Returns data for every active bus in the SEPTA system.',
    inputSchema: {
      type: 'object',
      properties: {}
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
    description: 'Check for active detours on a specific SEPTA route using the Bus Detours API.',
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
    description: 'Get general system alerts using the Alerts API.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  clear_cache: {
    name: 'clear_cache',
    description: 'Clear all API response caches (TransitView and GTFS-RT). Useful for testing or forcing fresh data retrieval.',
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
      const result = await getBusLocationsWithFallback(route);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result.data, null, 2)
        }]
      };
    }
    
    case 'get_all_bus_locations': {
      console.log(`[INFO] Getting all bus locations`);
      
      try {
        const data = await getAllTransitViewData();
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              timestamp: new Date().toISOString(),
              dataSource: 'TransitViewAll JSON API',
              routeCount: Object.keys(data).length,
              routes: data
            }, null, 2)
          }]
        };
      } catch (error) {
        console.error(`[ERROR] Failed to get all bus locations:`, error);
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
    
    case 'clear_cache': {
      console.log(`[INFO] Clearing all caches`);
      apiCache.clear();
      gtfsParser.clearCache();
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: 'All caches cleared (TransitView + GTFS-RT)',
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
              name: 'SEPTA Transit MCP with TransitView JSON API',
              version: '4.0.0'
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
      name: 'SEPTA Transit MCP with TransitView JSON API',
      version: '4.0.0',
      status: 'active',
      protocol: 'MCP JSON-RPC 2.0',
      tools: Object.keys(TOOLS),
      features: [
        'TransitView JSON API (primary)',
        'TransitViewAll for all routes',
        'GTFS-Realtime fallback',
        'Simple JSON parsing',
        'Enhanced direction detection',
        '30-second response caching',
        'Automatic failover',
        'Trip updates and alerts'
      ],
      endpoints: {
        health: 'GET /',
        mcp: 'POST /'
      },
      primaryAPI: {
        transitView: 'https://www3.septa.org/api/TransitView/index.php?route={route}',
        transitViewAll: 'https://www3.septa.org/api/TransitViewAll/index.php'
      },
      fallbackAPI: {
        gtfsPositions: 'https://www3.septa.org/gtfsrt/septa-pa-us/Service/rtBusPositions.pb',
        gtfsTripUpdates: 'https://www3.septa.org/gtfsrt/septa-pa-us/Trip/rtTripUpdates.pb',
        gtfsAlerts: 'https://www3.septa.org/gtfsrt/septa-pa-us/Alerts/rtAlerts.pb'
      },
      otherEndpoints: {
        busDetours: 'https://www3.septa.org/api/BusDetours/index.php?route={route}',
        alerts: 'https://www3.septa.org/api/Alerts/index.php'
      },
      documentation: 'https://github.com/prncsclo-create/septa-api-wrapper-mcp',
      caching: {
        enabled: true,
        ttl: '30 seconds',
        scope: 'All API responses'
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
