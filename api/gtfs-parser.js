/**
 * GTFS-Realtime Parser for SEPTA
 * Handles protobuf parsing, direction detection, and loop route processing
 */

const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const https = require('https');
const http = require('http');

/**
 * SEPTA GTFS-Realtime Feed URLs
 */
const GTFS_RT_FEEDS = {
  BUS: 'https://www3.septa.org/gtfsrt/septa-pa-us/Service/rtBusPositions.pb',
  BUS_TRIP_UPDATES: 'https://www3.septa.org/gtfsrt/septa-pa-us/Trip/rtTripUpdates.pb',
  ALERTS: 'https://www3.septa.org/gtfsrt/septa-pa-us/Alerts/rtAlerts.pb',
};

/**
 * Known SEPTA loop routes that require special handling
 */
const LOOP_ROUTES = new Set([
  '36',  // Eastwick Loop
  '26',  // Cheltenham Loop
  'LUCYGO', // LUCY Gold Loop
  'LUCYGR', // LUCY Green Loop
]);

/**
 * Cache for GTFS-RT feed data
 */
class GTFSCache {
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
const feedCache = new GTFSCache(30);

/**
 * Fetch binary data from URL
 */
function fetchBinaryData(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    console.log(`[GTFS-RT] Fetching feed: ${url}`);
    
    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }

      const chunks = [];
      
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        console.log(`[GTFS-RT] Fetched ${buffer.length} bytes`);
        resolve(buffer);
      });
    }).on('error', (err) => {
      reject(new Error(`Request failed: ${err.message}`));
    });
  });
}

/**
 * Parse GTFS-Realtime protobuf feed
 */
async function parseGTFSFeed(feedUrl, useCache = true) {
  // Check cache first
  if (useCache) {
    const cached = feedCache.get(feedUrl);
    if (cached) {
      console.log(`[GTFS-RT] Using cached feed data`);
      return cached;
    }
  }

  try {
    const buffer = await fetchBinaryData(feedUrl);
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
    
    console.log(`[GTFS-RT] Parsed feed with ${feed.entity.length} entities`);
    
    // Cache the result
    if (useCache) {
      feedCache.set(feedUrl, feed);
    }
    
    return feed;
  } catch (error) {
    // Try HTTP fallback
    if (feedUrl.startsWith('https')) {
      console.log(`[GTFS-RT] HTTPS failed, trying HTTP fallback`);
      const httpUrl = feedUrl.replace('https://', 'http://');
      const buffer = await fetchBinaryData(httpUrl);
      const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
      
      if (useCache) {
        feedCache.set(feedUrl, feed);
      }
      
      return feed;
    }
    throw error;
  }
}

/**
 * Determine direction from bearing and route geometry
 * Returns 0 or 1 for direction_id
 */
function determineDirectionFromBearing(bearing, routeId) {
  // For loop routes, always return direction 0
  if (LOOP_ROUTES.has(routeId)) {
    return 0;
  }

  // Normalize bearing to 0-360
  const normalizedBearing = ((bearing % 360) + 360) % 360;
  
  // Generally:
  // 0 = Outbound/Northbound/Eastbound (bearing 315-45 or 45-135)
  // 1 = Inbound/Southbound/Westbound (bearing 135-225 or 225-315)
  
  // Simplified: North/East is 0, South/West is 1
  if ((normalizedBearing >= 315 || normalizedBearing < 45) || 
      (normalizedBearing >= 45 && normalizedBearing < 135)) {
    return 0; // Northbound/Eastbound
  } else {
    return 1; // Southbound/Westbound
  }
}

/**
 * Extract vehicle positions for a specific route
 */
function extractVehiclePositions(feed, routeId) {
  const vehicles = [];
  
  for (const entity of feed.entity) {
    if (!entity.vehicle) continue;
    
    const vehicle = entity.vehicle;
    const trip = vehicle.trip;
    const position = vehicle.position;
    
    // Filter by route
    if (!trip || trip.routeId !== routeId) continue;
    
    // Determine direction_id
    let directionId = trip.directionId || 0;
    
    // If bearing is available and direction is not set, infer from bearing
    if (position && position.bearing !== undefined && position.bearing !== null) {
      directionId = determineDirectionFromBearing(position.bearing, routeId);
    }
    
    // Handle loop routes specially
    const isLoopRoute = LOOP_ROUTES.has(routeId);
    
    vehicles.push({
      vehicleId: vehicle.vehicle ? vehicle.vehicle.id : entity.id,
      label: vehicle.vehicle ? vehicle.vehicle.label : entity.id,
      latitude: position ? position.latitude : null,
      longitude: position ? position.longitude : null,
      bearing: position ? position.bearing : null,
      speed: position ? position.speed : null,
      timestamp: vehicle.timestamp || null,
      tripId: trip.tripId || null,
      routeId: trip.routeId,
      directionId: directionId,
      isLoopRoute: isLoopRoute,
      currentStopSequence: vehicle.currentStopSequence || null,
      stopId: vehicle.stopId || null,
      currentStatus: vehicle.currentStatus || null,
      congestionLevel: vehicle.congestionLevel || null,
      occupancyStatus: vehicle.occupancyStatus || null,
    });
  }
  
  console.log(`[GTFS-RT] Extracted ${vehicles.length} vehicles for route ${routeId}`);
  return vehicles;
}

/**
 * Get trip updates for a specific route
 */
async function getTripUpdates(routeId) {
  try {
    const feed = await parseGTFSFeed(GTFS_RT_FEEDS.BUS_TRIP_UPDATES);
    const updates = [];
    
    for (const entity of feed.entity) {
      if (!entity.tripUpdate) continue;
      
      const tripUpdate = entity.tripUpdate;
      const trip = tripUpdate.trip;
      
      if (!trip || trip.routeId !== routeId) continue;
      
      updates.push({
        tripId: trip.tripId,
        routeId: trip.routeId,
        directionId: trip.directionId || 0,
        scheduleRelationship: trip.scheduleRelationship || 'SCHEDULED',
        vehicleId: tripUpdate.vehicle ? tripUpdate.vehicle.id : null,
        timestamp: tripUpdate.timestamp || null,
        delay: tripUpdate.delay || 0,
        stopTimeUpdates: (tripUpdate.stopTimeUpdate || []).map(stu => ({
          stopSequence: stu.stopSequence,
          stopId: stu.stopId,
          arrivalDelay: stu.arrival ? stu.arrival.delay : null,
          arrivalTime: stu.arrival ? stu.arrival.time : null,
          departureDelay: stu.departure ? stu.departure.delay : null,
          departureTime: stu.departure ? stu.departure.time : null,
        }))
      });
    }
    
    console.log(`[GTFS-RT] Extracted ${updates.length} trip updates for route ${routeId}`);
    return updates;
  } catch (error) {
    console.error(`[GTFS-RT] Failed to get trip updates:`, error);
    throw error;
  }
}

/**
 * Get service alerts
 */
async function getServiceAlerts(routeId = null) {
  try {
    const feed = await parseGTFSFeed(GTFS_RT_FEEDS.ALERTS);
    const alerts = [];
    
    for (const entity of feed.entity) {
      if (!entity.alert) continue;
      
      const alert = entity.alert;
      
      // Filter by route if specified
      if (routeId) {
        const affectsRoute = alert.informedEntity && alert.informedEntity.some(
          ie => ie.routeId === routeId
        );
        if (!affectsRoute) continue;
      }
      
      alerts.push({
        id: entity.id,
        activePeriod: alert.activePeriod || [],
        informedEntity: alert.informedEntity || [],
        cause: alert.cause || null,
        effect: alert.effect || null,
        url: alert.url ? alert.url.translation[0]?.text : null,
        headerText: alert.headerText ? alert.headerText.translation[0]?.text : null,
        descriptionText: alert.descriptionText ? alert.descriptionText.translation[0]?.text : null,
        severityLevel: alert.severityLevel || null,
      });
    }
    
    console.log(`[GTFS-RT] Extracted ${alerts.length} alerts${routeId ? ` for route ${routeId}` : ''}`);
    return alerts;
  } catch (error) {
    console.error(`[GTFS-RT] Failed to get alerts:`, error);
    throw error;
  }
}

/**
 * Get comprehensive route data (positions + updates)
 */
async function getRouteData(routeId) {
  try {
    const [positionFeed, tripUpdates] = await Promise.all([
      parseGTFSFeed(GTFS_RT_FEEDS.BUS),
      getTripUpdates(routeId).catch(err => {
        console.warn(`[GTFS-RT] Trip updates unavailable: ${err.message}`);
        return [];
      })
    ]);
    
    const positions = extractVehiclePositions(positionFeed, routeId);
    
    // Merge trip updates with positions
    const vehicleMap = new Map(positions.map(v => [v.tripId, v]));
    
    for (const update of tripUpdates) {
      const vehicle = vehicleMap.get(update.tripId);
      if (vehicle) {
        vehicle.delay = update.delay;
        vehicle.stopTimeUpdates = update.stopTimeUpdates;
      }
    }
    
    return {
      routeId,
      timestamp: Date.now(),
      vehicleCount: positions.length,
      isLoopRoute: LOOP_ROUTES.has(routeId),
      vehicles: positions,
    };
  } catch (error) {
    console.error(`[GTFS-RT] Failed to get route data:`, error);
    throw error;
  }
}

/**
 * Clear the feed cache (useful for testing)
 */
function clearCache() {
  feedCache.clear();
  console.log('[GTFS-RT] Cache cleared');
}

module.exports = {
  parseGTFSFeed,
  extractVehiclePositions,
  getTripUpdates,
  getServiceAlerts,
  getRouteData,
  clearCache,
  GTFS_RT_FEEDS,
  LOOP_ROUTES,
};
