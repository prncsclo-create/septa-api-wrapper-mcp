# SEPTA API Research & Troubleshooting

## Issue: 404 Error on TransitView API

### Problem Summary
The SEPTA MCP integration was returning 404 errors when attempting to get real-time bus locations for routes (e.g., Route 33).

### Root Cause
The TransitView API endpoint structure was incorrect. The old `/TransitView/index.php` endpoint has been deprecated or changed.

---

## SEPTA API Endpoint Analysis

### ❌ **OLD ENDPOINT (NOT WORKING)**
```
https://www3.septa.org/TransitView/index.php?route=33
```
**Status:** Returns 404 Not Found

### ✅ **CORRECT ENDPOINT (WORKING)**
```
http://www3.septa.org/hackathon/TransitView/33
```
**Status:** Returns JSON with real-time vehicle data

---

## API Endpoint Format

### TransitView API (Bus/Trolley Locations)

**Correct Format:**
```
http://www3.septa.org/hackathon/TransitView/{ROUTE}
```

**Examples:**
- Route 33: `http://www3.septa.org/hackathon/TransitView/33`
- Route 23: `http://www3.septa.org/hackathon/TransitView/23`
- Route 45: `http://www3.septa.org/hackathon/TransitView/45`
- Trolley G: `http://www3.septa.org/hackathon/TransitView/G`

**Response Structure:**
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

### Bus Detours API

**Format:**
```
http://www3.septa.org/api/BusDetours/index.php?route={ROUTE}
```

**Example:**
```
http://www3.septa.org/api/BusDetours/index.php?route=33
```

### Alerts API

**Format:**
```
http://www3.septa.org/api/Alerts/index.php
```

**No parameters needed** - returns all system alerts.

---

## Testing

### Test TransitView for Route 33:
```bash
curl http://www3.septa.org/hackathon/TransitView/33
```

### Test Bus Detours for Route 33:
```bash
curl http://www3.septa.org/api/BusDetours/index.php?route=33
```

### Test System Alerts:
```bash
curl http://www3.septa.org/api/Alerts/index.php
```

---

## Key Differences

| Aspect | Old Endpoint | New Endpoint |
|--------|-------------|--------------|
| **Base URL** | `/TransitView/index.php` | `/hackathon/TransitView/` |
| **Parameter Type** | Query parameter (`?route=`) | Path parameter (`/{route}`) |
| **Protocol** | HTTPS | HTTP |
| **Status** | 404 Not Found | Working |

---

## Implementation Notes

1. **Route Parameter:** Passed as part of the URL path, not as a query parameter
2. **Protocol:** Use HTTP (not HTTPS) for the hackathon endpoint
3. **URL Encoding:** Still apply `encodeURIComponent()` for route names with special characters
4. **Trolley Routes:** Letters like 'G' work the same way as numeric routes

---

## Research Sources

Based on analysis of existing SEPTA API implementations on GitHub:
- `kerrygilbert/node-septa` - Node.js SEPTA API wrapper
- `Vlek/better-SEPTA` - SEPTA trolley tracking application
- Various other SEPTA API projects using the hackathon endpoint

---

## Version History

### v1.0.0 (Initial)
- Used incorrect endpoint: `https://www3.septa.org/TransitView/index.php?route={route}`
- Result: 404 errors

### v1.0.1 (Fixed)
- Updated to correct endpoint: `http://www3.septa.org/hackathon/TransitView/{route}`
- Result: Working real-time data

---

## Additional Resources

- **SEPTA Developer Portal:** https://www.septa.org/developer/
- **SEPTA Real-Time Data:** https://www3.septa.org/hackathon/
- **API Documentation:** Limited official documentation; most knowledge comes from community implementations

---

## Troubleshooting

### If you get 404 errors:
1. ✅ Verify you're using the `/hackathon/TransitView/` endpoint
2. ✅ Ensure route is in the URL path, not query parameter
3. ✅ Use HTTP, not HTTPS
4. ✅ Check the route number/letter is valid for SEPTA

### If you get empty data:
1. Route may not be currently running (check schedule)
2. No vehicles may be active on that route at the time
3. Try a different route to verify API is working

### Common Valid Routes:
- **Buses:** 1, 2, 4, 7, 9, 12, 17, 21, 23, 27, 31, 32, 33, 38, 42, 44, 45, 47, 48, 50, 52, 53, 54, 56, 57, 58, 60, 61, 62, 64, 65, 66, 67, 68, 70, 73, 75, 77, 78, 79, 80, 84, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 139, 150, 201, 204, 206
- **Trolleys:** 10, 11, 13, 34, 36, G (Green Line)

---

**Last Updated:** February 4, 2026
