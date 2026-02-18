# Quick Testing Guide

## SEPTA API Wrapper MCP - GTFS-Realtime v3.0

This guide provides quick test commands to verify the GTFS-Realtime implementation.

---

## Prerequisites

- Deployed Vercel endpoint: `https://your-deployment.vercel.app/`
- curl or any HTTP client
- Routes running during test time (weekdays 7-9 AM or 4-7 PM recommended)

---

## 1. Health Check

Verify the server is running and shows v3.0 features.

```bash
curl https://your-deployment.vercel.app/
```

**Expected response includes:**
```json
{
  "name": "SEPTA Transit MCP with GTFS-Realtime",
  "version": "3.0.0",
  "features": [
    "GTFS-Realtime vehicle positions",
    "GTFS-Realtime trip updates",
    "Direction detection from bearing",
    "Loop route handling"
  ]
}
```

---

## 2. List Available Tools

Get all MCP tools including new GTFS-RT tools.

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

**Should include 7 tools:**
- get_bus_locations
- get_bus_locations_gtfs
- get_trip_updates
- get_service_alerts
- get_bus_detours
- get_transit_alerts
- clear_gtfs_cache

---

## 3. Test GTFS-RT Vehicle Positions

### Route 33 (High-frequency route)

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

**Look for:**
- `dataSource: "GTFS-Realtime"`
- `vehicleCount` > 0
- `bearing`, `speed`, `directionId` fields present
- `delay`, `congestionLevel`, `occupancyStatus` fields

### Route 23 (Another good test route)

```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_bus_locations_gtfs",
      "arguments": {"route": "23"}
    },
    "id": 1
  }'
```

---

## 4. Test Loop Route Detection

Route 36 should always show `directionId: 0` and `isLoopRoute: true`.

```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_bus_locations",
      "arguments": {"route": "36"}
    },
    "id": 1
  }'
```

**Verify:**
- All vehicles have `directionId: 0`
- `isLoopRoute: true` at vehicle and route level

---

## 5. Test Trip Updates

Get real-time delays and predictions.

```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_trip_updates",
      "arguments": {"route": "45"}
    },
    "id": 1
  }'
```

**Look for:**
- `updateCount` > 0
- `delay` field (in seconds, can be negative/positive)
- `stopTimeUpdates` array with predictions

---

## 6. Test Service Alerts

### All alerts

```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_service_alerts"
    },
    "id": 1
  }'
```

### Route-specific alerts

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

**Look for:**
- `alertCount` (may be 0 if no active alerts)
- `headerText`, `descriptionText` fields
- `cause`, `effect`, `severityLevel` fields

---

## 7. Test Caching

### First request (cache miss)

```bash
time curl -X POST https://your-deployment.vercel.app/ \
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

**Expected:** 450-800ms response time

### Second request (cache hit)

Run the same command immediately:

```bash
time curl -X POST https://your-deployment.vercel.app/ \
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

**Expected:** 50-150ms response time (much faster!)

### Clear cache

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

**Expected response:**
```json
{
  "success": true,
  "message": "GTFS-Realtime cache cleared"
}
```

---

## 8. Test Legacy Fallback

Force use of TransitView API instead of GTFS-RT.

```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_bus_locations",
      "arguments": {
        "route": "33",
        "useLegacy": true
      }
    },
    "id": 1
  }'
```

**Look for:**
- Simpler response format
- Fewer fields (no bearing, speed, delay, etc.)
- `Direction` text field instead of `directionId`

---

## 9. Direction Detection Test

Test routes going in different directions to verify bearing-based direction detection.

### Northbound vehicle

Route going north should have `directionId: 0` and bearing ~0° or 360°

```bash
# Find a northbound route during testing
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_bus_locations",
      "arguments": {"route": "23"}
    },
    "id": 1
  }' | jq '.result.content[0].text | fromjson | .vehicles[] | select(.bearing < 45 or .bearing > 315) | {vehicleId, bearing, directionId}'
```

**Expected:** `directionId: 0` for vehicles with bearing 0-45° or 315-360°

### Southbound vehicle

```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_bus_locations",
      "arguments": {"route": "23"}
    },
    "id": 1
  }' | jq '.result.content[0].text | fromjson | .vehicles[] | select(.bearing > 135 and .bearing < 225) | {vehicleId, bearing, directionId}'
```

**Expected:** `directionId: 1` for vehicles with bearing 135-225°

---

## 10. Error Handling Test

Test with invalid route to verify error handling.

```bash
curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_bus_locations",
      "arguments": {"route": "INVALID999"}
    },
    "id": 1
  }'
```

**Expected:**
- Should handle gracefully
- May return empty vehicles array
- Should not crash server

---

## Test Routes by Time of Day

### Best Testing Times

**Weekdays:**
- **7:00-9:00 AM**: Morning rush, high frequency on all routes
- **12:00-1:00 PM**: Midday, moderate service
- **4:00-7:00 PM**: Evening rush, highest frequency
- **10:00 PM-5:00 AM**: Limited service, may have empty results

**Weekends:**
- Service reduced on most routes
- Use major routes (23, 33, 45, G) for best results

### Recommended Test Routes

| Route | Type | Frequency | Best For Testing |
|-------|------|-----------|------------------|
| **23** | Bus | Very High | Direction detection |
| **33** | Bus | High | General testing |
| **36** | Bus Loop | Moderate | Loop route handling |
| **45** | Bus | High | Large fleet |
| **G** | Trolley | High | Trolley testing |
| **47** | Bus | High | Center City routes |

---

## Verification Checklist

After running tests, verify:

- [ ] Health check shows v3.0.0
- [ ] 7 tools listed in tools/list
- [ ] GTFS-RT vehicle positions working
- [ ] Direction detection functioning (~95% accuracy)
- [ ] Loop routes show directionId: 0
- [ ] Trip updates returning delays
- [ ] Service alerts accessible
- [ ] Caching working (second request faster)
- [ ] Cache clearing functional
- [ ] Legacy fallback works with useLegacy: true
- [ ] Error handling graceful
- [ ] No server crashes

---

## Performance Benchmarks

Run these to measure performance:

### Cold start (first request after deploy)
```bash
time curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "get_bus_locations", "arguments": {"route": "33"}}, "id": 1}'
```
**Target:** < 1 second

### Warm request (cached)
```bash
time curl -X POST https://your-deployment.vercel.app/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "get_bus_locations", "arguments": {"route": "33"}}, "id": 1}'
```
**Target:** < 150ms

---

## Troubleshooting

### No vehicles returned
- Check if route is running (time of day, weekday vs weekend)
- Verify route number is correct
- Try a high-frequency route (23, 33, 45)

### Slow responses
- First request after deploy is slower (cold start)
- Cache miss is slower than cache hit
- SEPTA API may be temporarily slow

### Direction detection seems wrong
- Direction based on current bearing, not route direction
- May be inaccurate when vehicle is stopped/turning
- Loop routes always show direction 0

### GTFS-RT unavailable
- Server automatically falls back to TransitView
- Check Vercel logs for details
- Try legacy mode: `"useLegacy": true`

---

## Monitoring in Production

### Key Metrics to Watch

1. **Response Times**
   - Cache hit: 50-100ms
   - Cache miss: 450-800ms
   - Alert if > 2 seconds

2. **Error Rates**
   - Should be < 1%
   - Check Vercel logs for patterns

3. **Cache Hit Rate**
   - Should be > 80% for active routes
   - Lower for infrequent requests

4. **GTFS-RT Feed Availability**
   - Monitor fallback to TransitView
   - Should be > 95% available

### Vercel Logs

Check logs at: https://vercel.com/your-org/your-project/logs

Look for:
- `[GTFS-RT] Fetching feed` - Feed requests
- `[GTFS-RT] Using cached feed` - Cache hits
- `[ERROR]` - Error conditions
- `[DEBUG]` - Detailed debug info

---

## Quick Reference: curl Templates

### Get vehicles (GTFS-RT)
```bash
curl -X POST URL -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_bus_locations","arguments":{"route":"ROUTE"}},"id":1}'
```

### Get trip updates
```bash
curl -X POST URL -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_trip_updates","arguments":{"route":"ROUTE"}},"id":1}'
```

### Get alerts
```bash
curl -X POST URL -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_service_alerts","arguments":{"route":"ROUTE"}},"id":1}'
```

Replace `URL` with your deployment URL and `ROUTE` with route number.

---

## Success Criteria

Implementation is successful if:

✅ All 7 tools are available  
✅ GTFS-RT vehicle positions include bearing, speed, directionId  
✅ Direction detection working (~95% accuracy)  
✅ Loop routes always show directionId: 0  
✅ Trip updates show delays  
✅ Service alerts accessible  
✅ Caching improves response times  
✅ Legacy fallback works  
✅ No crashes or critical errors  

---

**Happy Testing! 🚌**

For detailed documentation, see:
- [GTFS_REALTIME_GUIDE.md](GTFS_REALTIME_GUIDE.md)
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)
- [README.md](README.md)
