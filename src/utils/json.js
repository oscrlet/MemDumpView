// JSON parser for series data
// Supports both series-collection format and single series format
// Normalizes timestamps to absolute microseconds

/**
 * Normalize x value to absolute microseconds
 * - ISO string → Date.parse → ms → *1000
 * - Numeric heuristic: x < 1e13 → ms → *1000 else microseconds
 */
function normalizeTimestamp(x) {
  if (typeof x === 'string') {
    // ISO timestamp string
    const ms = Date.parse(x);
    if (!isFinite(ms)) {
      throw new Error(`Invalid ISO timestamp: ${x}`);
    }
    return ms * 1000; // convert to microseconds
  }
  
  if (typeof x === 'number') {
    // Numeric timestamp - apply heuristic
    // If x < 1e13 (less than ~317 years in milliseconds), assume milliseconds
    // Otherwise assume microseconds
    if (x < 1e13) {
      return x * 1000; // milliseconds to microseconds
    }
    return x; // already in microseconds
  }
  
  throw new Error(`Invalid timestamp type: ${typeof x}`);
}

/**
 * Parse a point entry which can be:
 * - [x, y] tuple
 * - {x, y, label?, color?, meta?} object
 * 
 * Returns normalized point with absolute microseconds timestamp
 */
function parsePoint(point) {
  if (Array.isArray(point)) {
    // Tuple format [x, y]
    if (point.length < 2) {
      throw new Error('Point array must have at least 2 elements');
    }
    const x = normalizeTimestamp(point[0]);
    const y = Number(point[1]);
    if (!isFinite(y)) {
      throw new Error(`Invalid y value: ${point[1]}`);
    }
    return { x, y };
  }
  
  if (typeof point === 'object' && point !== null) {
    // Object format {x, y, label?, color?, meta?}
    if (!('x' in point) || !('y' in point)) {
      throw new Error('Point object must have x and y properties');
    }
    const x = normalizeTimestamp(point.x);
    const y = Number(point.y);
    if (!isFinite(y)) {
      throw new Error(`Invalid y value: ${point.y}`);
    }
    
    const result = { x, y };
    if (point.label) result.label = String(point.label);
    if (point.color) result.color = String(point.color);
    if (point.meta) result.meta = point.meta;
    
    return result;
  }
  
  throw new Error(`Invalid point format: ${typeof point}`);
}

/**
 * Parse a single series object
 * Returns normalized series with id, name, raw points, firstX, and meta
 */
function parseSeries(seriesObj, fallbackName = 'series') {
  if (!seriesObj || typeof seriesObj !== 'object') {
    throw new Error('Series must be an object');
  }
  
  const data = seriesObj.data || seriesObj.points || [];
  if (!Array.isArray(data)) {
    throw new Error('Series data must be an array');
  }
  
  // Parse all points
  const parsedPoints = [];
  const labeledPoints = []; // Points with labels for pinning
  
  for (let i = 0; i < data.length; i++) {
    try {
      const pt = parsePoint(data[i]);
      parsedPoints.push([pt.x, pt.y]);
      
      // Track labeled points for embedding into pinnedPoints
      if (pt.label) {
        labeledPoints.push({
          x: pt.x,
          y: pt.y,
          label: pt.label,
          color: pt.color,
          meta: pt.meta
        });
      }
    } catch (err) {
      console.warn(`Skipping invalid point at index ${i}:`, err.message);
    }
  }
  
  if (parsedPoints.length === 0) {
    throw new Error('Series has no valid data points');
  }
  
  // Sort by x (timestamp)
  parsedPoints.sort((a, b) => a[0] - b[0]);
  
  const firstX = parsedPoints[0][0];
  const id = seriesObj.id || crypto.randomUUID?.() || `s${Date.now()}${Math.random()}`;
  const name = seriesObj.name || fallbackName;
  
  return {
    id,
    name,
    raw: parsedPoints,
    firstX,
    meta: seriesObj.meta || {},
    labeledPoints // Include labeled points for pinning
  };
}

/**
 * Parse JSON text into series data
 * Supports two formats:
 * 1. Series collection: { meta?, series: [...] }
 * 2. Single series: { id?, name?, data: [...] }
 */
export async function parseJSONText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err.message}`);
  }
  
  const result = {
    meta: {},
    series: []
  };
  
  // Check if it's a series collection format
  if (data.series && Array.isArray(data.series)) {
    // Series collection format
    result.meta = data.meta || {};
    
    for (let i = 0; i < data.series.length; i++) {
      try {
        const series = parseSeries(data.series[i], `series-${i + 1}`);
        result.series.push(series);
      } catch (err) {
        console.warn(`Skipping invalid series at index ${i}:`, err.message);
      }
    }
  } else if (data.data || data.points) {
    // Single series format
    try {
      const series = parseSeries(data, 'series');
      result.series.push(series);
    } catch (err) {
      throw new Error(`Invalid series format: ${err.message}`);
    }
  } else {
    throw new Error('JSON must contain either "series" array or "data"/"points" array');
  }
  
  if (result.series.length === 0) {
    throw new Error('No valid series found in JSON');
  }
  
  return result;
}

/**
 * Parse JSON file into series data
 */
export async function parseJSONFile(file) {
  const text = await file.text();
  return parseJSONText(text);
}
