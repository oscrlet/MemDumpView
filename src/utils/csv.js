/**
 * Streaming CSV parser with progress reporting
 */

export async function parseCSVStream(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const chunkSize = 1024 * 1024; // 1MB chunks
    let offset = 0;
    let buffer = '';
    const rows = [];
    let headers = null;

    const readChunk = () => {
      if (offset >= file.size) {
        // Process final buffer
        if (buffer.trim()) {
          const lines = buffer.split('\n').filter(line => line.trim());
          for (const line of lines) {
            if (!headers) {
              headers = line.split(',').map(h => h.trim());
            } else {
              const values = line.split(',');
              if (values.length === headers.length) {
                const row = {};
                headers.forEach((header, i) => {
                  row[header] = values[i].trim();
                });
                rows.push(row);
              }
            }
          }
        }
        resolve({ headers, rows });
        return;
      }

      const blob = file.slice(offset, offset + chunkSize);
      reader.readAsText(blob);
    };

    reader.onload = (e) => {
      buffer += e.target.result;
      const lines = buffer.split('\n');
      
      // Keep the last incomplete line in buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        
        if (!headers) {
          headers = line.split(',').map(h => h.trim());
        } else {
          const values = line.split(',');
          if (values.length === headers.length) {
            const row = {};
            headers.forEach((header, i) => {
              row[header] = values[i].trim();
            });
            rows.push(row);
          }
        }
      }

      offset += chunkSize;
      
      if (onProgress) {
        const progress = Math.min(offset / file.size, 1);
        onProgress(progress);
      }

      readChunk();
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    readChunk();
  });
}

export function parseCSVSync(text) {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, j) => {
        row[header] = values[j].trim();
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}
