import { parseCSVStream } from "../utils/csv.js";
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
    const id = crypto.randomUUID?.() || `s${Date.now()}`;
    const meta = { id, name: file.name || 'file', raw: [], rel: [], sampled: [], color: '', visible: true, firstX: null, headerCols: null };
    this.seriesList.push(meta);
    this._emit('seriesChanged', this.seriesList);
    try {
      const result = await parseCSVStream(file, p => this._emit('status', `解析 ${file.name}: ${Math.round(p*100)}%`));
      meta.headerCols = result.headerCols;
      meta.raw = result.points.slice();
      // Support both array [x,y] and object {x,y,label,meta} points
      meta.raw.sort((a,b)=>{
        const ax = Array.isArray(a) ? a[0] : a.x;
        const bx = Array.isArray(b) ? b[0] : b.x;
        return ax - bx;
      });
      if (!meta.raw.length) {
        this.seriesList = this.seriesList.filter(s => s !== meta);
        this._emit('seriesChanged', this.seriesList);
        this._emit('status', `文件 ${file.name} 无数据`);
        return;
      }
      const firstPoint = meta.raw[0];
      meta.firstX = Array.isArray(firstPoint) ? firstPoint[0] : firstPoint.x;
      meta.rel = meta.raw.map(p => {
        if (Array.isArray(p)) return [p[0] - meta.firstX, p[1]];
        return [p.x - meta.firstX, p.y];
      });
      this._applyColors();
      const ext = this.computeGlobalExtents();
      if (!this.originalViewSet) {
        this.originalViewMin = 0;
        this.originalViewMax = ext.max;
        this.originalViewSet = true;
      }
      this.viewMinX = 0; this.viewMaxX = ext.max;
      this.resampleInView();
      // Sync pinned points from series with embedded labels (if any)
      this.syncPinnedFromSeries(meta);
      this._emit('status', `解析完成：${file.name}`);
      this._emit('seriesChanged', this.seriesList);
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

  // Sync pinned points from series point objects with labels
  // NOTE: This method is designed for future JSON import where series.raw may contain
  // point objects like {x, y, label, meta}. CSV-imported data uses [x,y] arrays and
  // will be safely skipped by the typeof/Array.isArray check. This is intentional.
  syncPinnedFromSeries(series) {
    const seriesToSync = series ? [series] : this.seriesList;
    
    // Collect source-driven pins from all series
    const sourcePins = [];
    for (const s of seriesToSync) {
      if (!s.raw || s.raw.length === 0) continue;
      
      for (let i = 0; i < s.raw.length; i++) {
        const point = s.raw[i];
        // Check if point is an object with a non-empty label (skips arrays from CSV)
        if (typeof point === 'object' && !Array.isArray(point) && point.label && String(point.label).trim()) {
          const x = point.x;
          const y = point.y;
          if (!isFinite(x) || !isFinite(y)) continue;
          
          const relMicro = x - (s.firstX || 0);
          
          // Create or update pin entry
          sourcePins.push({
            seriesId: s.id,
            seriesName: s.name,
            relMicro,
            val: y,
            color: s.color || '#333',
            selected: false,
            label: String(point.label).trim(),
            sourcePoint: point,
            meta: point.meta || null
          });
        }
      }
    }
    
    // Preserve user-added pins (those without sourcePoint reference)
    const userPins = this.pinnedPoints.filter(p => !p.sourcePoint);
    
    // Merge: keep user pins and add/update source pins
    const mergedPins = [...userPins];
    
    for (const srcPin of sourcePins) {
      // Check if this source pin already exists in pinnedPoints
      const existingIdx = mergedPins.findIndex(p => 
        p.seriesId === srcPin.seriesId && 
        Math.abs(p.relMicro - srcPin.relMicro) < 0.001 && 
        Math.abs(p.val - srcPin.val) < 0.001
      );
      
      if (existingIdx >= 0) {
        // Update existing pin with source reference and label
        mergedPins[existingIdx] = {
          ...mergedPins[existingIdx],
          label: srcPin.label,
          sourcePoint: srcPin.sourcePoint,
          meta: srcPin.meta
        };
      } else {
        // Add new source pin
        mergedPins.push(srcPin);
      }
    }
    
    this.pinnedPoints = mergedPins;
    this._emit('pinnedChanged', this.pinnedPoints);
  }

  // pinned API
  addPinned(seriesId, relMicro, val, color, seriesName) {
    const exists = this.pinnedPoints.find(p => p.seriesId === seriesId && p.relMicro === relMicro && p.val === val);
    if (exists) return exists;
    
    // Try to find a matching source point object in the series
    const series = this.seriesList.find(s => s.id === seriesId);
    let sourcePoint = null;
    if (series && series.raw) {
      for (const point of series.raw) {
        if (typeof point === 'object' && !Array.isArray(point)) {
          const x = point.x;
          const y = point.y;
          const pointRelMicro = x - (series.firstX || 0);
          if (Math.abs(pointRelMicro - relMicro) < 0.001 && Math.abs(y - val) < 0.001) {
            sourcePoint = point;
            break;
          }
        }
      }
    }
    
    const entry = { 
      seriesId, 
      seriesName, 
      relMicro, 
      val, 
      color, 
      selected: false,
      label: sourcePoint && sourcePoint.label ? String(sourcePoint.label).trim() : '',
      sourcePoint: sourcePoint || null,
      meta: sourcePoint && sourcePoint.meta ? sourcePoint.meta : null
    };
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
    let out = 'series,rel_us,value,label,meta\n';
    for (const p of this.pinnedPoints) {
      const label = p.label || '';
      const meta = p.meta ? JSON.stringify(p.meta) : '';
      out += `${JSON.stringify(p.seriesName)},${p.relMicro},${p.val},${JSON.stringify(label)},${JSON.stringify(meta)}\n`;
    }
    const blob = new Blob([out], {type: 'text/csv;charset=utf-8;'});
    return blob;
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
