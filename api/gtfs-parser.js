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
 * Maximum size for HTTP streaming (50MB) to prevent memory crashes
 */
const MAX_STREAM_SIZE = 50 * 1024 * 1024;

/**
 * Maximum number of retries for fallback logic
 */
const MAX_RETRY_ATTEMPTS = 1;

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
 * Fetch binary data from URL with memory protection
 * @param {string} url - URL to fetch from
 * @param {number} maxSize - Maximum allowed size in bytes (default: 50MB)
 * @returns {Promise<Buffer>} Binary data buffer
 * @throws {Error} If fetch fails or size limit exceeded
 */
function fetchBinaryData(url, maxSize = MAX_STREAM_SIZE) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    console.log(`[GTFS-RT] Fetching feed: ${url}`);
    
    const request = protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        const error = new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`);
        console.error(`[GTFS-RT] HTTP error:`, error.message);
        reject(error);
        return;
      }

      const chunks = [];
      let totalSize = 0;
      
      res.on('data', (chunk) => {
        totalSize += chunk.length;
        
        // Memory protection: Check if we've exceeded the size limit
        if (totalSize > maxSize) {
          res.destroy();
          const error = new Error(`Stream size exceeded limit of ${maxSize} bytes (received ${totalSize} bytes)`);
          console.error(`[GTFS-RT] Memory protection triggered:`, error.message);
          reject(error);
          return;
        }
        
        chunks.push(chunk);
      });
      
      res.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          console.log(`[GTFS-RT] Successfully fetched ${buffer.length} bytes`);
          resolve(buffer);
        } catch (error) {
          console.error(`[GTFS-RT] Buffer concatenation failed:`, error.message);
          reject(new Error(`Failed to concatenate buffer: ${error.message}`));
        }
      });
      
      res.on('error', (error) => {
        console.error(`[GTFS-RT] Response error:`, error.message);
        reject(new Error(`Response error: ${error.message}`));
      });
    });
    
    request.on('error', (error) => {
      console.error(`[GTFS-RT] Request error:`, error.message);
      reject(new Error(`Request failed: ${error.message}`));
    });
    
    // Set timeout for the request
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Request timeout after 30 seconds'));
    });
  });
}

/**
 * Parse GTFS-Realtime protobuf feed with retry logic
 * @param {string} feedUrl - URL of the GTFS-RT feed
 * @param {boolean} useCache - Whether to use cached data
 * @param {number} retryCount - Internal retry counter to prevent infinite recursion
 * @returns {Promise<Object>} Parsed GTFS-RT feed
 * @throws {Error} If parsing fails after all retries
 */
async function parseGTFSFeed(feedUrl, useCache = true, retryCount = 0) {
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
    
    if (!feed || !feed.entity) {
      throw new Error('Invalid feed structure: missing entity array');
    }
    
    console.log(`[GTFS-RT] Parsed feed with ${feed.entity.length} entities`);
    
    // Cache the result
    if (useCache) {
      feedCache.set(feedUrl, feed);
    }
    
    return feed;
  } catch (error) {
    console.error(`[GTFS-RT] Feed parsing error (attempt ${retryCount + 1}):`, error.message);
    
    // Prevent infinite recursion: Only retry once
    if (retryCount >= MAX_RETRY_ATTEMPTS) {
      console.error(`[GTFS-RT] Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached`);
      throw new Error(`Failed to parse feed after ${retryCount + 1} attempts: ${error.message}`);
    }
    
    // Try HTTP fallback only for HTTPS URLs and only once
    if (feedUrl.startsWith('https')) {
      console.log(`[GTFS-RT] HTTPS failed, attempting HTTP fallback (retry ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`);
      const httpUrl = feedUrl.replace('https://', 'http://');
      
      try {
        const buffer = await fetchBinaryData(httpUrl);
        const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);
        
        if (!feed || !feed.entity) {
          throw new Error('Invalid feed structure: missing entity array');
        }
        
        if (useCache) {
          feedCache.set(feedUrl, feed);
        }
        
        console.log(`[GTFS-RT] HTTP fallback succeeded with ${feed.entity.length} entities`);
        return feed;
      } catch (fallbackError) {
        console.error(`[GTFS-RT] HTTP fallback also failed:`, fallbackError.message);
        throw new Error(`Both HTTPS and HTTP attempts failed. HTTPS: ${error.message}, HTTP: ${fallbackError.message}`);
      }
    }
    
    throw error;
  }
}

/**
 * Determine direction from bearing and route geometry
 * Returns 0 or 1 for direction_id
 * 
 * Fixed: Removed overlapping bearing ranges
 * - Direction 0 (Northbound/Eastbound): 315-135 degrees (North through East)
 * - Direction 1 (Southbound/Westbound): 135-315 degrees (South through West)
 * 
 * @param {number} bearing - Vehicle bearing in degrees (0-360)
 * @param {string} routeId - Route identifier
 * @returns {number} Direction ID (0 or 1)
 */
function determineDirectionFromBearing(bearing, routeId) {
  // For loop routes, always return direction 0
  if (LOOP_ROUTES.has(routeId)) {
    return 0;
  }

  // Normalize bearing to 0-360
  const normalizedBearing = ((bearing % 360) + 360) % 360;
  
  // Fixed direction detection logic with non-overlapping ranges:
  // Direction 0: Northbound/Eastbound (315° to 135°)
  //   - Covers: NW (315°) -> N (0°) -> NE (45°) -> E (90°) -> SE (135°)
  // Direction 1: Southbound/Westbound (135° to 315°)
  //   - Covers: SE (135°) -> S (180°) -> SW (225°) -> W (270°) -> NW (315°)
  
  if (normalizedBearing >= 315 || normalizedBearing < 135) {
    return 0; // Northbound/Eastbound
  } else {
    return 1; // Southbound/Westbound
  }
}

/**
 * Extract vehicle positions for a specific route
 * @param {Object} feed - Parsed GTFS-RT feed
 * @param {string} routeId - Route identifier to filter by
 * @returns {Array} Array of vehicle position objects
 */
function extractVehiclePositions(feed, routeId) {
  const vehicles = [];
  
  if (!feed || !feed.entity) {
    console.warn(`[GTFS-RT] Invalid feed structure for route ${routeId}`);
    return vehicles;
  }
  
  for (const entity of feed.entity) {
    if (!entity.vehicle) continue;
    
    try {
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
    } catch (error) {
      console.error(`[GTFS-RT] Error processing vehicle entity ${entity.id}:`, error.message);
      // Continue processing other vehicles
    }
  }
  
  console.log(`[GTFS-RT] Extracted ${vehicles.length} vehicles for route ${routeId}`);
  return vehicles;
}

/**
 * Get trip updates for a specific route
 * @param {string} routeId - Route identifier
 * @returns {Promise<Array>} Array of trip update objects
 */
async function getTripUpdates(routeId) {
  try {
    const feed = await parseGTFSFeed(GTFS_RT_FEEDS.BUS_TRIP_UPDATES);
    const updates = [];
    
    if (!feed || !feed.entity) {
      console.warn(`[GTFS-RT] Invalid trip updates feed structure`);
      return updates;
    }
    
    for (const entity of feed.entity) {
      if (!entity.tripUpdate) continue;
      
      try {
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
      } catch (error) {
        console.error(`[GTFS-RT] Error processing trip update entity ${entity.id}:`, error.message);
        // Continue processing other updates
      }
    }
    
    console.log(`[GTFS-RT] Extracted ${updates.length} trip updates for route ${routeId}`);
    return updates;
  } catch (error) {
    console.error(`[GTFS-RT] Failed to get trip updates for route ${routeId}:`, error.message);
    throw error;
  }
}

/**
 * Get service alerts
 * @param {string|null} routeId - Optional route identifier to filter alerts
 * @returns {Promise<Array>} Array of service alert objects
 */
async function getServiceAlerts(routeId = null) {
  try {
    const feed = await parseGTFSFeed(GTFS_RT_FEEDS.ALERTS);
    const alerts = [];
    
    if (!feed || !feed.entity) {
      console.warn(`[GTFS-RT] Invalid alerts feed structure`);
      return alerts;
    }
    
    for (const entity of feed.entity) {
      if (!entity.alert) continue;
      
      try {
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
      } catch (error) {
        console.error(`[GTFS-RT] Error processing alert entity ${entity.id}:`, error.message);
        // Continue processing other alerts
      }
    }
    
    console.log(`[GTFS-RT] Extracted ${alerts.length} alerts${routeId ? ` for route ${routeId}` : ''}`);
    return alerts;
  } catch (error) {
    console.error(`[GTFS-RT] Failed to get alerts${routeId ? ` for route ${routeId}` : ''}:`, error.message);
    throw error;
  }
}

/**
 * Get comprehensive route data (positions + updates)
 * @param {string} routeId - Route identifier
 * @returns {Promise<Object>} Combined route data with vehicles and updates
 */
async function getRouteData(routeId) {
  try {
    const [positionFeed, tripUpdates] = await Promise.all([
      parseGTFSFeed(GTFS_RT_FEEDS.BUS),
      getTripUpdates(routeId).catch(err => {
        console.warn(`[GTFS-RT] Trip updates unavailable for route ${routeId}: ${err.message}`);
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
    
    console.log(`[GTFS-RT] Retrieved complete route data for ${routeId}: ${positions.length} vehicles`);
    
    return {
      routeId,
      timestamp: Date.now(),
      vehicleCount: positions.length,
      isLoopRoute: LOOP_ROUTES.has(routeId),
      vehicles: positions,
    };
  } catch (error) {
    console.error(`[GTFS-RT] Failed to get route data for ${routeId}:`, error.message);
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
  MAX_STREAM_SIZE,
  MAX_RETRY_ATTEMPTS,
};
