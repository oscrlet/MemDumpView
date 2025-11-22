/**
 * CSV parsing utilities with streaming support for large files
 */

/**
 * Parse CSV data with streaming support
 * @param {string} csvText - CSV text to parse
 * @param {Object} options - Parsing options
 * @param {string} options.delimiter - Column delimiter (default: ',')
 * @param {boolean} options.hasHeader - Whether first row is header (default: true)
 * @param {Function} options.onRow - Callback for each row
 * @param {Function} options.onProgress - Progress callback
 * @returns {Object} Parsed data with headers and rows
 */
export function parseCSV(csvText, options = {}) {
  const {
    delimiter = ',',
    hasHeader = true,
    onRow = null,
    onProgress = null
  } = options;

  const lines = csvText.split(/\r?\n/);
  const headers = [];
  const rows = [];
  
  let currentLine = 0;
  const totalLines = lines.length;

  // Parse header if present
  if (hasHeader && lines.length > 0) {
    const headerLine = lines[0].trim();
    if (headerLine) {
      headers.push(...parseLine(headerLine, delimiter));
    }
    currentLine = 1;
  }

  // Parse data rows
  for (let i = currentLine; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line) continue; // Skip empty lines

    const values = parseLine(line, delimiter);
    
    // Create row object if we have headers
    const row = hasHeader && headers.length > 0
      ? Object.fromEntries(headers.map((h, idx) => [h, values[idx] || '']))
      : values;

    rows.push(row);

    // Call onRow callback if provided
    if (onRow) {
      onRow(row, i - currentLine);
    }

    // Report progress if callback provided
    if (onProgress && i % 1000 === 0) {
      onProgress({
        current: i,
        total: totalLines,
        percent: (i / totalLines) * 100
      });
    }
  }

  return { headers, rows };
}

/**
 * Parse a single CSV line handling quoted values
 * @param {string} line - CSV line to parse
 * @param {string} delimiter - Column delimiter
 * @returns {string[]} Array of values
 */
function parseLine(line, delimiter) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      // End of value
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add last value
  values.push(current.trim());

  return values;
}

/**
 * Stream parse large CSV file in chunks
 * @param {File} file - File object to parse
 * @param {Object} options - Parsing options
 * @returns {Promise<Object>} Promise resolving to parsed data
 */
export async function parseCSVFile(file, options = {}) {
  const chunkSize = options.chunkSize || 1024 * 1024; // 1MB chunks
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  
  let buffer = '';
  let headers = [];
  const rows = [];
  let lineNumber = 0;
  let hasReadHeader = !options.hasHeader;

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        // Process remaining buffer
        if (buffer.trim()) {
          processLine(buffer, headers, rows, options);
        }
        break;
      }

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        if (!hasReadHeader) {
          // Parse header
          headers = parseLine(line, options.delimiter || ',');
          hasReadHeader = true;
          
          if (options.onHeader) {
            options.onHeader(headers);
          }
        } else {
          // Parse data row
          const values = parseLine(line, options.delimiter || ',');
          const row = headers.length > 0
            ? Object.fromEntries(headers.map((h, idx) => [h, values[idx] || '']))
            : values;
          
          rows.push(row);

          if (options.onRow) {
            options.onRow(row, lineNumber);
          }

          lineNumber++;
        }

        if (options.onProgress && lineNumber % 1000 === 0) {
          options.onProgress({
            lines: lineNumber,
            bytes: file.size
          });
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { headers, rows };
}

/**
 * Process a single line
 */
function processLine(line, headers, rows, options) {
  const values = parseLine(line, options.delimiter || ',');
  const row = headers.length > 0
    ? Object.fromEntries(headers.map((h, idx) => [h, values[idx] || '']))
    : values;
  rows.push(row);
}

/**
 * Convert rows to CSV string
 * @param {Array} rows - Array of row objects or arrays
 * @param {string[]} headers - Optional headers array
 * @param {string} delimiter - Column delimiter (default: ',')
 * @returns {string} CSV string
 */
export function toCSV(rows, headers = null, delimiter = ',') {
  if (!rows || rows.length === 0) {
    return '';
  }

  const lines = [];

  // Determine headers
  let cols = headers;
  if (!cols && typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
    cols = Object.keys(rows[0]);
  }

  // Add header row if we have column names
  if (cols && cols.length > 0) {
    lines.push(cols.map(escapeCSVValue).join(delimiter));
  }

  // Add data rows
  for (const row of rows) {
    const values = Array.isArray(row)
      ? row
      : (cols ? cols.map(col => row[col] ?? '') : Object.values(row));
    
    lines.push(values.map(escapeCSVValue).join(delimiter));
  }

  return lines.join('\n');
}

/**
 * Escape a CSV value (add quotes if needed)
 * @param {any} value - Value to escape
 * @returns {string} Escaped value
 */
function escapeCSVValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);
  
  // Check if value needs quoting
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Escape quotes by doubling them
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Auto-detect CSV delimiter
 * @param {string} csvText - CSV text (first few lines)
 * @returns {string} Detected delimiter
 */
export function detectDelimiter(csvText) {
  const delimiters = [',', ';', '\t', '|'];
  const lines = csvText.split(/\r?\n/).slice(0, 5);
  
  const counts = {};
  
  for (const delim of delimiters) {
    const lineCounts = lines.map(line => {
      // Don't count delimiters inside quotes
      let count = 0;
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') inQuotes = !inQuotes;
        if (line[i] === delim && !inQuotes) count++;
      }
      
      return count;
    }).filter(c => c > 0);
    
    if (lineCounts.length > 0) {
      // Check if count is consistent across lines
      const avg = lineCounts.reduce((a, b) => a + b) / lineCounts.length;
      const variance = lineCounts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / lineCounts.length;
      
      counts[delim] = {
        avg,
        variance,
        consistency: variance === 0 ? 1 : 1 / (1 + variance)
      };
    }
  }
  
  // Choose delimiter with highest average count and consistency
  let bestDelim = ',';
  let bestScore = -1;
  
  for (const [delim, stats] of Object.entries(counts)) {
    const score = stats.avg * stats.consistency;
    if (score > bestScore) {
      bestScore = score;
      bestDelim = delim;
    }
  }
  
  return bestDelim;
}
