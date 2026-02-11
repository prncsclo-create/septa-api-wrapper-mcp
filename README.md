# SEPTA Transit MCP Server

A Model Context Protocol (MCP) server providing real-time access to SEPTA (Southeastern Pennsylvania Transportation Authority) transit data for buses and trolleys in Philadelphia.

**Built with Node.js for reliable Vercel deployment.**

## Features

This MCP server provides three tools for accessing SEPTA transit information:

### 1. **get_bus_locations**
Get real-time locations for all vehicles on a specific SEPTA route using the **TransitView API**.

**Parameters:**
- `route` (string, required): The route number (e.g., '23', '45', 'G')

**Example:**
```json
{
  "route": "23"
}
```

**API Endpoint Used:** `https://www3.septa.org/api/TransitView/index.php?route=[route_number]`

### 2. **get_bus_detours**
Check for active detours on a specific SEPTA route.

**Parameters:**
- `route` (string, required): The route number to check for detours

**Example:**
```json
{
  "route": "45"
}
```

### 3. **get_transit_alerts**
Get general system alerts and advisories for SEPTA services.

**Parameters:** None

## Technology Stack

- **Runtime:** Node.js 18+
- **Platform:** Vercel Serverless Functions
- **Protocol:** MCP JSON-RPC 2.0
- **Dependencies:** Zero external dependencies (uses Node.js built-ins)

## Deployment

This server is designed to run as a Vercel serverless function.

### Prerequisites
- Vercel account
- GitHub repository connected to Vercel

### Deploy to Vercel

1. **Connect Repository:**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import this GitHub repository

2. **Configure Project:**
   - Framework Preset: Other
   - No build configuration needed
   - Vercel will auto-detect Node.js

3. **Deploy:**
   - Click "Deploy"
   - Vercel will automatically deploy your serverless function

### Testing

Once deployed, you can test the endpoint:

**GET request (health check):**
```bash
curl https://your-deployment.vercel.app/
```

Expected response:
```json
{
  "name": "SEPTA Transit MCP",
  "version": "2.0.0",
  "status": "active",
  "protocol": "MCP JSON-RPC 2.0",
  "tools": [
    "get_bus_locations",
    "get_bus_detours",
    "get_transit_alerts"
  ],
  "endpoints": {
    "health": "GET /",
    "mcp": "POST /"
  },
  "apiEndpoints": {
    "transitView": "https://www3.septa.org/api/TransitView/index.php?route={route}",
    "busDetours": "https://www3.septa.org/api/BusDetours/index.php?route={route}",
    "alerts": "https://www3.septa.org/api/Alerts/index.php"
  }
}
```

**POST request (MCP tool call):**
```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_bus_locations",
      "arguments": {
        "route": "23"
      }
    },
    "id": 1
  }'
```

**Initialize MCP session:**
```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    },
    "id": 1
  }'
```

**List available tools:**
```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 1
  }'
```

## Project Structure

```
septa-api-wrapper-mcp/
├── api/
│   └── index.js          # Node.js serverless function handler
├── package.json          # Node.js project configuration
├── vercel.json           # Vercel deployment configuration
├── mcp-config.yaml       # MCP tool configuration (reference)
└── README.md             # This file
```

## MCP Protocol Support

This server implements the Model Context Protocol (MCP) JSON-RPC 2.0 specification:

### Supported Methods

1. **initialize** - Initialize MCP session
2. **tools/list** - List all available tools
3. **tools/call** - Execute a specific tool

### JSON-RPC 2.0 Compliance

All requests must include:
- `jsonrpc`: "2.0"
- `method`: The MCP method name
- `params`: Method parameters (object)
- `id`: Request identifier

Responses include:
- `jsonrpc`: "2.0"
- `result` or `error`: Method result or error
- `id`: Matching request identifier

## API Endpoints Used

This server uses the following SEPTA APIs:

### **TransitView API** (Primary)
```
https://www3.septa.org/api/TransitView/index.php?route=[route_number]
```
- **Purpose:** Real-time vehicle locations
- **Method:** GET
- **Parameters:** `route` (route number)
- **Response:** JSON with bus/vehicle array containing lat, lng, label, VehicleID, direction, destination

**Example Response:**
```json
{
  "bus": [
    {
      "lat": "39.9526",
      "lng": "-75.1652",
      "label": "8001",
      "VehicleID": "8001",
      "BlockID": "3301",
      "Direction": "NorthBound",
      "destination": "Andorra",
      "Offset": "0"
    }
  ]
}
```

### **Bus Detours API**
```
https://www3.septa.org/api/BusDetours/index.php?route=[route_number]
```
- **Purpose:** Active detour information for specific routes

### **Alerts API**
```
https://www3.septa.org/api/Alerts/index.php
```
- **Purpose:** System-wide alerts and advisories

## Error Handling

The server includes comprehensive error handling:
- Parameter validation
- HTTP status code checking
- JSON parsing error detection
- Detailed error messages in MCP error format
- Proper JSON-RPC 2.0 error codes:
  - `-32600`: Invalid Request
  - `-32601`: Method not found
  - `-32603`: Internal error
- Automatic HTTPS to HTTP fallback for reliability

## CORS Support

The server includes CORS headers to allow browser-based clients to access the API:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

## Development

### Local Testing

To test locally, you can use the Vercel CLI:

```bash
# Install Vercel CLI
npm i -g vercel

# Run locally
vercel dev
```

The server will be available at `http://localhost:3000`

### Making Changes

1. Update `api/index.js` for functionality changes
2. Update `mcp-config.yaml` for configuration reference
3. Test locally with `vercel dev`
4. Commit and push to trigger automatic deployment

## Troubleshooting

### Deployment Issues
- Ensure `package.json` specifies Node.js 18+
- Check Vercel build logs for errors
- Verify the `api/` directory contains `index.js`

### API Issues
- SEPTA APIs may occasionally be unavailable
- Some routes may not return data if no vehicles are active
- Check SEPTA's official status page for service disruptions
- The server automatically falls back to HTTP if HTTPS fails

### MCP Client Issues
- Ensure requests use JSON-RPC 2.0 format
- Verify `Content-Type: application/json` header is set
- Check request/response IDs match

## Performance

- **Cold Start:** ~100-200ms (Node.js serverless)
- **Warm Response:** ~50-100ms
- **SEPTA API Latency:** Variable (typically 200-500ms)
- **Total Request Time:** ~300-700ms

## Common SEPTA Routes

### Major Bus Routes
- **Center City:** 2, 4, 7, 9, 12, 17, 21, 23, 27, 31, 32, 33, 38, 42, 44, 45, 47, 48
- **North Philadelphia:** 50, 52, 53, 54, 56, 57, 58, 60, 61, 62
- **West Philadelphia:** 64, 65, 66, 67, 68
- **Northeast:** 14, 58, 67, 70, 73, 75, 77, 78, 79, 84, 88, 89, 90, 91, 92, 94, 95, 96, 97, 98, 99

### Trolley Routes
- **10** - Lancaster Avenue
- **11** - Woodland Avenue
- **13** - Chester Avenue
- **34** - Baltimore Avenue
- **36** - Eastwick
- **G** - Girard Avenue (Green Line)

## License

This project is open source and available under the MIT License.

## Resources

- [SEPTA Developer Resources](https://www.septa.org/developer/)
- [SEPTA TransitView API Documentation](https://www3.septa.org/api/)
- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)

## Support

For issues or questions:
- Check existing GitHub Issues
- Create a new issue with details about your problem
- Include error messages and steps to reproduce

## Changelog

### v2.0.0 (2026-02-11)
- **Switched to TransitView API as primary endpoint**
- Simplified endpoint strategy to focus on SEPTA's official TransitView API
- Endpoint: `https://www3.septa.org/api/TransitView/index.php?route=[route_number]`
- Maintained HTTP fallback for reliability
- Removed complex multi-endpoint fallback strategy
- Enhanced logging for TransitView API calls
- Updated documentation to highlight TransitView API usage

### v1.0.2 (2026-02-04)
- Multi-endpoint fallback strategy
- Comprehensive error handling

### v1.0.0 (2026-02-04)
- Migrated from Go to Node.js for better Vercel compatibility
- Implemented MCP JSON-RPC 2.0 protocol
- Added all three SEPTA tools
- Zero external dependencies
- CORS support
- Health check endpoint

---

**Note:** This is an unofficial tool and is not affiliated with or endorsed by SEPTA.
