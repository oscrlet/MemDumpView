import type { MemorySeries } from '../types';
import { toRaw } from 'vue';
import { useMainStore } from '../store/main';

/**
 * Triggers file selection dialog and reads the selected JSON file.
 * @returns {Promise<MemorySeries[]>} Array of parsed memory series data.
 */
import ImportWorker from '../workers/import.worker?worker'; // Vite worker import
import ExportWorker from '../workers/export.worker?worker'; // Vite worker import

/**
 * Uses Web Worker to process file parsing.
 * @param {File} file - File object to be parsed.
 * @param {Function} onProgress - Progress callback.
 * @returns {Promise<MemorySeries[]>} Array of parsed memory series data.
 */
export function processFile(file: File, onProgress?: (p: number) => void): Promise<MemorySeries[]> {
  return new Promise((resolve, reject) => {
    // Optimize: Use Web Worker for parsing
    const worker = new ImportWorker();

    worker.onmessage = (e) => {
      const { type, data, error, progress } = e.data;
      if (type === 'progress') {
        if (onProgress) onProgress(progress);
        return;
      }
      if (type === 'success') {
        resolve(data as MemorySeries[]);
        worker.terminate();
      } else if (type === 'error') {
        reject(new Error(error || 'Unknown worker error'));
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      reject(new Error(`Worker error: ${err.message}`));
      worker.terminate();
    };

    // Send file to worker
    worker.postMessage(file);
  });
}

/**
 * Uses Web Worker to process file exports in a streaming manner.
 */
/**
 * Uses Web Worker to process file exports in a stateful, non-blocking batched manner.
 */
function processExport(
  seriesData: MemorySeries[],
  exportType: 'binary' | 'json',
  options: {
    fileHandle?: any,
    onChunk?: (chunk: BlobPart) => Promise<void>,
    onProgress?: (progress: number) => void
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const worker = new ExportWorker();

    // Helper to yield thread
    const yieldThread = () => new Promise(r => setTimeout(r, 0));

    worker.onmessage = async (e: MessageEvent) => {
      const { type, data, error, progress } = e.data;
      if (type === 'progress') {
        if (options.onProgress) options.onProgress(progress);
        return;
      }
      if (type === 'chunk') {
        try {
          if (options.onChunk) await options.onChunk(data);
        } catch (err) {
          worker.terminate();
          reject(err);
        }
      } else if (type === 'success') {
        worker.terminate();
        resolve();
      } else {
        worker.terminate();
        reject(new Error(error || 'Unknown export worker error'));
      }
    };

    worker.onerror = (err: ErrorEvent) => {
      reject(new Error(`Export worker error: ${err.message}`));
      worker.terminate();
    };

    // Protocol Start
    (async () => {
      try {

        // 1. INIT: Send metadata (Fast, minimal clone)
        const seriesMetadata = seriesData.map(s => {
          const rawS = toRaw(s);
          return {
            id: rawS.id,
            name: rawS.name,
            visible: rawS.visible,
            color: rawS.color
          };
        });

        worker.postMessage({
          type: 'INIT',
          data: { seriesMetadata, exportType, fileHandle: options.fileHandle }
        });
        await yieldThread();

        // 2. BATCH: Send points in micro-batches
        const BATCH_SIZE = 20; // Micro-batch size to keep each cycle < 16ms
        for (let i = 0; i < seriesData.length; i++) {
          const s = seriesData[i];
          if (!s) continue;

          const rawData = toRaw(toRaw(s).data) || [];

          for (let start = 0; start < rawData.length; start += BATCH_SIZE) {
            const rawBatch = rawData.slice(start, start + BATCH_SIZE);

            // Deep purify only the tiny batch. This eliminates the massive sync freeze.
            // JSON stringify/parse is very fast for these micro-arrays.
            const pureBatch = JSON.parse(JSON.stringify(rawBatch));

            worker.postMessage({
              type: 'BATCH',
              data: { seriesIndex: i, points: pureBatch }
            });

            // Always yield to UI thread after a micro-batch
            await yieldThread();

            // Adaptive delay if system is under heavy load
          }
        }

        // 3. PROCESS: Trigger worker logic
        worker.postMessage({ type: 'PROCESS' });
      } catch (err) {
        worker.terminate();
        reject(err);
      }
    })();
  });
}

/**
 * Trigger file selection dialog and read selected JSON file (using Web Worker).
 * @returns {Promise<MemorySeries[]>} Array of parsed memory series data.
 */
export function importSeriesFromFile(): Promise<MemorySeries[]> {
  return new Promise((resolve, reject) => {
    // 1. Create a hidden <input type="file"> element
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json,.mb'; // Only accept json/mb files
    fileInput.style.display = 'none';

    // 2. Listen for file selection event
    fileInput.onchange = async (event) => {
      const target = event.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        const file = target.files[0];
        if (!file) {
          reject(new Error('File selection failed.'));
          return;
        }

        const store = useMainStore();
        store.setOperationStatus({ active: true, type: 'import', progress: 0, filename: file.name });

        try {
          const data = await processFile(file, (p) => store.setOperationStatus({ progress: p }));
          resolve(data);
        } catch (error) {
          reject(error);
        } finally {
          store.setOperationStatus({ active: false });
          if (fileInput.parentNode) {
            document.body.removeChild(fileInput);
          }
        }
      } else {
        // User cancelled file selection
        reject(new Error('No file selected.'));
        if (fileInput.parentNode) {
          document.body.removeChild(fileInput);
        }
      }
    };

    // 6. Add input element to DOM, trigger click, and wait for event handling
    document.body.appendChild(fileInput);
    fileInput.click();
  });
}


function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.style.display = 'none';
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Unified export interface using a hybrid approach:
 * 1. Targeted path selection via showSaveFilePicker.
 * 2. Visual progress tracking in the app.
 */
export async function exportSeries(seriesData: MemorySeries[], baseFilename: string): Promise<void> {
  const store = useMainStore();
  let asBinary: boolean | null = null;
  let fullFilename = '';
  let handle: any = null;

  // 1. Try to use Native File Picker (Consolidated name & format selection)
  if ('showSaveFilePicker' in window) {
    try {
      handle = await (window as any).showSaveFilePicker({
        suggestedName: baseFilename,
        types: [
          {
            description: 'Memory Dump Binary (.mb)',
            accept: { 'application/octet-stream': ['.mb'] },
          },
          {
            description: 'JSON Format (.json)',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });
      fullFilename = handle.name;
      asBinary = fullFilename.endsWith('.mb');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.warn('Native picker failed or cancelled:', err);
    }
  }

  // 2. Fallback to custom dialog if native picker is unavailable or failed
  if (!handle) {
    const fallback = await showFormatSelectionDialog(baseFilename);
    if (fallback.asBinary === null) return; // User cancelled

    asBinary = fallback.asBinary;
    fullFilename = `${fallback.filename}${asBinary ? '.mb' : '.json'}`;
  }

  // 3. Trigger export with progress tracking
  store.setOperationStatus({ active: true, type: 'export', progress: 0, filename: fullFilename });

  try {
    if (handle) {
      await processExport(seriesData, asBinary ? 'binary' : 'json', {
        fileHandle: handle,
        onProgress: (p) => store.setOperationStatus({ progress: p })
      });
    } else {
      const chunks: BlobPart[] = [];
      await processExport(seriesData, asBinary ? 'binary' : 'json', {
        onChunk: async (c) => { chunks.push(c); },
        onProgress: (p) => store.setOperationStatus({ progress: p })
      });
      const blob = new Blob(chunks, { type: asBinary ? 'application/octet-stream' : 'application/json' });
      triggerDownload(blob, fullFilename);
    }
  } catch (err) {
    console.error('Export failed:', err);
    alert(`Export failed: ${err}`);
  } finally {
    store.setOperationStatus({ active: false });
  }
}

/**
 * Internal helper to show a beautiful format selection dialog (Fallback).
 */
function showFormatSelectionDialog(defaultFilename: string): Promise<{ asBinary: boolean | null, filename: string }> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'export-dialog-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.4); display: flex; align-items: center;
      justify-content: center; z-index: 10000; backdrop-filter: blur(4px);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white; padding: 24px; border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 360px;
      display: flex; flex-direction: column; gap: 16px;
    `;

    modal.innerHTML = `
      <h3 style="margin: 0; font-size: 18px; color: #1a1a1b;">Export Memory Dump Data</h3>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label style="font-size: 12px; color: #5f6368; font-weight: 600;">Filename (without extension)</label>
        <input id="export-filename-input" type="text" value="${defaultFilename}" style="
          padding: 8px 12px; border: 1px solid #dadce0; border-radius: 6px;
          font-size: 14px; outline: none; transition: border-color 0.2s;
        " onfocus="this.style.borderColor='#1a73e8'" onblur="this.style.borderColor='#dadce0'">
      </div>
      <p style="margin: 0; font-size: 14px; color: #5f6368;">Choose the preferred format for your export.</p>
      <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 4px;">
        <button id="export-json-btn" style="
          padding: 12px; border: 1px solid #dadce0; border-radius: 8px;
          background: white; cursor: pointer; text-align: left; transition: all 0.2s;
        ">
          <div style="font-weight: 600; color: #1a73e8;">JSON Format (.json)</div>
          <div style="font-size: 12px; color: #70757a;">Human readable, standard compatibility.</div>
        </button>
        <button id="export-binary-btn" style="
          padding: 12px; border: 1px solid #dadce0; border-radius: 8px;
          background: white; cursor: pointer; text-align: left; transition: all 0.2s;
        ">
          <div style="font-weight: 600; color: #188038;">Binary Format (.mb)</div>
          <div style="font-size: 12px; color: #70757a;">Optimized size, fast loading (Version 2).</div>
        </button>
      </div>
      <button id="export-cancel-btn" style="
        margin-top: 8px; padding: 8px; border: none; background: none;
        color: #70757a; cursor: pointer; font-size: 14px;
      ">Cancel</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const input = modal.querySelector('#export-filename-input') as HTMLInputElement;
    input.select();

    const cleanup = (val: boolean | null) => {
      const filename = input.value.trim() || defaultFilename;
      document.body.removeChild(overlay);
      resolve({ asBinary: val, filename });
    };

    overlay.querySelector('#export-json-btn')?.addEventListener('click', () => cleanup(false));
    overlay.querySelector('#export-binary-btn')?.addEventListener('click', () => cleanup(true));
    overlay.querySelector('#export-cancel-btn')?.addEventListener('click', () => cleanup(null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(null); });
  });
}

/**
 * Exports given memory series data to a JSON file.
 */
export async function exportSeriesToFile(seriesData: MemorySeries[], filename: string, asBinary: boolean): Promise<void> {
  try {
    const exportType = asBinary ? 'binary' : 'json';
    const chunks: BlobPart[] = [];

    // Legacy mode: stream chunks back to main thread and build a Blob
    await processExport(seriesData, exportType, {
      onChunk: async (chunk) => {
        chunks.push(chunk);
      }
    });

    const blob = new Blob(chunks, { type: asBinary ? 'application/octet-stream' : 'application/json' });
    triggerDownload(blob, filename);
  } catch (error) {
    console.error("Failed to export data to file:", error);
    alert(`Failed to export file: ${error}`);
  }
}
