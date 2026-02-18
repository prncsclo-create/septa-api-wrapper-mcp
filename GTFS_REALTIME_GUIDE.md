# GTFS-Realtime Implementation Guide

## Overview

Version 3.0 of the SEPTA Transit MCP Server introduces full **GTFS-Realtime** support, providing enhanced real-time vehicle tracking with:

- **Protobuf parsing** of SEPTA's official GTFS-RT feeds
- **Direction detection** from vehicle bearing
- **Loop route handling** for special circular routes
- **Trip updates** with delay predictions
- **Service alerts** from GTFS-RT feed
- **30-second caching** to optimize performance
- **Automatic fallback** to legacy TransitView API

---

## What is GTFS-Realtime?

GTFS-Realtime is a standardized format for real-time transit data developed by Google. It uses Protocol Buffers (protobuf) for efficient data transmission and provides:

1. **Vehicle Positions** - Real-time location, speed, bearing, and occupancy
2. **Trip Updates** - Delay predictions and arrival/departure times
3. **Service Alerts** - Disruptions, detours, and service changes

SEPTA provides three GTFS-RT feeds:
- **Bus Positions**: `https://www3.septa.org/gtfsrt/septa-pa-us/Service/rtBusPositions.pb`
- **Trip Updates**: `https://www3.septa.org/gtfsrt/septa-pa-us/Trip/rtTripUpdates.pb`
- **Alerts**: `https://www3.septa.org/gtfsrt/septa-pa-us/Alerts/rtAlerts.pb`

---

## Key Features

### 1. Direction Detection

The parser automatically determines `direction_id` (0 or 1) from vehicle bearing when not provided:

```javascript
// North/East bearing (0-45° or 315-360°, 45-135°) → direction_id = 0
// South/West bearing (135-225°, 225-315°) → direction_id = 1
```

**Example:**
- Bus heading **Northeast** (bearing 45°) → `direction_id: 0` (Outbound)
- Bus heading **Southwest** (bearing 225°) → `direction_id: 1` (Inbound)

### 2. Loop Route Handling

Special circular routes like **Route 36 (Eastwick Loop)** are detected and always assigned `direction_id: 0`:

```javascript
const LOOP_ROUTES = new Set([
  '36',  // Eastwick Loop
  '26',  // Cheltenham Loop
  'LUCYGO', // LUCY Gold Loop
  'LUCYGR', // LUCY Green Loop
]);
```

### 3. Intelligent Caching

GTFS-RT feeds are cached for **30 seconds** to reduce API calls and improve response times:

- **Cache hit**: ~50-100ms response
- **Cache miss**: ~500-800ms response (includes feed download and parsing)

Cache is automatically invalidated after TTL expires.

### 4. Automatic Fallback

If GTFS-RT feed fails, the system automatically falls back to:
1. HTTP version of GTFS-RT feed (if HTTPS fails)
2. Legacy TransitView API (if GTFS-RT unavailable)

---

## New MCP Tools

### `get_bus_locations`
Enhanced to use GTFS-RT by default with legacy fallback option.

**Parameters:**
```json
{
  "route": "33",
  "useLegacy": false  // Optional: set to true to force TransitView API
}
```

**Response includes:**
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
      "lat": "39.9526",
      "lng": "-75.1652",
      "latitude": 39.9526,
      "longitude": -75.1652,
      "bearing": 45.5,
      "speed": 8.3,
      "tripId": "133456",
      "routeId": "33",
      "directionId": 0,
      "direction": "Outbound",
      "currentStopSequence": 15,
      "stopId": "12345",
      "delay": 120,
      "congestionLevel": "RUNNING_SMOOTHLY",
      "occupancyStatus": "MANY_SEATS_AVAILABLE",
      "timestamp": "2026-02-18T23:00:00.000Z"
    }
  ]
}
```

### `get_bus_locations_gtfs`
Direct access to GTFS-RT data without fallback.

**Parameters:**
```json
{
  "route": "45"
}
```

### `get_trip_updates`
Get real-time delay predictions and stop times.

**Parameters:**
```json
{
  "route": "23"
}
```

**Response includes:**
```json
{
  "route": "23",
  "timestamp": "2026-02-18T23:00:00.000Z",
  "updateCount": 8,
  "updates": [
    {
      "tripId": "133789",
      "routeId": "23",
      "directionId": 0,
      "scheduleRelationship": "SCHEDULED",
      "vehicleId": "8301",
      "delay": 180,
      "stopTimeUpdates": [
        {
          "stopSequence": 10,
          "stopId": "1234",
          "arrivalDelay": 180,
          "arrivalTime": 1708300800,
          "departureDelay": 180,
          "departureTime": 1708300860
        }
      ]
    }
  ]
}
```

### `get_service_alerts`
Get GTFS-RT service alerts.

**Parameters:**
```json
{
  "route": "G"  // Optional: filter by route
}
```

**Response includes:**
```json
{
  "route": "G",
  "timestamp": "2026-02-18T23:00:00.000Z",
  "alertCount": 2,
  "alerts": [
    {
      "id": "alert_123",
      "headerText": "Route G Detour",
      "descriptionText": "Route G is detouring due to construction...",
      "cause": "CONSTRUCTION",
      "effect": "DETOUR",
      "severityLevel": "WARNING",
      "informedEntity": [
        { "routeId": "G" }
      ],
      "activePeriod": [
        {
          "start": 1708300800,
          "end": 1708387200
        }
      ]
    }
  ]
}
```

### `clear_gtfs_cache`
Manually clear the GTFS-RT cache (useful for testing).

**Parameters:** None

**Response:**
```json
{
  "success": true,
  "message": "GTFS-Realtime cache cleared",
  "timestamp": "2026-02-18T23:00:00.000Z"
}
```

---

## Data Fields Explained

### Vehicle Position Fields

| Field | Type | Description |
|-------|------|-------------|
| `vehicleId` | string | Unique vehicle identifier |
| `label` | string | Vehicle label (usually same as vehicleId) |
| `latitude` / `lat` | number/string | Vehicle latitude |
| `longitude` / `lng` | number/string | Vehicle longitude |
| `bearing` | number | Direction of travel in degrees (0-360) |
| `speed` | number | Speed in meters per second |
| `tripId` | string | Current trip identifier |
| `routeId` | string | Route identifier |
| `directionId` | number | Direction (0=Outbound, 1=Inbound) |
| `direction` | string | Human-readable direction |
| `currentStopSequence` | number | Position in stop sequence |
| `stopId` | string | Current/next stop ID |
| `currentStatus` | string | Vehicle status (IN_TRANSIT_TO, STOPPED_AT, etc.) |
| `delay` | number | Schedule delay in seconds |
| `congestionLevel` | string | Traffic congestion level |
| `occupancyStatus` | string | Vehicle crowding level |
| `isLoopRoute` | boolean | Whether route is a loop |
| `timestamp` | string | Last update time (ISO 8601) |

### Occupancy Status Values

- `EMPTY` - Few or no passengers
- `MANY_SEATS_AVAILABLE` - Large number of seats available
- `FEW_SEATS_AVAILABLE` - Small number of seats available
- `STANDING_ROOM_ONLY` - No seats available
- `CRUSHED_STANDING_ROOM_ONLY` - Limited standing room
- `FULL` - Vehicle is full
- `NOT_ACCEPTING_PASSENGERS` - Not accepting passengers

### Congestion Level Values

- `UNKNOWN_CONGESTION_LEVEL` - Congestion level unknown
- `RUNNING_SMOOTHLY` - Normal operation
- `STOP_AND_GO` - Stop and go traffic
- `CONGESTION` - Heavy traffic
- `SEVERE_CONGESTION` - Severe delays

---

## Testing GTFS-RT Implementation

### Test Route 33 (High Frequency)

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

### Test Loop Route 36

```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_bus_locations_gtfs",
      "arguments": {"route": "36"}
    },
    "id": 1
  }'
```

### Get Trip Updates

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

### Get Service Alerts

```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_service_alerts",
      "arguments": {"route": "G"}
    },
    "id": 1
  }'
```

---

## Performance Metrics

### GTFS-RT (with cache hit)
- **Feed fetch**: 0ms (cached)
- **Parse + filter**: 50-100ms
- **Total**: **50-100ms**

### GTFS-RT (cache miss)
- **Feed download**: 300-500ms
- **Protobuf parse**: 100-200ms
- **Filter + format**: 50-100ms
- **Total**: **450-800ms**

### Legacy TransitView (for comparison)
- **API request**: 200-500ms
- **JSON parse**: 10-50ms
- **Total**: **210-550ms**

**Recommendation**: GTFS-RT provides more data and similar performance with caching.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   MCP Client (Claude, etc.)                 │
└───────────────────────────────┬─────────────────────────────┘
                                │ JSON-RPC 2.0
┌───────────────────────────────▼─────────────────────────────┐
│              api/index.js (MCP Handler)                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Tool: get_bus_locations                              │  │
│  │ Tool: get_bus_locations_gtfs                         │  │
│  │ Tool: get_trip_updates                               │  │
│  │ Tool: get_service_alerts                             │  │
│  └────────────────────┬─────────────────────────────────┘  │
└─────────────────────────┼──────────────────────────────────┘
                          │
┌─────────────────────────▼─────────────────────────────────┐
│          api/gtfs-parser.js (GTFS-RT Module)              │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ GTFSCache (30-second TTL)                           │ │
│  │ - parseGTFSFeed()                                   │ │
│  │ - extractVehiclePositions()                         │ │
│  │ - determineDirectionFromBearing()                   │ │
│  │ - getTripUpdates()                                  │ │
│  │ - getServiceAlerts()                                │ │
│  └────────────────────┬────────────────────────────────┘ │
└──────────────────────────┼─────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼────────┐  ┌─────▼────────┐  ┌─────▼──────────┐
│ Bus Positions  │  │ Trip Updates │  │ Service Alerts │
│    (.pb)       │  │    (.pb)     │  │     (.pb)      │
└────────────────┘  └──────────────┘  └────────────────┘
     SEPTA GTFS-Realtime Feeds
```

---

## Direction Detection Algorithm

```javascript
function determineDirectionFromBearing(bearing, routeId) {
  // Loop routes always get direction 0
  if (LOOP_ROUTES.has(routeId)) {
    return 0;
  }

  // Normalize bearing to 0-360
  const normalizedBearing = ((bearing % 360) + 360) % 360;
  
  // North/East (0-45°, 315-360°, 45-135°) → direction_id = 0
  if ((normalizedBearing >= 315 || normalizedBearing < 45) || 
      (normalizedBearing >= 45 && normalizedBearing < 135)) {
    return 0; // Northbound/Eastbound/Outbound
  } else {
    return 1; // Southbound/Westbound/Inbound
  }
}
```

---

## Migration from TransitView API

If you were using the legacy TransitView API, here's what changed:

### Before (v2.0):
```javascript
// Only basic location data
{
  "bus": [
    {
      "lat": "39.9526",
      "lng": "-75.1652",
      "label": "8001",
      "VehicleID": "8001",
      "Direction": "NorthBound",
      "destination": "Andorra"
    }
  ]
}
```

### After (v3.0 with GTFS-RT):
```javascript
// Enhanced data with more fields
{
  "vehicles": [
    {
      "vehicleId": "8001",
      "latitude": 39.9526,
      "longitude": -75.1652,
      "bearing": 45.5,
      "speed": 8.3,
      "directionId": 0,
      "direction": "Outbound",
      "delay": 120,
      "congestionLevel": "RUNNING_SMOOTHLY",
      "occupancyStatus": "MANY_SEATS_AVAILABLE",
      "tripId": "133456",
      // ... and more
    }
  ]
}
```

**Backward Compatibility**: Use `useLegacy: true` parameter to get TransitView format.

---

## Troubleshooting

### Issue: Empty vehicles array

**Possible causes:**
1. No vehicles currently running on route
2. Route number incorrect
3. Outside service hours

**Solution:**
- Verify route number is correct
- Check during peak hours (weekdays 7-9 AM, 4-7 PM)
- Use high-frequency routes for testing (23, 33, 45, G)

### Issue: Direction detection incorrect

**Possible causes:**
1. Vehicle is turning or stopped
2. Bearing data unavailable
3. Route geometry unusual

**Solution:**
- Direction detection uses instantaneous bearing
- For accurate direction, use trip-level `directionId` from trip updates
- Loop routes always return `directionId: 0`

### Issue: Cache not clearing

**Solution:**
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

### Issue: GTFS-RT feed fails

**Automatic fallback:**
1. Tries HTTPS GTFS-RT
2. Falls back to HTTP GTFS-RT
3. Falls back to TransitView API
4. Returns error if all fail

Check Vercel logs for details on which endpoint succeeded.

---

## Best Practices

### 1. Use Caching
GTFS-RT feeds are cached for 30 seconds. Don't clear cache unless testing.

### 2. Handle Loop Routes
Always check `isLoopRoute` field when displaying direction information.

### 3. Monitor Delays
Use `delay` field (in seconds) to show real-time schedule adherence:
- **Negative delay**: Vehicle is ahead of schedule
- **Zero delay**: On time
- **Positive delay**: Behind schedule

### 4. Check Occupancy
Use `occupancyStatus` to inform passengers about crowding:
```javascript
if (vehicle.occupancyStatus === 'STANDING_ROOM_ONLY') {
  console.log('⚠️ Bus is crowded');
}
```

### 5. Use Trip Updates for Predictions
Combine position data with trip updates for accurate arrival predictions.

---

## References

- **GTFS-Realtime Specification**: https://developers.google.com/transit/gtfs-realtime
- **SEPTA Developer Portal**: https://www.septa.org/developer/
- **Protocol Buffers**: https://developers.google.com/protocol-buffers
- **gtfs-realtime-bindings**: https://www.npmjs.com/package/gtfs-realtime-bindings

---

## Version History

### v3.0.0 (2026-02-18) - **Current**
- ✅ Added GTFS-Realtime support
- ✅ Implemented protobuf parsing
- ✅ Direction detection from bearing
- ✅ Loop route handling
- ✅ 30-second feed caching
- ✅ Trip updates support
- ✅ Service alerts from GTFS-RT
- ✅ Automatic fallback to TransitView

### v2.0.0 (2026-02-11)
- Switched to TransitView API
- HTTP fallback support

### v1.0.0 (2026-02-04)
- Initial Node.js implementation
- Basic MCP integration

---

**Status**: Production-ready with GTFS-Realtime support  
**Last Updated**: February 18, 2026
