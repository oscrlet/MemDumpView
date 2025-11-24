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
 * Normalize time value to microseconds.
 * - If string and valid date: parse as date and convert to microseconds
 * - If numeric and abs < 1e13: treat as milliseconds, multiply by 1000
 * - Otherwise: treat as microseconds
 */
function normalizeTimeToMicroseconds(val) {
  // Try parsing as date string first
  if (typeof val === 'string') {
    const trimmed = val.trim();
    // Check if it looks like an ISO timestamp or date string
    if (trimmed && /[TZ:-]/.test(trimmed)) {
      const ms = Date.parse(trimmed);
      if (isFinite(ms)) {
        return Math.round(ms * 1000); // convert ms to microseconds
      }
    }
    // If not a date, try parsing as number
    const num = Number(trimmed);
    if (isFinite(num)) {
      val = num;
    } else {
      return NaN;
    }
  }
  
  // Handle numeric values
  if (typeof val === 'number' && isFinite(val)) {
    const abs = Math.abs(val);
    // If value is small (< 1e13), treat as milliseconds
    if (abs < 1e13) {
      return Math.round(val * 1000); // ms to microseconds
    }
    // Otherwise treat as microseconds already
    return Math.round(val);
  }
  
  return NaN;
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
        // Try to parse first column - could be number or date string
        const timeVal = normalizeTimeToMicroseconds(parts[0]);
        if (!isFinite(timeVal)) {
          // First column is not a valid time value, treat as header
          isHeader = true; headerCols = parts;
          const lower = headerCols.map(h => (h||'').toLowerCase());
          const timeCandidates = ['time','timestamp','ts','date','epoch','t','time_us','us','micro','microseconds'];
          const valCandidates = ['value','mem','memory','memory_used','memory_kb','usage','y'];
          const foundTime = lower.reduce((acc, cur, idx) => acc !== null ? acc : (timeCandidates.includes(cur) ? idx : null), null);
          const foundVal = lower.reduce((acc, cur, idx) => acc !== null ? acc : (valCandidates.includes(cur) ? idx : null), null);
          if (foundTime !== null) timeIdx = foundTime;
          if (foundVal !== null) valueIdx = foundVal;
        } else {
          // First column is valid time, not a header
          isHeader = false; timeIdx = 0; valueIdx = 1;
          const x = normalizeTimeToMicroseconds(parts[timeIdx]);
          const y = Number(parts[valueIdx]); 
          if (isFinite(x) && isFinite(y)) points.push([x, y]);
        }
        firstLineChecked = true;
      } else {
        const x = normalizeTimeToMicroseconds(parts[timeIdx]);
        const y = Number(parts[valueIdx]); 
        if (isFinite(x) && isFinite(y)) points.push([x, y]);
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
        const timeVal = normalizeTimeToMicroseconds(parts[0]);
        if (!isFinite(timeVal)) { 
          isHeader = true; headerCols = parts; 
        } else { 
          const x = normalizeTimeToMicroseconds(parts[0]);
          const y = Number(parts[1]); 
          if (isFinite(x) && isFinite(y)) points.push([x, y]); 
        }
      } else {
        const x = normalizeTimeToMicroseconds(parts[timeIdx]);
        const y = Number(parts[valueIdx]); 
        if (isFinite(x) && isFinite(y)) points.push([x, y]);
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
      const timeVal = normalizeTimeToMicroseconds(parts[0]);
      if (!isFinite(timeVal)) {
        isHeader = true; headerCols = parts;
        const lower = headerCols.map(h => (h||'').toLowerCase());
        const timeCandidates = ['time','timestamp','ts','date','epoch','t','time_us','us','micro','microseconds'];
        const valCandidates = ['value','mem','memory','memory_used','memory_kb','usage','y'];
        const foundTime = lower.reduce((acc, cur, idx) => acc !== null ? acc : (timeCandidates.includes(cur) ? idx : null), null);
        const foundVal = lower.reduce((acc, cur, idx) => acc !== null ? acc : (valCandidates.includes(cur) ? idx : null), null);
        if (foundTime !== null) timeIdx = foundTime;
        if (foundVal !== null) valueIdx = foundVal;
      } else {
        isHeader = false; timeIdx = 0; valueIdx = 1;
        const x = normalizeTimeToMicroseconds(parts[timeIdx]);
        const y = Number(parts[valueIdx]); 
        if (isFinite(x) && isFinite(y)) points.push([x, y]);
      }
      firstLineChecked = true;
    } else {
      const x = normalizeTimeToMicroseconds(parts[timeIdx]);
      const y = Number(parts[valueIdx]); 
      if (isFinite(x) && isFinite(y)) points.push([x, y]);
    }
  }
  return { points, hasHeader: !!isHeader, headerCols, timeIdx, valueIdx };
}
