//import { parseCSVStream } from "../utils/csv.js";
import { parseJSONFile } from "../utils/json.js";
import { largestTriangleThreeBuckets, binarySearchLeft, binarySearchRight } from "../utils/lttb.js";
import { dataModel } from "../models/DataModel.js";

// ChartCore: parsing + sampling + view + pin synchronization.
// Uses the shared dataModel singleton.
export class ChartCore {
  constructor() {
    this.model = dataModel;

    // forward compat: allow callers to use core.on/_emit (delegates to model)
    this.on = this.model.on.bind(this.model);
    this._emit = this.model._emit.bind(this.model);
  }

  // expose some getters/setters for compatibility with existing code
  get seriesList() { return this.model.seriesList; }
  set seriesList(v) { this.model.seriesList = v; this._emit('seriesChanged', this.model.seriesList); }

  get viewMinX() { return this.model.viewMinX; }
  set viewMinX(v) { this.model.viewMinX = v; }

  get viewMaxX() { return this.model.viewMaxX; }
  set viewMaxX(v) { this.model.viewMaxX = v; }

  get pinnedPoints() { return this.model.pinnedPoints; }
  set pinnedPoints(v) { this.model.pinnedPoints = v; this._emit('pinnedChanged', this.model.pinnedPoints); }

  get sampleTarget() { return this.model.sampleTarget; }
  set sampleTarget(v) { this.model.sampleTarget = v; }

  // Public API: set sample target
  setSampleTarget(n) {
    const v = Math.max(3, Math.round(Number(n) || 0));
    this.model.sampleTarget = v;
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
    this.model.seriesList.push(placeholder);
    this._emit('seriesChanged', this.model.seriesList);
    try {
      const isJSON = (file.type === 'application/json') || (/\.json$/i.test(file.name || ''));
      if (isJSON) {
        const parsed = await parseJSONFile(file);
        if (!parsed || !Array.isArray(parsed.series) || parsed.series.length === 0) {
          // remove placeholder
          this.model.seriesList = this.model.seriesList.filter(s => s !== placeholder);
          this._emit('seriesChanged', this.model.seriesList);
          this._emit('status', `文件 ${file.name} 无数据`);
          return;
        }
        // remove placeholder and append parsed series entries
        this.model.seriesList = this.model.seriesList.filter(s => s !== placeholder);
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
          this.model.seriesList.push(entry);
          // sync embedded pins (label-bearing object points)
          this.syncPinnedFromSeries(entry);
        }
        this._applyColors();
        const ext = this.computeGlobalExtents();
        if (!this.model.originalViewSet) {
          this.model.originalViewMin = 0;
          this.model.originalViewMax = ext.max;
          this.model.originalViewSet = true;
        }
        this.model.viewMinX = 0; this.model.viewMaxX = ext.max;
        this.resampleInView();
        this._emit('status', `解析完成：${file.name}`);
        this._emit('seriesChanged', this.model.seriesList);
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
        this.model.seriesList = this.model.seriesList.filter(s => s !== placeholder);
        this._emit('seriesChanged', this.model.seriesList);
        this._emit('status', `文件 ${file.name} 无数据`);
        return;
      }

      // compute firstX and rel (CSV raw entries are arrays)
      placeholder.firstX = placeholder.raw[0][0];
      placeholder.rel = placeholder.raw.map(p => [p[0] - placeholder.firstX, p[1]]);

      this._applyColors();
      const ext = this.computeGlobalExtents();
      if (!this.model.originalViewSet) {
        this.model.originalViewMin = 0;
        this.model.originalViewMax = ext.max;
        this.model.originalViewSet = true;
      }
      this.model.viewMinX = 0; this.model.viewMaxX = ext.max;
      this.resampleInView();
      this._emit('status', `解析完成：${file.name}`);
      this._emit('seriesChanged', this.model.seriesList);
    } catch (err) {
      console.error(err);
      // remove placeholder if still present
      this.model.seriesList = this.model.seriesList.filter(s => s !== placeholder);
      this._emit('seriesChanged', this.model.seriesList);
      this._emit('status', `解析失败：${err && err.message ? err.message : err}`);
    }
  }

  _applyColors() {
    const colors = [];
    const n = this.model.seriesList.length;
    for (let i=0;i<n;i++){ const hue = Math.round((360 / Math.max(1, n)) * i); colors.push(`hsl(${hue} 70% 45%)`); }
    this.model.seriesList.forEach((s,i)=> s.color = s.color || colors[i%colors.length]);
  }

  computeGlobalExtents() {
    let min = Infinity, max = -Infinity;
    for (const s of this.model.seriesList) {
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
    if (this.model.seriesList.length === 0) { this._emit('resampled'); return; }
    const globalTarget = Math.max(10, Math.round(this.model.sampleTarget || 1000));

    const ext = this.computeGlobalExtents();
    if (!isFinite(this.model.viewMinX)) this.model.viewMinX = 0;
    if (!isFinite(this.model.viewMaxX)) this.model.viewMaxX = ext.max;
    this.model.viewMinX = Math.max(0, this.model.viewMinX);
    this.model.viewMaxX = Math.max(this.model.viewMinX + 1, this.model.viewMaxX);

    for (const s of this.model.seriesList) {
      if (!s.rel || s.rel.length === 0) { s.sampled = []; continue; }
      if (!s.visible) { s.sampled = []; continue; }
      const arr = s.rel;
      const lo = Math.max(0, binarySearchLeft(arr, this.model.viewMinX));
      const hi = Math.min(arr.length, binarySearchRight(arr, this.model.viewMaxX));
      const windowArr = arr.slice(Math.max(0, lo - 1), Math.min(arr.length, hi + 1));
      if (windowArr.length <= globalTarget) s.sampled = windowArr;
      else s.sampled = largestTriangleThreeBuckets(windowArr, globalTarget);
    }

    this._emit('resampled', null);
  }

  // ----------------- pin synchronization -----------------
  syncPinnedFromSeries(series) {
    const seriesArr = series ? [series] : this.model.seriesList.slice();
    const preserved = this.model.pinnedPoints.filter(p => !p.sourcePoint);
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
    this.model.pinnedPoints = newPins;
    this._emit('pinnedChanged', this.model.pinnedPoints);
  }

  // pinned API proxies (delegates to dataModel)
  addPinned(seriesId, relMicro, val, color, seriesName) {
    return this.model.addPinned(seriesId, relMicro, val, color, seriesName);
  }
  removePinned(entry) {
    return this.model.removePinned(entry);
  }
  clearPinned() {
    return this.model.clearPinned();
  }
  exportPinnedCSV() {
    return this.model.exportPinnedCSV();
  }

  // metrics helper proxy
  getBasePlotMetrics(canvasWidth, canvasHeight, dpr) {
    return this.model.getBasePlotMetrics(canvasWidth, canvasHeight, dpr);
  }
}
