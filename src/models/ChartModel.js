import { parseCSVStream } from "../utils/csv.js";
import { parseJSONFile } from "../utils/json.js";
import { largestTriangleThreeBuckets, binarySearchLeft, binarySearchRight } from "../utils/lttb.js";
import { createObservable } from "../lib/observable.js";

// ChartModel: data + sampling + view + pinned management, no DOM
// Uses observable state pattern for MVVM architecture
export class ChartModel {
  constructor() {
    // Observable state - ViewModels and Views can subscribe to this
    this.state = createObservable({
      seriesList: [],
      viewMinX: NaN,
      viewMaxX: NaN,
      pinnedPoints: [],
      originalViewSet: false,
      originalViewMin: null,
      originalViewMax: null,
      sampleTarget: 1000,
      status: '就绪',
      loading: false
    });

    // Legacy event system (kept for backward compatibility during transition)
    this.events = new Map();
  }

  // Legacy event API (kept for backward compatibility)
  on(evt, handler) {
    if (!this.events.has(evt)) this.events.set(evt, []);
    this.events.get(evt).push(handler);
  }
  _emit(evt, payload) {
    const handlers = this.events.get(evt) || [];
    for (const h of handlers) h(payload);
  }

  // Convenience getters for state access
  get seriesList() { return this.state.get().seriesList; }
  set seriesList(v) { this.state.set({ seriesList: v }); this._emit('seriesChanged', v); }
  
  get viewMinX() { return this.state.get().viewMinX; }
  set viewMinX(v) { this.state.set({ viewMinX: v }); }
  
  get viewMaxX() { return this.state.get().viewMaxX; }
  set viewMaxX(v) { this.state.set({ viewMaxX: v }); }
  
  get pinnedPoints() { return this.state.get().pinnedPoints; }
  set pinnedPoints(v) { this.state.set({ pinnedPoints: v }); this._emit('pinnedChanged', v); }
  
  get originalViewSet() { return this.state.get().originalViewSet; }
  set originalViewSet(v) { this.state.set({ originalViewSet: v }); }
  
  get originalViewMin() { return this.state.get().originalViewMin; }
  set originalViewMin(v) { this.state.set({ originalViewMin: v }); }
  
  get originalViewMax() { return this.state.get().originalViewMax; }
  set originalViewMax(v) { this.state.set({ originalViewMax: v }); }
  
  get sampleTarget() { return this.state.get().sampleTarget; }
  set sampleTarget(v) { this.state.set({ sampleTarget: v }); }

  // Public API: set sample target
  setSampleTarget(n) {
    const v = Math.max(3, Math.round(Number(n) || 0));
    this.sampleTarget = v;
    this._emit('status', `采样目标设置为 ${v}`);
    this.resampleInView();
  }

  // ---------- helpers ----------
  _toMicroseconds(rawX) {
    if (rawX == null) return NaN;
    if (typeof rawX === 'string') {
      const ms = Date.parse(rawX);
      return isNaN(ms) ? NaN : Math.round(ms * 1000);
    }
    if (typeof rawX === 'number') {
      const abs = Math.abs(rawX);
      if (abs < 1e13) return Math.round(rawX * 1000);
      return Math.round(rawX);
    }
    return NaN;
  }

  _absXOf(rawPoint) {
    if (Array.isArray(rawPoint)) return Number(rawPoint[0]);
    if (rawPoint && typeof rawPoint === 'object') return this._toMicroseconds(rawPoint.x != null ? rawPoint.x : (rawPoint[0] != null ? rawPoint[0] : undefined));
    return NaN;
  }

  // ---------- file loading ----------
  async loadFile(file) {
    this._emit('status', `解析 ${file.name}...`);
    // placeholder meta in case parse fails early (keeps UI stable)
    const placeholderId = crypto.randomUUID?.() || `s${Date.now()}`;
    const placeholder = { id: placeholderId, name: file.name || 'file', raw: [], rel: [], sampled: [], color: '', visible: true, firstX: null, headerCols: null };
    this.seriesList.push(placeholder);
    this._emit('seriesChanged', this.seriesList);
    try {
      const isJSON = (file.type === 'application/json') || (/\.json$/i.test(file.name || ''));
      if (isJSON) {
        const parsed = await parseJSONFile(file);
        if (!parsed || !Array.isArray(parsed.series) || parsed.series.length === 0) {
          // remove placeholder
          this.seriesList = this.seriesList.filter(s => s !== placeholder);
          this._emit('seriesChanged', this.seriesList);
          this._emit('status', `文件 ${file.name} 无数据`);
          return;
        }
        // remove placeholder and append parsed series entries
        this.seriesList = this.seriesList.filter(s => s !== placeholder);
        for (const s of parsed.series) {
          const sid = s.id || (crypto.randomUUID?.() || `s${Date.now()}`);
          const entry = {
            id: sid,
            name: s.name || sid,
            raw: Array.isArray(s.raw) ? s.raw.slice() : [],
            rel: [],
            sampled: [],
            color: '',
            visible: true,
            firstX: isFinite(Number(s.firstX)) ? Number(s.firstX) : null,
            meta: s.meta || {}
          };
          // Normalize object raw points: ensure object.x is numeric absolute microseconds
          for (let i = 0; i < entry.raw.length; i++) {
            const rp = entry.raw[i];
            if (rp && typeof rp === 'object' && !Array.isArray(rp)) {
              const abs = this._toMicroseconds(rp.x != null ? rp.x : (rp[0] != null ? rp[0] : undefined));
              if (isFinite(abs)) {
                try { rp.x = abs; } catch(e) {}
              } else {
                rp._invalid_time = true;
              }
            }
          }
          entry.raw = entry.raw.filter(rp => !(rp && rp._invalid_time));
          // compute firstX if not provided
          if (!isFinite(Number(entry.firstX))) {
            let fx = null;
            for (const r of entry.raw) {
              const abs = this._absXOf(r);
              if (isFinite(abs)) { fx = abs; break; }
            }
            entry.firstX = fx != null ? fx : 0;
          }
          // build rel array
          entry.rel = [];
          for (const p of entry.raw) {
            if (Array.isArray(p)) {
              const abs = Number(p[0]);
              const y = Number(p[1]);
              if (!isFinite(abs) || !isFinite(y)) continue;
              entry.rel.push([abs - entry.firstX, y]);
            } else if (p && typeof p === 'object') {
              const abs = this._absXOf(p);
              const y = Number(p.y != null ? p.y : (p[1] != null ? p[1] : NaN));
              if (!isFinite(abs) || !isFinite(y)) continue;
              try { p.x = abs; } catch(e) {}
              entry.rel.push([abs - entry.firstX, y]);
            }
          }
          this.seriesList.push(entry);
          // sync embedded pins (label-bearing object points)
          this.syncPinnedFromSeries(entry);
        }
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
        return;
      }

      // CSV path (existing behavior)
      const result = await parseCSVStream(file, p => this._emit('status', `解析 ${file.name}: ${Math.round(p*100)}%`));
      placeholder.headerCols = result.headerCols;
      placeholder.raw = result.points.slice();

      // normalize CSV numeric raw array (already [x,y]), but allow future object handling if needed
      placeholder.raw.sort((a,b)=> {
        const ax = Array.isArray(a) ? Number(a[0]) : this._absXOf(a);
        const bx = Array.isArray(b) ? Number(b[0]) : this._absXOf(b);
        return (isFinite(ax) ? ax : 0) - (isFinite(bx) ? bx : 0);
      });

      if (!placeholder.raw.length) {
        this.seriesList = this.seriesList.filter(s => s !== placeholder);
        this._emit('seriesChanged', this.seriesList);
        this._emit('status', `文件 ${file.name} 无数据`);
        return;
      }

      // compute firstX and rel (CSV raw entries are arrays)
      placeholder.firstX = placeholder.raw[0][0];
      placeholder.rel = placeholder.raw.map(p => [p[0] - placeholder.firstX, p[1]]);

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
    } catch (err) {
      console.error(err);
      // remove placeholder if still present
      this.seriesList = this.seriesList.filter(s => s !== placeholder);
      this._emit('seriesChanged', this.seriesList);
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
      if (windowArr.length <= globalTarget) s.sampled = windowArr;
      else s.sampled = largestTriangleThreeBuckets(windowArr, globalTarget);
    }

    this._emit('resampled', null);
  }

  // ----------------- pin synchronization -----------------
  // Build pinnedPoints entries for points embedded in series.raw that contain a non-empty `label`.
  // Preserves existing user-added pins (those without sourcePoint) and appends source-driven pins.
  syncPinnedFromSeries(series) {
    const seriesArr = series ? [series] : this.seriesList.slice();
    const preserved = this.pinnedPoints.filter(p => !p.sourcePoint);
    const newPins = preserved.slice();
    for (const s of seriesArr) {
      if (!s.raw || !s.raw.length) continue;
      for (const pt of s.raw) {
        if (Array.isArray(pt)) continue;
        if (!pt || typeof pt !== 'object') continue;
        const label = pt.label != null ? String(pt.label).trim() : '';
        if (!label) continue;
        const absX = Number(pt.x != null ? pt.x : (pt[0] != null ? pt[0] : NaN));
        if (!isFinite(absX)) continue;
        const relMicro = (s.firstX != null) ? (absX - s.firstX) : absX;
        const val = Number(pt.y != null ? pt.y : (pt[1] != null ? pt[1] : NaN));
        if (!isFinite(val)) continue;
        const exists = newPins.find(p => p.seriesId === s.id && p.relMicro === relMicro && p.val === val);
        if (exists) {
          if (!exists.sourcePoint) exists.sourcePoint = pt;
          if (!exists.label && label) exists.label = label;
          continue;
        }
        const entry = {
          seriesId: s.id,
          seriesName: s.name,
          relMicro,
          val,
          color: pt.color || s.color,
          selected: !!pt.selected,
          label,
          sourcePoint: pt
        };
        newPins.push(entry);
      }
    }
    this.pinnedPoints = newPins;
    this._emit('pinnedChanged', this.pinnedPoints);
  }

  // pinned API (minimal, unchanged)
  addPinned(seriesId, relMicro, val, color, seriesName) {
    const exists = this.pinnedPoints.find(p => p.seriesId === seriesId && p.relMicro === relMicro && p.val === val);
    if (exists) return exists;
    const entry = { seriesId, seriesName, relMicro, val, color, selected:false, hidden:false };
    this.pinnedPoints.push(entry);
    this._emit('pinnedChanged', this.pinnedPoints);
    this._emit('status', `标记点已添加：${seriesName} ${(relMicro/1e6).toFixed(3)}s`);
    this._emit('resampled', null);
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
      const label = p.label != null ? JSON.stringify(String(p.label)) : '';
      const metaObj = (p.sourcePoint && p.sourcePoint.meta) ? p.sourcePoint.meta : (p.meta || null);
      const meta = metaObj ? JSON.stringify(metaObj) : '';
      out += `${JSON.stringify(p.seriesName)},${p.relMicro},${p.val},${label},${meta}\n`;
    }
    return new Blob([out], {type: 'text/csv;charset=utf-8;'});
  }

  // Utilities...
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
    return { W, H, marginBase, plotW: W - marginBase.left - marginBase.right, plotH, minX, maxX, minY, maxY, minXSec: minX / 1e6, maxXSec: maxX / 1e6 };
  }
}
