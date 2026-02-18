# SEPTA Transit MCP Server with GTFS-Realtime

A Model Context Protocol (MCP) server providing real-time access to SEPTA (Southeastern Pennsylvania Transportation Authority) transit data with **GTFS-Realtime** support for enhanced vehicle tracking, trip updates, and service alerts.

**Built with Node.js for reliable Vercel deployment.**

## 🚀 Version 3.0 - New GTFS-Realtime Features

- ✅ **GTFS-Realtime protobuf parsing** for official SEPTA feeds
- ✅ **Enhanced vehicle tracking** with bearing, speed, and occupancy data
- ✅ **Direction detection** from vehicle bearing
- ✅ **Loop route handling** for circular routes (Route 36, 26, etc.)
- ✅ **Trip updates** with real-time delay predictions
- ✅ **Service alerts** from GTFS-RT feed
- ✅ **30-second intelligent caching** for optimal performance
- ✅ **Automatic fallback** to legacy TransitView API

## Features

This MCP server provides **7 tools** for accessing SEPTA transit information:

### Core GTFS-Realtime Tools

#### 1. **get_bus_locations** (Enhanced)
Get real-time vehicle locations using GTFS-Realtime feed with automatic fallback.

**Parameters:**
- `route` (string, required): The route number (e.g., '23', '45', 'G')
- `useLegacy` (boolean, optional): Force legacy TransitView API (default: false)

**New data fields:**
- Bearing (direction of travel in degrees)
- Speed (meters per second)
- Direction ID (0=Outbound, 1=Inbound)
- Delay (schedule adherence in seconds)
- Congestion level
- Occupancy status
- Loop route detection

#### 2. **get_bus_locations_gtfs**
Direct access to GTFS-Realtime vehicle positions without fallback.

**Parameters:**
- `route` (string, required): The route number

#### 3. **get_trip_updates**
Get real-time trip updates including delays and arrival/departure predictions.

**Parameters:**
- `route` (string, required): The route number

**Returns:**
- Trip delays in seconds
- Stop-by-stop arrival/departure predictions
- Schedule relationship (SCHEDULED, ADDED, CANCELED)

#### 4. **get_service_alerts**
Get service alerts from GTFS-Realtime feed (detours, delays, service changes).

**Parameters:**
- `route` (string, optional): Filter alerts by route

**Returns:**
- Alert descriptions and headers
- Cause and effect information
- Active time periods
- Affected routes/stops
- Severity levels

### Legacy Tools

#### 5. **get_bus_detours**
Check for active detours using legacy Bus Detours API.

#### 6. **get_transit_alerts**
Get general system alerts using legacy Alerts API.

### Utility Tools

#### 7. **clear_gtfs_cache**
Manually clear the GTFS-RT feed cache (useful for testing).

## Technology Stack

- **Runtime:** Node.js 18+
- **Platform:** Vercel Serverless Functions
- **Protocol:** MCP JSON-RPC 2.0
- **GTFS-RT:** gtfs-realtime-bindings (Protocol Buffers)
- **Caching:** In-memory with 30-second TTL

## Quick Start

### 1. Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/prncsclo-create/septa-api-wrapper-mcp)

1. Click the button above or go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Import this GitHub repository
3. Deploy (no configuration needed)
4. Your API will be live at `https://your-project.vercel.app/`

### 2. Test the Deployment

**Health Check:**
```bash
curl https://your-deployment.vercel.app/
```

**Get Vehicle Locations (GTFS-RT):**
```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_bus_locations",
      "arguments": {"route": "33"}
    },
    "id": 1
  }'
```

**Get Trip Updates:**
```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_trip_updates",
      "arguments": {"route": "23"}
    },
    "id": 1
  }'
```

## Response Examples

### GTFS-RT Vehicle Positions
```json
{
  "route": "33",
  "timestamp": "2026-02-18T23:00:00.000Z",
  "vehicleCount": 12,
  "isLoopRoute": false,
  "dataSource": "GTFS-Realtime",
  "vehicles": [
    {
      "vehicleId": "8245",
      "label": "8245",
      "latitude": 39.9526,
      "longitude": -75.1652,
      "bearing": 45.5,
      "speed": 8.3,
      "tripId": "133456",
      "routeId": "33",
      "directionId": 0,
      "direction": "Outbound",
      "delay": 120,
      "congestionLevel": "RUNNING_SMOOTHLY",
      "occupancyStatus": "MANY_SEATS_AVAILABLE",
      "currentStopSequence": 15,
      "stopId": "12345",
      "timestamp": "2026-02-18T23:00:00.000Z"
    }
  ]
}
```

### Trip Updates with Delays
```json
{
  "route": "23",
  "updateCount": 8,
  "updates": [
    {
      "tripId": "133789",
      "routeId": "23",
      "directionId": 0,
      "delay": 180,
      "stopTimeUpdates": [
        {
          "stopSequence": 10,
          "stopId": "1234",
          "arrivalDelay": 180,
          "departureDelay": 180
        }
      ]
    }
  ]
}
```

## GTFS-Realtime Feeds

The server uses these official SEPTA feeds:

| Feed | URL | Purpose |
|------|-----|---------|
| **Bus Positions** | `https://www3.septa.org/gtfsrt/septa-pa-us/Service/rtBusPositions.pb` | Real-time vehicle locations |
| **Trip Updates** | `https://www3.septa.org/gtfsrt/septa-pa-us/Trip/rtTripUpdates.pb` | Delay predictions |
| **Service Alerts** | `https://www3.septa.org/gtfsrt/septa-pa-us/Alerts/rtAlerts.pb` | Service disruptions |

## Direction Detection

The server automatically determines direction from vehicle bearing:

- **North/East** (bearing 0-45°, 45-135°, 315-360°) → `direction_id: 0` (Outbound)
- **South/West** (bearing 135-225°, 225-315°) → `direction_id: 1` (Inbound)

**Special handling for loop routes:**
- Route 36 (Eastwick Loop)
- Route 26 (Cheltenham Loop)
- LUCY Gold/Green Loops
- Always assigned `direction_id: 0`

## Caching Strategy

GTFS-RT feeds are cached for **30 seconds**:

- **Cache Hit**: ~50-100ms response time
- **Cache Miss**: ~500-800ms (includes feed download and parsing)
- Automatic cache invalidation after TTL

**Manual cache clearing:**
```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "clear_gtfs_cache"
    },
    "id": 1
  }'
```

## Project Structure

```
septa-api-wrapper-mcp/
├── api/
│   ├── index.js           # MCP handler with GTFS-RT integration
│   └── gtfs-parser.js     # GTFS-Realtime protobuf parser
├── package.json           # Dependencies (gtfs-realtime-bindings)
├── vercel.json            # Vercel deployment config
├── README.md              # This file
├── GTFS_REALTIME_GUIDE.md # Detailed GTFS-RT documentation
└── SEPTA_API_RESEARCH.md  # API research and legacy docs
```

## MCP Protocol Support

Implements MCP JSON-RPC 2.0 specification:

### Supported Methods
1. **initialize** - Initialize MCP session
2. **tools/list** - List all available tools
3. **tools/call** - Execute a specific tool

All requests/responses follow JSON-RPC 2.0 format.

## Performance

| Operation | Performance |
|-----------|-------------|
| GTFS-RT (cached) | 50-100ms |
| GTFS-RT (uncached) | 450-800ms |
| Legacy TransitView | 210-550ms |
| Cold start (Vercel) | 100-200ms |

## Common SEPTA Routes

### High-Frequency Routes (Best for Testing)
- **23** - Germantown Avenue (very frequent)
- **33** - Dauphin-Cecil B Moore (frequent)
- **45** - Girard Avenue (major crosstown)
- **G** - Girard Trolley (high visibility)

### Loop Routes
- **36** - Eastwick Loop
- **26** - Cheltenham Loop

### Trolley Routes
- **10, 11, 13, 34, 36, G** - All trolley lines

## Development

### Local Testing

```bash
# Install dependencies
npm install

# Run with Vercel CLI
npm install -g vercel
vercel dev

# Server available at http://localhost:3000
```

### Testing Tools

**List available tools:**
```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 1
  }'
```

## Documentation

- **[GTFS-Realtime Guide](GTFS_REALTIME_GUIDE.md)** - Comprehensive GTFS-RT documentation
- **[SEPTA API Research](SEPTA_API_RESEARCH.md)** - Legacy API information
- [GTFS-Realtime Specification](https://developers.google.com/transit/gtfs-realtime)
- [SEPTA Developer Portal](https://www.septa.org/developer/)
- [MCP Specification](https://spec.modelcontextprotocol.io/)

## Troubleshooting

### Empty vehicles array
- Verify route number is correct
- Check during peak hours (weekdays 7-9 AM, 4-7 PM)
- Some routes may have limited weekend service

### Direction detection issues
- Direction is based on instantaneous bearing
- May be inaccurate when vehicle is stopped or turning
- Loop routes always show `direction_id: 0`

### GTFS-RT feed unavailable
- Server automatically falls back to HTTP
- Then falls back to legacy TransitView API
- Check Vercel logs for details

### Cache issues
- Use `clear_gtfs_cache` tool to force refresh
- Cache TTL is 30 seconds
- Vercel function timeout is 10 seconds (serverless)

## Error Handling

The server includes comprehensive error handling:
- Parameter validation
- HTTP status checking
- Protobuf parsing error detection
- Automatic HTTPS → HTTP fallback
- GTFS-RT → TransitView fallback
- JSON-RPC 2.0 error codes

## CORS Support

CORS enabled for browser-based clients:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

## Migration from v2.0

If upgrading from v2.0 (TransitView API only):

**Before:**
```javascript
// Only basic fields
{ "lat": "39.9526", "lng": "-75.1652", "Direction": "NorthBound" }
```

**After (v3.0):**
```javascript
// Enhanced fields
{ 
  "latitude": 39.9526, 
  "longitude": -75.1652,
  "bearing": 45.5,
  "speed": 8.3,
  "directionId": 0,
  "delay": 120,
  "congestionLevel": "RUNNING_SMOOTHLY",
  "occupancyStatus": "MANY_SEATS_AVAILABLE"
}
```

**Backward compatibility:** Use `useLegacy: true` to get TransitView format.

## License

This project is open source and available under the MIT License.

## Changelog

### v3.0.0 (2026-02-18) - **Current**
- ✅ **Added GTFS-Realtime support**
- ✅ Protobuf parsing with gtfs-realtime-bindings
- ✅ Direction detection from bearing
- ✅ Loop route handling
- ✅ 30-second feed caching
- ✅ Trip updates tool
- ✅ Service alerts tool (GTFS-RT)
- ✅ Automatic fallback to TransitView
- ✅ Enhanced vehicle data (bearing, speed, occupancy, congestion)
- ✅ Cache management tool

### v2.0.0 (2026-02-11)
- Switched to TransitView API as primary endpoint
- HTTP fallback support

### v1.0.0 (2026-02-04)
- Initial Node.js implementation
- Basic MCP integration

## Support

For issues or questions:
- Check [GTFS_REALTIME_GUIDE.md](GTFS_REALTIME_GUIDE.md) for detailed documentation
- Review GitHub Issues
- Create a new issue with reproduction steps

---

**Note:** This is an unofficial tool and is not affiliated with or endorsed by SEPTA.

**Repository:** https://github.com/prncsclo-create/septa-api-wrapper-mcp  
**Version:** 3.0.0  
**Status:** Production-ready with GTFS-Realtime support
