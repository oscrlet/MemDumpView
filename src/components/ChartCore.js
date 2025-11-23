import { parseCSVStream } from "../utils/csv.js";
import { parseJSONFile } from "../utils/json.js";
import { largestTriangleThreeBuckets, binarySearchLeft, binarySearchRight } from "../utils/lttb.js";

// ChartCore: data + sampling + view + pinned management, no DOM
export class ChartCore {
  constructor() {
    // state
    this.seriesList = [];
    this.viewMinX = NaN;
    this.viewMaxX = NaN;
    this.pinnedPoints = [];
    this.originalViewSet = false;
    this.originalViewMin = null;
    this.originalViewMax = null;

    // sampling target
    this.sampleTarget = 1000;

    // events
    this.events = new Map();
  }

  on(evt, handler) {
    if (!this.events.has(evt)) this.events.set(evt, []);
    this.events.get(evt).push(handler);
  }
  _emit(evt, payload) {
    const handlers = this.events.get(evt) || [];
    for (const h of handlers) h(payload);
  }

  // Public API: set sample target
  setSampleTarget(n) {
    const v = Math.max(3, Math.round(Number(n) || 0));
    this.sampleTarget = v;
    this._emit('status', `采样目标设置为 ${v}`);
    this.resampleInView();
  }

  // ---------- file loading ----------
  async loadFile(file) {
    this._emit('status', `解析 ${file.name}...`);
    
    // Detect file type (JSON vs CSV)
    const isJSON = file.type === 'application/json' || file.name.endsWith('.json');
    
    try {
      if (isJSON) {
        // Parse JSON file
        const result = await parseJSONFile(file);
        
        if (!result.series || result.series.length === 0) {
          this._emit('status', `文件 ${file.name} 无数据`);
          return;
        }
        
        // Process each series from JSON
        const newSeriesIds = [];
        for (const parsedSeries of result.series) {
          const meta = {
            id: parsedSeries.id,
            name: parsedSeries.name,
            raw: parsedSeries.raw,
            rel: [],
            sampled: [],
            color: '',
            visible: true,
            firstX: parsedSeries.firstX,
            meta: parsedSeries.meta
          };
          
          // Build rel mapping (relative time)
          meta.rel = meta.raw.map(p => {
            if (Array.isArray(p)) {
              return [p[0] - meta.firstX, p[1]];
            } else {
              // Object format, preserve it with relative x
              return { ...p, x: p.x - meta.firstX };
            }
          });
          
          this.seriesList.push(meta);
          newSeriesIds.push(meta.id);
        }
        
        this._applyColors();
        
        // Sync embedded pins only from newly added series
        for (const series of this.seriesList) {
          if (newSeriesIds.includes(series.id) && series.raw && series.raw.length > 0) {
            this.syncPinnedFromSeries(series);
          }
        }
        
        const ext = this.computeGlobalExtents();
        if (!this.originalViewSet) {
          this.originalViewMin = 0;
          this.originalViewMax = ext.max;
          this.originalViewSet = true;
        }
        this.viewMinX = 0;
        this.viewMaxX = ext.max;
        this.resampleInView();
        this._emit('status', `解析完成：${file.name}`);
        this._emit('seriesChanged', this.seriesList);
      } else {
        // Parse CSV file (original logic)
        const id = crypto.randomUUID?.() || `s${Date.now()}`;
        const meta = { id, name: file.name || 'file', raw: [], rel: [], sampled: [], color: '', visible: true, firstX: null, headerCols: null };
        this.seriesList.push(meta);
        this._emit('seriesChanged', this.seriesList);
        
        const result = await parseCSVStream(file, p => this._emit('status', `解析 ${file.name}: ${Math.round(p*100)}%`));
        meta.headerCols = result.headerCols;
        meta.raw = result.points.slice();
        meta.raw.sort((a,b)=>a[0]-b[0]);
        if (!meta.raw.length) {
          this.seriesList = this.seriesList.filter(s => s !== meta);
          this._emit('seriesChanged', this.seriesList);
          this._emit('status', `文件 ${file.name} 无数据`);
          return;
        }
        meta.firstX = meta.raw[0][0];
        meta.rel = meta.raw.map(p => [p[0] - meta.firstX, p[1]]);
        this._applyColors();
        const ext = this.computeGlobalExtents();
        if (!this.originalViewSet) {
          this.originalViewMin = 0;
          this.originalViewMax = ext.max;
          this.originalViewSet = true;
        }
        this.viewMinX = 0; this.viewMaxX = ext.max;
        this.resampleInView();
        this._emit('status', `解析完成：${file.name}`);
        this._emit('seriesChanged', this.seriesList);
      }
    } catch (err) {
      console.error(err);
      this._emit('status', `解析失败：${err && err.message ? err.message : err}`);
    }
  }

  _applyColors() {
    const colors = [];
    const n = this.seriesList.length;
    for (let i=0;i<n;i++){ const hue = Math.round((360 / Math.max(1, n)) * i); colors.push(`hsl(${hue} 70% 45%)`); }
    this.seriesList.forEach((s,i)=> s.color = s.color || colors[i%colors.length]);
  }

  computeGlobalExtents() {
    let min = Infinity, max = -Infinity;
    for (const s of this.seriesList) {
      if (!s.rel || s.rel.length === 0) continue;
      min = Math.min(min, s.rel[0][0]);
      max = Math.max(max, s.rel[s.rel.length - 1][0]);
    }
    if (!isFinite(min)) { min = 0; max = 1; }
    min = Math.max(0, min);
    return {min, max};
  }

  // Resample for current view; doesn't render (UI should listen to 'resampled')
  resampleInView() {
    if (this.seriesList.length === 0) { this._emit('resampled'); return; }
    const marginBase = {left: 70, right: 18, top: 18, bottom: 48}; // logical px (UI will scale by dpr)
    // Use sampleTarget set on core
    const globalTarget = Math.max(10, Math.round(this.sampleTarget || 1000));

    const ext = this.computeGlobalExtents();
    if (!isFinite(this.viewMinX)) this.viewMinX = 0;
    if (!isFinite(this.viewMaxX)) this.viewMaxX = ext.max;
    this.viewMinX = Math.max(0, this.viewMinX);
    this.viewMaxX = Math.max(this.viewMinX + 1, this.viewMaxX);

    for (const s of this.seriesList) {
      if (!s.rel || s.rel.length === 0) { s.sampled = []; continue; }
      if (!s.visible) { s.sampled = []; continue; }
      const arr = s.rel;
      const lo = Math.max(0, binarySearchLeft(arr, this.viewMinX));
      const hi = Math.min(arr.length, binarySearchRight(arr, this.viewMaxX));
      const windowArr = arr.slice(Math.max(0, lo - 1), Math.min(arr.length, hi + 1));
      // for approximate finalTarget we need an approximate pixel-based target, but core doesn't know canvas width.
      // We'll be conservative and use globalTarget here; UI may choose to further downsample if needed.
      if (windowArr.length <= globalTarget) s.sampled = windowArr;
      else s.sampled = largestTriangleThreeBuckets(windowArr, globalTarget);
    }

    this._emit('resampled', null);
  }

  // pinned API
  addPinned(seriesId, relMicro, val, color, seriesName) {
    const exists = this.pinnedPoints.find(p => p.seriesId === seriesId && p.relMicro === relMicro && p.val === val);
    if (exists) return exists;
    // add hidden:false so individual pins can be hidden independently of series visibility
    const entry = { seriesId, seriesName, relMicro, val, color, selected:false, hidden:false };
    this.pinnedPoints.push(entry);
    this._emit('pinnedChanged', this.pinnedPoints);
    this._emit('status', `标记点已添加：${seriesName} ${(relMicro/1e6).toFixed(3)}s`);
    this._emit('resampled', null); // keep UI in sync if needed
    return entry;
  }
  removePinned(entry) {
    const idx = this.pinnedPoints.indexOf(entry);
    if (idx >= 0) this.pinnedPoints.splice(idx,1);
    this._emit('pinnedChanged', this.pinnedPoints);
    this._emit('status', '标记点已删除');
  }
  clearPinned() {
    this.pinnedPoints = [];
    this._emit('pinnedChanged', this.pinnedPoints);
  }
  exportPinnedCSV() {
    if (!this.pinnedPoints.length) return null;
    let out = 'series,rel_us,value\n';
    for (const p of this.pinnedPoints) out += `${JSON.stringify(p.seriesName)},${p.relMicro},${p.val}\n`;
    const blob = new Blob([out], {type: 'text/csv;charset=utf-8;'});
    return blob;
  }

  // Sync pinned points from series raw data (for embedded pins with labels)
  syncPinnedFromSeries(series) {
    if (!series || !series.raw || !Array.isArray(series.raw)) {
      return;
    }
    
    // Scan raw points for object points with non-empty label
    for (const point of series.raw) {
      // Only process object-format points
      if (typeof point === 'object' && point !== null && !Array.isArray(point)) {
        const label = point.label;
        // Check if point has a non-empty label
        if (label !== undefined && label !== null && String(label).trim() !== '') {
          const absX = point.x;
          const y = point.y;
          const relMicro = absX - series.firstX;
          
          // Check if this pin already exists (avoid duplicates) - use some() for efficiency
          const exists = this.pinnedPoints.some(p => 
            p.seriesId === series.id && 
            p.relMicro === relMicro && 
            p.val === y
          );
          
          if (!exists) {
            // Add pinned point with label as series name
            const pinColor = point.color || series.color || '#333';
            const entry = {
              seriesId: series.id,
              seriesName: String(label),
              relMicro,
              val: y,
              color: pinColor,
              selected: false,
              hidden: false,
              source: 'embedded' // Mark as embedded pin
            };
            this.pinnedPoints.push(entry);
          }
        }
      }
    }
    
    // Emit pinnedChanged if any pins were added
    this._emit('pinnedChanged', this.pinnedPoints);
  }

  // Utility: provide basic plot metrics without text-measure (UI may refine)
  // canvasWidth/Height are device pixels (already scaled by dpr)
  getBasePlotMetrics(canvasWidth, canvasHeight, dpr) {
    const W = canvasWidth, H = canvasHeight;
    const marginBase = {left: 70 * dpr, right: 18 * dpr, top: 18 * dpr, bottom: 48 * dpr};
    const plotH = H - marginBase.top - marginBase.bottom;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of this.seriesList) {
      if (!s.visible) continue;
      const arr = (s.sampled && s.sampled.length>0) ? s.sampled : s.rel;
      if (!arr || arr.length === 0) continue;
      minX = Math.min(minX, arr[0][0]); maxX = Math.max(maxX, arr[arr.length-1][0]);
      for (const p of arr) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    }
    if (!isFinite(minX)) { minX = 0; maxX = 1; minY = 0; maxY = 1; }
    minX = Math.max(0, minX);
    minY = Math.max(0, minY);
    const globalExt = this.computeGlobalExtents();
    if (isFinite(this.viewMinX) && isFinite(this.viewMaxX) && this.viewMaxX > this.viewMinX) {
      minX = this.viewMinX; maxX = this.viewMaxX;
    }
    const yPadTop = (maxY - minY) * 0.06 || 1;
    maxY = maxY + yPadTop; minY = 0;
    // return margins as base; UI may compute left margin considering text widths
    return { W, H, marginBase, plotW: W - marginBase.left - marginBase.right, plotH, minX, maxX, minY, maxY, minXSec: minX / 1e6, maxXSec: maxX / 1e6 };
  }
}
