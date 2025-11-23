/**
 * JSON parser for series data with support for:
 * - Single series or collection of series
 * - Points as arrays [x, y] or objects {x, y, label?, color?, meta?}
 * - Time normalization (string dates and numeric timestamps)
 * - Preserving pin-related fields (label, color, meta)
 */

/**
 * Parse a JSON file into series format
 * @param {File} file - The JSON file to parse
 * @returns {Promise<{series: Array, meta: Object}>}
 */
export async function parseJSONFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Determine if this is a series collection or single series
    let seriesArray = [];
    let globalMeta = {};
    
    if (Array.isArray(data)) {
      // Array of series
      seriesArray = data;
    } else if (data.type === 'series-collection' && Array.isArray(data.series)) {
      // Series collection format
      seriesArray = data.series;
      globalMeta = data.meta || {};
    } else if (data.type === 'series' || data.data || data.points) {
      // Single series format
      seriesArray = [data];
    } else if (data.series && Array.isArray(data.series)) {
      // Fallback: series property
      seriesArray = data.series;
      globalMeta = data.meta || {};
    } else {
      // Assume the entire object is a single series
      seriesArray = [data];
    }
    
    // Process each series
    const processedSeries = [];
    for (let i = 0; i < seriesArray.length; i++) {
      const series = seriesArray[i];
      const processed = processSeries(series, i);
      if (processed && processed.raw && processed.raw.length > 0) {
        processedSeries.push(processed);
      }
    }
    
    return {
      series: processedSeries,
      meta: globalMeta
    };
  } catch (err) {
    console.error('[parseJSONFile] Error parsing JSON:', err);
    throw new Error(`JSON parsing failed: ${err.message}`);
  }
}

/**
 * Process a single series object
 * @param {Object} series - Raw series data
 * @param {number} index - Index in the series array
 * @returns {Object} Processed series with id, name, raw, firstX, meta
 */
function processSeries(series, index) {
  // Extract basic properties
  const id = series.id || crypto.randomUUID?.() || `s${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const name = series.name || series.label || `Series ${index + 1}`;
  const meta = series.meta || {};
  
  // Get the points array (might be under different property names)
  let pointsArray = series.data || series.points || series.values || [];
  if (!Array.isArray(pointsArray)) {
    console.warn(`[processSeries] Series "${name}" has no valid points array, skipping`);
    return null;
  }
  
  // Process and normalize points
  const raw = [];
  for (let i = 0; i < pointsArray.length; i++) {
    const point = pointsArray[i];
    const normalized = normalizePoint(point, i, name);
    if (normalized) {
      raw.push(normalized);
    }
  }
  
  if (raw.length === 0) {
    console.warn(`[processSeries] Series "${name}" has no valid points after processing`);
    return null;
  }
  
  // Sort by x (absolute time)
  raw.sort((a, b) => {
    const aX = Array.isArray(a) ? a[0] : a.x;
    const bX = Array.isArray(b) ? b[0] : b.x;
    return aX - bX;
  });
  
  // Determine firstX
  const firstPoint = raw[0];
  const firstX = Array.isArray(firstPoint) ? firstPoint[0] : firstPoint.x;
  
  return {
    id,
    name,
    raw,
    firstX,
    meta
  };
}

/**
 * Normalize a single point into the internal format
 * Supports both array [x, y] and object {x, y, label?, color?, meta?}
 * @param {Array|Object} point - Raw point data
 * @param {number} index - Point index for error messages
 * @param {string} seriesName - Series name for error messages
 * @returns {Array|Object|null} Normalized point or null if invalid
 */
function normalizePoint(point, index, seriesName) {
  if (Array.isArray(point)) {
    // Array format: [x, y] or [x, y, ...extra]
    if (point.length < 2) {
      console.warn(`[normalizePoint] Point ${index} in "${seriesName}" has insufficient elements, skipping`);
      return null;
    }
    
    const x = normalizeTime(point[0]);
    const y = coerceNumeric(point[1]);
    
    if (x === null || y === null) {
      console.warn(`[normalizePoint] Point ${index} in "${seriesName}" has invalid x or y, skipping`);
      return null;
    }
    
    return [x, y];
  } else if (typeof point === 'object' && point !== null) {
    // Object format: {x, y, label?, color?, meta?}
    const x = normalizeTime(point.x);
    const y = coerceNumeric(point.y);
    
    if (x === null || y === null) {
      console.warn(`[normalizePoint] Point ${index} in "${seriesName}" has invalid x or y, skipping`);
      return null;
    }
    
    // Build normalized object preserving pin-related fields
    const normalized = { x, y };
    
    // Preserve optional fields
    if (point.label !== undefined && point.label !== null && String(point.label).trim() !== '') {
      normalized.label = String(point.label);
    }
    if (point.color !== undefined && point.color !== null) {
      normalized.color = String(point.color);
    }
    if (point.meta !== undefined && point.meta !== null) {
      normalized.meta = point.meta;
    }
    
    return normalized;
  } else {
    console.warn(`[normalizePoint] Point ${index} in "${seriesName}" has invalid format, skipping`);
    return null;
  }
}

/**
 * Normalize time value to microseconds
 * - If string: parse as date -> milliseconds -> microseconds
 * - If number < 1e13: treat as milliseconds -> microseconds
 *   (1e13 is ~317 years in milliseconds, used as threshold to distinguish ms from μs)
 * - If number >= 1e13: treat as microseconds
 * @param {string|number} value - Time value
 * @returns {number|null} Time in microseconds or null if invalid
 */
function normalizeTime(value) {
  if (typeof value === 'string') {
    // Parse string as date
    const ms = Date.parse(value);
    if (!isFinite(ms)) {
      return null;
    }
    return ms * 1000; // Convert to microseconds
  } else if (typeof value === 'number') {
    if (!isFinite(value)) {
      return null;
    }
    // Heuristic: if < 1e13 (approx 317 years in ms), treat as milliseconds; else as microseconds
    if (value < 1e13) {
      return value * 1000; // milliseconds -> microseconds
    } else {
      return value; // already microseconds
    }
  }
  return null;
}

/**
 * Coerce a value to numeric, returning null if not possible
 * @param {*} value - Value to coerce
 * @returns {number|null} Numeric value or null
 */
function coerceNumeric(value) {
  const num = Number(value);
  return isFinite(num) ? num : null;
}
