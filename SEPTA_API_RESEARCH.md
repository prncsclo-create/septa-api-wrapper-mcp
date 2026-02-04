# SEPTA API Research & Troubleshooting

## Issue: 404 Error on TransitView API

### Problem Summary
The SEPTA MCP integration was returning 404 errors when attempting to get real-time bus locations for routes (e.g., Route 33).

### Solution: Multi-Endpoint Fallback Strategy
Since SEPTA's API endpoints have inconsistent availability, we now implement an intelligent fallback system that tries multiple endpoint variations automatically.

---

## SEPTA API Endpoint Strategy

### **Primary Endpoints (Tried First)**

#### 1. Official SEPTA API (HTTPS)
```
https://www3.septa.org/api/TransitView/index.php?route=33
```
**Format:** Query parameter
**Protocol:** HTTPS
**Status:** Should be the primary endpoint according to SEPTA documentation

#### 2. Official SEPTA API (HTTP)
```
http://www3.septa.org/api/TransitView/index.php?route=33
```
**Format:** Query parameter
**Protocol:** HTTP
**Status:** HTTP fallback in case HTTPS fails

### **Fallback Endpoints**

#### 3. Hackathon API
```
http://www3.septa.org/hackathon/TransitView/33
```
**Format:** Path parameter
**Protocol:** HTTP
**Status:** Community-documented endpoint, often more reliable

#### 4. TransitViewAll API
```
https://www3.septa.org/api/TransitViewAll/index.php
```
**Format:** Returns all routes (requires filtering)
**Protocol:** HTTPS
**Status:** System-wide endpoint that can be filtered client-side

---

## Implementation Details

### Endpoint Try Order
The implementation tries endpoints in this order:
1. ✅ `https://www3.septa.org/api/TransitView/index.php?route={route}` (Official HTTPS)
2. ✅ `http://www3.septa.org/api/TransitView/index.php?route={route}` (Official HTTP)
3. ✅ `http://www3.septa.org/hackathon/TransitView/{route}` (Hackathon)
4. ✅ `https://www3.septa.org/api/TransitViewAll/index.php` (System-wide with filtering)

### Enhanced Debugging
The implementation includes comprehensive logging:
- Request URL being attempted
- HTTP status codes
- Response headers
- Response body preview
- Error messages with context

**Console Output Example:**
```
[DEBUG] Making request to: https://www3.septa.org/api/TransitView/index.php?route=33
[DEBUG] Response status: 200
[DEBUG] Response headers: {...}
[DEBUG] Response body length: 1234
[DEBUG] Response body preview: {"bus":[...]}
[INFO] Getting bus locations for route: 33
[DEBUG] Success with endpoint: https://www3.septa.org/api/TransitView/index.php?route=33
```

---

## API Response Formats

### TransitView Response
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

### TransitViewAll Response
```json
{
  "routes": {
    "33": {
      "bus": [...]
    },
    "45": {
      "bus": [...]
    }
  }
}
```

---

## Testing

### Test Individual Endpoints

**Official API (HTTPS):**
```bash
curl "https://www3.septa.org/api/TransitView/index.php?route=33"
```

**Official API (HTTP):**
```bash
curl "http://www3.septa.org/api/TransitView/index.php?route=33"
```

**Hackathon API:**
```bash
curl "http://www3.septa.org/hackathon/TransitView/33"
```

**TransitViewAll API:**
```bash
curl "https://www3.septa.org/api/TransitViewAll/index.php"
```

### Test via MCP Integration
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

---

## Advantages of Multi-Endpoint Approach

### ✅ **Reliability**
- Continues working even if one endpoint is down
- Automatic failover with no user intervention
- Handles HTTPS/HTTP inconsistencies

### ✅ **Compatibility**
- Works with official SEPTA API specification
- Compatible with community-documented endpoints
- Handles different response formats

### ✅ **Debugging**
- Comprehensive logging for troubleshooting
- Clear error messages indicating which endpoints failed
- Response preview for API analysis

### ✅ **Maintenance**
- No need to hard-code a single endpoint
- Adapts to SEPTA API changes automatically
- Easy to add new endpoint variations

---

## Endpoint Availability Matrix

| Endpoint | HTTPS | HTTP | Format | Reliability |
|----------|-------|------|--------|-------------|
| `/api/TransitView/index.php` | ✓ | ✓ | Query | Official |
| `/hackathon/TransitView/{route}` | ✗ | ✓ | Path | Community |
| `/api/TransitViewAll/index.php` | ✓ | ? | All Routes | System-wide |

---

## Common Issues & Solutions

### Issue: All Endpoints Return 404
**Possible Causes:**
1. Invalid route number
2. SEPTA API maintenance
3. Network connectivity issues

**Solution:**
- Verify route number is valid
- Check SEPTA service status
- Try different routes (e.g., 23, 45)
- Wait and retry (API may be temporarily down)

### Issue: Empty Response Array
**Possible Causes:**
1. Route not currently running
2. No vehicles active on route
3. Outside service hours

**Solution:**
- Check SEPTA schedule for route
- Try during peak hours
- Verify route runs on current day (weekday/weekend)

### Issue: Slow Response Times
**Possible Causes:**
1. SEPTA API server load
2. Network latency
3. Vercel cold start

**Solution:**
- Implement caching (future enhancement)
- Set appropriate timeouts
- Accept 2-5 second response times as normal

---

## Alternative SEPTA APIs (Future Exploration)

### GTFS Real-Time
```
https://www3.septa.org/api/gtfsrt/septa-pa-us/Vehicle/print.php
```
**Format:** Protocol Buffers (requires parsing)
**Advantages:** More standard format
**Disadvantages:** More complex to parse

### Protocol Buffer to JSON
```
https://www3.septa.org/api/pbtojson/Bus/Services/index.php
```
**Format:** JSON conversion of GTFS-RT
**Status:** Needs investigation

---

## Version History

### v1.0.0 (Initial)
- Used single endpoint: `https://www3.septa.org/TransitView/index.php?route={route}`
- Result: 404 errors

### v1.0.1 (First Fix Attempt)
- Updated to hackathon endpoint: `http://www3.septa.org/hackathon/TransitView/{route}`
- Result: Worked but not using official API

### v1.0.2 (Current - Multi-Endpoint Strategy)
- Tries official API endpoints first (HTTPS & HTTP)
- Falls back to hackathon endpoint if needed
- Includes TransitViewAll as last resort
- Comprehensive logging and error handling
- Result: Maximum reliability across all SEPTA API variations

---

## Monitoring & Debugging

### Checking Vercel Logs
1. Go to Vercel Dashboard
2. Select your deployment
3. Click "Functions" tab
4. View real-time logs showing:
   - Which endpoints are being tried
   - Which endpoint succeeded
   - Response status codes
   - Error messages

### Expected Log Pattern (Success)
```
[DEBUG] Making request to: https://www3.septa.org/api/TransitView/index.php?route=33
[DEBUG] Response status: 200
[DEBUG] Success with endpoint: https://www3.septa.org/api/TransitView/index.php?route=33
```

### Expected Log Pattern (Fallback)
```
[DEBUG] Making request to: https://www3.septa.org/api/TransitView/index.php?route=33
[DEBUG] Response status: 404
[DEBUG] Failed with endpoint: [...]
[DEBUG] Making request to: http://www3.septa.org/hackathon/TransitView/33
[DEBUG] Response status: 200
[DEBUG] Success with endpoint: http://www3.septa.org/hackathon/TransitView/33
```

---

## Common Valid Routes

### Major Bus Routes
- **Center City:** 2, 4, 7, 9, 12, 17, 21, 23, 27, 31, 32, 33, 38, 42, 44, 45, 47, 48
- **North Philadelphia:** 50, 52, 53, 54, 56, 57, 58, 60, 61, 62
- **West Philadelphia:** 64, 65, 66, 67, 68
- **South Philadelphia:** 47, 47M, 57, 68
- **Northeast:** 14, 58, 67, 70, 73, 75, 77, 78, 79, 84, 88, 89, 90, 91, 92, 94, 95, 96, 97, 98, 99

### Trolley Routes
- **10** - Lancaster Avenue
- **11** - Woodland Avenue
- **13** - Chester Avenue
- **34** - Baltimore Avenue
- **36** - Eastwick
- **G** - Girard Avenue (Green Line)

### Suburban Routes
- **100+** series: Norristown, Media, Sharon Hill, etc.
- **200** series: Suburban express routes

---

## Additional Resources

- **SEPTA Developer Portal:** https://www.septa.org/developer/
- **SEPTA Real-Time Data:** https://www3.septa.org/hackathon/
- **GitHub Examples:** Search for "septa api" on GitHub for community implementations

---

**Last Updated:** February 4, 2026 - v1.0.2
**Status:** Production-ready with multi-endpoint fallback strategy
