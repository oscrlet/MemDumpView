export function splitCSVLine(line, sep = ',') {
  const res = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // escaped quote
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === sep) {
        res.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  res.push(cur);
  return res;
}

function detectSeparator(sampleLines = []) {
  // count fields for common separators and choose the one with most columns (heuristic)
  const seps = [',', ';', '\t'];
  let best = { sep: ',', score: -1 };
  for (const sep of seps) {
    let score = 0;
    for (const line of sampleLines) {
      if (!line) continue;
      // but don't parse quotes here, just quick count of sep occurrences outside quotes might be expensive.
      // simpler: count occurrences of sep
      score += (line.split(sep).length - 1);
    }
    if (score > best.score) best = { sep, score };
  }
  return best.sep;
}

function stripBOM(s) {
  if (!s) return s;
  if (s.charCodeAt(0) === 0xFEFF) return s.slice(1);
  return s;
}

/**
 * Normalize time value to microseconds (consistent with JSON import)
 * - If value < 1e13, treat as milliseconds and multiply by 1000
 * - Otherwise, treat as microseconds
 * Heuristic reasoning:
 * - Current epoch ms: ~1.7e12 (year 2024)
 * - Current epoch μs: ~1.7e15 (year 2024)
 * - 1e13 = 10,000,000,000,000 ms ≈ year 2286 (far future)
 * - So values >= 1e13 are safely microseconds until year 2286
 * This heuristic handles both absolute timestamps and relative small values
 * @param {number} rawX - Raw time value
 * @returns {number} - Time in microseconds
 */
function normalizeTimeToMicroseconds(rawX) {
  if (!isFinite(rawX)) return rawX;
  const abs = Math.abs(rawX);
  // Heuristic: values < 1e13 are milliseconds, >= 1e13 are microseconds
  if (abs < 1e13) {
    return Math.round(rawX * 1000); // ms to μs
  }
  return Math.round(rawX); // already μs
}

/**
 * Check if a string is a parseable date (but not a plain number)
 * @param {string} str - String to check
 * @returns {number|null} - Microseconds if valid date, null otherwise
 */
function tryParseDate(str) {
  if (typeof str !== 'string') return null;
  // Don't treat pure numbers as dates
  if (/^\s*-?\d+\.?\d*\s*$/.test(str)) return null;
  const ms = Date.parse(str);
  if (isNaN(ms)) return null;
  return Math.round(ms * 1000); // Convert ms to μs
}

export async function parseCSVStream(file, onProgress) {
  const chunkSize = 1024 * 1024;
  let offset = 0, leftover = '';
  let firstLineChecked = false, isHeader = false, headerCols = null;
  let timeIdx = 0, valueIdx = 1;
  const points = [];
  const sampleLinesForDetect = [];
  while (offset < file.size) {
    const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
    const text = await slice.text();
    offset += chunkSize;
    const chunk = leftover + text;
    const lines = chunk.split(/\r?\n/);
    leftover = lines.pop() || '';
    for (let line of lines) {
      // collect sample for separator detection
      if (sampleLinesForDetect.length < 6) sampleLinesForDetect.push(line);
    }
    // determine separator if not yet
    const sep = detectSeparator(sampleLinesForDetect);
    for (let line of lines) {
      line = stripBOM(line.trim()); if (!line) continue;
      const parts = splitCSVLine(line, sep).map(s => s.trim());
      if (!firstLineChecked) {
        // Try to parse first column as date string
        const dateTimeMicro = tryParseDate(parts[0]);
        const maybeNum = Number(parts[0]);
        
        if (dateTimeMicro !== null) {
          // First column is a valid date string, treat as time column
          isHeader = false; timeIdx = 0; valueIdx = 1;
          const y = Number(parts[valueIdx]);
          if (isFinite(y)) points.push([dateTimeMicro, y]);
        } else if (!isFinite(maybeNum)) {
          // First column is not a number and not a date, treat as header
          isHeader = true; headerCols = parts;
          const lower = headerCols.map(h => (h||'').toLowerCase());
          const timeCandidates = ['time','timestamp','ts','date','epoch','t','time_us','us','micro','microseconds'];
          const valCandidates = ['value','mem','memory','memory_used','memory_kb','usage','y'];
          const foundTime = lower.reduce((acc, cur, idx) => acc !== null ? acc : (timeCandidates.includes(cur) ? idx : null), null);
          const foundVal = lower.reduce((acc, cur, idx) => acc !== null ? acc : (valCandidates.includes(cur) ? idx : null), null);
          if (foundTime !== null) timeIdx = foundTime;
          if (foundVal !== null) valueIdx = foundVal;
        } else {
          // First column is a number, use it as time and normalize to microseconds
          isHeader = false; timeIdx = 0; valueIdx = 1;
          const x = normalizeTimeToMicroseconds(maybeNum);
          const y = Number(parts[valueIdx]);
          if (isFinite(x) && isFinite(y)) points.push([x, y]);
        }
        firstLineChecked = true;
      } else {
        // Parse subsequent rows, check if time column is a date string
        const dateTimeMicro = tryParseDate(parts[timeIdx]);
        if (dateTimeMicro !== null) {
          const y = Number(parts[valueIdx]);
          if (isFinite(y)) points.push([dateTimeMicro, y]);
        } else {
          const x = normalizeTimeToMicroseconds(Number(parts[timeIdx]));
          const y = Number(parts[valueIdx]);
          if (isFinite(x) && isFinite(y)) points.push([x, y]);
        }
      }
    }
    if (onProgress) onProgress(Math.min(1, offset / file.size));
    await new Promise(r => setTimeout(r, 0));
  }
  if (leftover) {
    const line = stripBOM(leftover.trim());
    if (line) {
      const sep = detectSeparator(sampleLinesForDetect);
      const parts = splitCSVLine(line, sep).map(s => s.trim());
      if (!firstLineChecked) {
        const dateTimeMicro = tryParseDate(parts[0]);
        const maybeNum = Number(parts[0]);
        if (dateTimeMicro !== null) {
          isHeader = false;
          const y = Number(parts[1]);
          if (isFinite(y)) points.push([dateTimeMicro, y]);
        } else if (!isFinite(maybeNum)) {
          isHeader = true; headerCols = parts;
        } else {
          const x = normalizeTimeToMicroseconds(maybeNum);
          const y = Number(parts[1]);
          if (isFinite(x) && isFinite(y)) points.push([x, y]);
        }
      } else {
        const dateTimeMicro = tryParseDate(parts[timeIdx]);
        if (dateTimeMicro !== null) {
          const y = Number(parts[valueIdx]);
          if (isFinite(y)) points.push([dateTimeMicro, y]);
        } else {
          const x = normalizeTimeToMicroseconds(Number(parts[timeIdx]));
          const y = Number(parts[valueIdx]);
          if (isFinite(x) && isFinite(y)) points.push([x, y]);
        }
      }
    }
  }
  return { points, hasHeader: !!isHeader, headerCols, timeIdx, valueIdx };
}

// parse CSV from a text blob (sync-friendly)
export async function parseCSVText(text) {
  text = stripBOM(text);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const sample = lines.slice(0, 6);
  const sep = detectSeparator(sample);
  let firstLineChecked = false, isHeader = false, headerCols = null;
  let timeIdx = 0, valueIdx = 1;
  const points = [];
  for (let raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const parts = splitCSVLine(line, sep).map(s => s.trim());
    if (!firstLineChecked) {
      // Try to parse first column as date string
      const dateTimeMicro = tryParseDate(parts[0]);
      const maybeNum = Number(parts[0]);
      
      if (dateTimeMicro !== null) {
        // First column is a valid date string, treat as time column
        isHeader = false; timeIdx = 0; valueIdx = 1;
        const y = Number(parts[valueIdx]);
        if (isFinite(y)) points.push([dateTimeMicro, y]);
      } else if (!isFinite(maybeNum)) {
        // First column is not a number and not a date, treat as header
        isHeader = true; headerCols = parts;
        const lower = headerCols.map(h => (h||'').toLowerCase());
        const timeCandidates = ['time','timestamp','ts','date','epoch','t','time_us','us','micro','microseconds'];
        const valCandidates = ['value','mem','memory','memory_used','memory_kb','usage','y'];
        const foundTime = lower.reduce((acc, cur, idx) => acc !== null ? acc : (timeCandidates.includes(cur) ? idx : null), null);
        const foundVal = lower.reduce((acc, cur, idx) => acc !== null ? acc : (valCandidates.includes(cur) ? idx : null), null);
        if (foundTime !== null) timeIdx = foundTime;
        if (foundVal !== null) valueIdx = foundVal;
      } else {
        // First column is a number, use it as time and normalize to microseconds
        isHeader = false; timeIdx = 0; valueIdx = 1;
        const x = normalizeTimeToMicroseconds(maybeNum);
        const y = Number(parts[valueIdx]);
        if (isFinite(x) && isFinite(y)) points.push([x, y]);
      }
      firstLineChecked = true;
    } else {
      // Parse subsequent rows, check if time column is a date string
      const dateTimeMicro = tryParseDate(parts[timeIdx]);
      if (dateTimeMicro !== null) {
        const y = Number(parts[valueIdx]);
        if (isFinite(y)) points.push([dateTimeMicro, y]);
      } else {
        const x = normalizeTimeToMicroseconds(Number(parts[timeIdx]));
        const y = Number(parts[valueIdx]);
        if (isFinite(x) && isFinite(y)) points.push([x, y]);
      }
    }
  }
  return { points, hasHeader: !!isHeader, headerCols, timeIdx, valueIdx };
}
