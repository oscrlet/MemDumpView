/**
 * Format utilities for displaying numbers and values
 */

/**
 * Format a number with thousand separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
export function formatNumber(num) {
  if (typeof num !== 'number' || isNaN(num)) return '0';
  return num.toLocaleString('en-US');
}

/**
 * Format bytes to human-readable size
 * @param {number} bytes - Number of bytes
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted size string (e.g., "1.5 MB")
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  if (typeof bytes !== 'number' || isNaN(bytes)) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const size = parseFloat((bytes / Math.pow(k, i)).toFixed(dm));
  
  return `${size} ${sizes[i]}`;
}

/**
 * Format a timestamp to a readable date/time string
 * @param {number|Date} timestamp - Unix timestamp or Date object
 * @returns {string} Formatted date/time string
 */
export function formatTimestamp(timestamp) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  
  if (isNaN(date.getTime())) return 'Invalid Date';
  
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Format a duration in milliseconds to human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "1.5s", "250ms")
 */
export function formatDuration(ms) {
  if (typeof ms !== 'number' || isNaN(ms)) return '0ms';
  
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  } else if (ms < 3600000) {
    return `${(ms / 60000).toFixed(2)}m`;
  } else {
    return `${(ms / 3600000).toFixed(2)}h`;
  }
}

/**
 * Format a percentage value
 * @param {number} value - Value between 0 and 1 (or 0-100)
 * @param {number} decimals - Number of decimal places (default: 1)
 * @param {boolean} isDecimal - Whether input is 0-1 (true) or 0-100 (false)
 * @returns {string} Formatted percentage string
 */
export function formatPercent(value, decimals = 1, isDecimal = true) {
  if (typeof value !== 'number' || isNaN(value)) return '0%';
  
  const percent = isDecimal ? value * 100 : value;
  return `${percent.toFixed(decimals)}%`;
}

/**
 * Truncate a string to a maximum length
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add when truncated (default: "...")
 * @returns {string} Truncated string
 */
export function truncate(str, maxLength, suffix = '...') {
  if (typeof str !== 'string') return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML string
 */
export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format a coordinate pair
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted coordinate string
 */
export function formatCoordinate(x, y, decimals = 2) {
  const xStr = typeof x === 'number' ? x.toFixed(decimals) : '0';
  const yStr = typeof y === 'number' ? y.toFixed(decimals) : '0';
  return `(${xStr}, ${yStr})`;
}
