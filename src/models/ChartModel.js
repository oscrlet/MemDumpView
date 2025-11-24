import { parseCSVStream } from "../utils/csv.js";
import { parseJSONFile } from "../utils/json.js";
import { largestTriangleThreeBuckets, binarySearchLeft, binarySearchRight } from "../utils/lttb.js";
import { createObservable } from "../lib/observable.js";

/**
 * ChartModel: Core data model for chart with observable state.
 * Handles data loading (CSV/JSON), LTTB sampling, view management, and pinned points.
 * Uses observable pattern instead of event emitters for reactive state updates.
 */
export class ChartModel {
  constructor() {
    // Observable state (replaces direct properties + events)
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

    // Legacy event system for backward compatibility
    // Will be phased out once all consumers use observable
    this.events = new Map();
  }

  /**
   * Subscribe to state changes
   * @param {Function} callback - Called with new state on each update
   * @returns {Function} unsubscribe function
   */
  subscribe(callback) {
    return this.state.subscribe(callback);
  }

  /**
   * Get current state (read-only copy)
   */
  getState() {
    return this.state.get();
  }

  /**
   * Legacy event compatibility (will be deprecated)
   */
  on(evt, handler) {
    if (!this.events.has(evt)) this.events.set(evt, []);
    this.events.get(evt).push(handler);
  }

  _emit(evt, payload) {
    const handlers = this.events.get(evt) || [];
    for (const h of handlers) h(payload);
  }

  /**
   * Update state and emit legacy events for compatibility
   */
  _updateState(partial) {
    this.state.set(partial);
    
    // Emit legacy events for backward compatibility
    const currentState = this.state.get();
    if (partial.seriesList !== undefined) this._emit('seriesChanged', currentState.seriesList);
    if (partial.pinnedPoints !== undefined) this._emit('pinnedChanged', currentState.pinnedPoints);
    if (partial.status !== undefined) this._emit('status', currentState.status);
    if (partial.viewMinX !== undefined || partial.viewMaxX !== undefined) {
      this._emit('resampled', null);
    }
  }

  // ---------- Public API ----------

  /**
   * Set sampling target for LTTB downsampling
   */
  setSampleTarget(n) {
    const v = Math.max(3, Math.round(Number(n) || 0));
    this._updateState({ 
      sampleTarget: v,
      status: `采样目标设置为 ${v}`
    });
    this.resampleInView();
  }

  // ---------- Helper methods ----------

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
    if (rawPoint && typeof rawPoint === 'object') {
      return this._toMicroseconds(rawPoint.x != null ? rawPoint.x : (rawPoint[0] != null ? rawPoint[0] : undefined));
    }
    return NaN;
  }

  _applyColors() {
    const state = this.state.get();
    const seriesList = state.seriesList;
    const colors = [];
    const n = seriesList.length;
    for (let i = 0; i < n; i++) {
      const hue = Math.round((360 / Math.max(1, n)) * i);
      colors.push(`hsl(${hue} 70% 45%)`);
    }
    seriesList.forEach((s, i) => s.color = s.color || colors[i % colors.length]);
    this._updateState({ seriesList: [...seriesList] });
  }

  // ---------- File loading ----------

  async loadFile(file) {
    this._updateState({ 
      status: `解析 ${file.name}...`,
      loading: true 
    });

    const state = this.state.get();
    const seriesList = [...state.seriesList];
    
    // Placeholder meta in case parse fails early (keeps UI stable)
    const placeholderId = crypto.randomUUID?.() || `s${Date.now()}`;
    const placeholder = {
      id: placeholderId,
      name: file.name || 'file',
      raw: [],
      rel: [],
      sampled: [],
      color: '',
      visible: true,
      firstX: null,
      headerCols: null
    };
    seriesList.push(placeholder);
    this._updateState({ seriesList: [...seriesList] });

    try {
      const isJSON = (file.type === 'application/json') || (/\.json$/i.test(file.name || ''));
      
      if (isJSON) {
        const parsed = await parseJSONFile(file);
        if (!parsed || !Array.isArray(parsed.series) || parsed.series.length === 0) {
          // Remove placeholder
          const filteredList = seriesList.filter(s => s !== placeholder);
          this._updateState({ 
            seriesList: filteredList,
            status: `文件 ${file.name} 无数据`,
            loading: false
          });
          return;
        }

        // Remove placeholder and append parsed series entries
        const newList = seriesList.filter(s => s !== placeholder);
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
                try { rp.x = abs; } catch (e) {}
              } else {
                rp._invalid_time = true;
              }
            }
          }
          entry.raw = entry.raw.filter(rp => !(rp && rp._invalid_time));

          // Compute firstX if not provided
          if (!isFinite(Number(entry.firstX))) {
            let fx = null;
            for (const r of entry.raw) {
              const abs = this._absXOf(r);
              if (isFinite(abs)) { fx = abs; break; }
            }
            entry.firstX = fx != null ? fx : 0;
          }

          // Build rel array
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
              try { p.x = abs; } catch (e) {}
              entry.rel.push([abs - entry.firstX, y]);
            }
          }

          newList.push(entry);
          // Sync embedded pins (label-bearing object points)
          this._syncPinnedFromSeries(entry, newList);
        }

        this._updateState({ seriesList: newList });
        this._applyColors();
        
        const ext = this.computeGlobalExtents();
        const currentState = this.state.get();
        if (!currentState.originalViewSet) {
          this._updateState({
            originalViewMin: 0,
            originalViewMax: ext.max,
            originalViewSet: true,
            viewMinX: 0,
            viewMaxX: ext.max
          });
        } else {
          this._updateState({
            viewMinX: 0,
            viewMaxX: ext.max
          });
        }

        this.resampleInView();
        this._updateState({ 
          status: `解析完成：${file.name}`,
          loading: false
        });
        return;
      }

      // CSV path
      const result = await parseCSVStream(file, p => {
        this._updateState({ status: `解析 ${file.name}: ${Math.round(p * 100)}%` });
      });

      placeholder.headerCols = result.headerCols;
      placeholder.raw = result.points.slice();

      // Normalize CSV numeric raw array (already [x,y] in microseconds after csv.js fix)
      placeholder.raw.sort((a, b) => {
        const ax = Array.isArray(a) ? Number(a[0]) : this._absXOf(a);
        const bx = Array.isArray(b) ? Number(b[0]) : this._absXOf(b);
        return (isFinite(ax) ? ax : 0) - (isFinite(bx) ? bx : 0);
      });

      if (!placeholder.raw.length) {
        const filteredList = seriesList.filter(s => s !== placeholder);
        this._updateState({ 
          seriesList: filteredList,
          status: `文件 ${file.name} 无数据`,
          loading: false
        });
        return;
      }

      // Compute firstX and rel (CSV raw entries are arrays in microseconds)
      placeholder.firstX = placeholder.raw[0][0];
      placeholder.rel = placeholder.raw.map(p => [p[0] - placeholder.firstX, p[1]]);

      this._updateState({ seriesList: [...seriesList] });
      this._applyColors();
      
      const ext = this.computeGlobalExtents();
      const currentState = this.state.get();
      if (!currentState.originalViewSet) {
        this._updateState({
          originalViewMin: 0,
          originalViewMax: ext.max,
          originalViewSet: true,
          viewMinX: 0,
          viewMaxX: ext.max
        });
      } else {
        this._updateState({
          viewMinX: 0,
          viewMaxX: ext.max
        });
      }

      this.resampleInView();
      this._updateState({ 
        status: `解析完成：${file.name}`,
        loading: false
      });

    } catch (err) {
      console.error(err);
      const filteredList = seriesList.filter(s => s !== placeholder);
      this._updateState({ 
        seriesList: filteredList,
        status: `解析失败：${err && err.message ? err.message : err}`,
        loading: false
      });
    }
  }

  computeGlobalExtents() {
    const state = this.state.get();
    const seriesList = state.seriesList;
    let min = Infinity, max = -Infinity;
    for (const s of seriesList) {
      if (!s.rel || s.rel.length === 0) continue;
      min = Math.min(min, s.rel[0][0]);
      max = Math.max(max, s.rel[s.rel.length - 1][0]);
    }
    if (!isFinite(min)) { min = 0; max = 1; }
    min = Math.max(0, min);
    return { min, max };
  }

  /**
   * Resample series data for current view using LTTB
   */
  resampleInView() {
    const state = this.state.get();
    const seriesList = state.seriesList;
    
    if (seriesList.length === 0) {
      this._emit('resampled', null);
      return;
    }

    const globalTarget = Math.max(10, Math.round(state.sampleTarget || 1000));
    const ext = this.computeGlobalExtents();
    
    let viewMinX = state.viewMinX;
    let viewMaxX = state.viewMaxX;
    
    if (!isFinite(viewMinX)) viewMinX = 0;
    if (!isFinite(viewMaxX)) viewMaxX = ext.max;
    viewMinX = Math.max(0, viewMinX);
    viewMaxX = Math.max(viewMinX + 1, viewMaxX);

    for (const s of seriesList) {
      if (!s.rel || s.rel.length === 0) {
        s.sampled = [];
        continue;
      }
      if (!s.visible) {
        s.sampled = [];
        continue;
      }

      const arr = s.rel;
      const lo = Math.max(0, binarySearchLeft(arr, viewMinX));
      const hi = Math.min(arr.length, binarySearchRight(arr, viewMaxX));
      const windowArr = arr.slice(Math.max(0, lo - 1), Math.min(arr.length, hi + 1));

      if (windowArr.length <= globalTarget) {
        s.sampled = windowArr;
      } else {
        s.sampled = largestTriangleThreeBuckets(windowArr, globalTarget);
      }
    }

    this._updateState({ 
      seriesList: [...seriesList],
      viewMinX,
      viewMaxX
    });
    this._emit('resampled', null);
  }

  // ---------- Pinned points management ----------

  /**
   * Sync pinned points from series raw data (for JSON imports with labels)
   */
  _syncPinnedFromSeries(series, seriesListSnapshot) {
    const state = this.state.get();
    const seriesArr = series ? [series] : seriesListSnapshot || state.seriesList;
    const preserved = state.pinnedPoints.filter(p => !p.sourcePoint);
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

    this._updateState({ pinnedPoints: newPins });
  }

  /**
   * Add a pinned point
   */
  addPinned(seriesId, relMicro, val, color, seriesName) {
    const state = this.state.get();
    const pinnedPoints = [...state.pinnedPoints];
    
    const exists = pinnedPoints.find(p => p.seriesId === seriesId && p.relMicro === relMicro && p.val === val);
    if (exists) return exists;

    const entry = {
      seriesId,
      seriesName,
      relMicro,
      val,
      color,
      selected: false,
      hidden: false
    };
    pinnedPoints.push(entry);
    
    this._updateState({ 
      pinnedPoints,
      status: `标记点已添加：${seriesName} ${(relMicro / 1e6).toFixed(3)}s`
    });
    this._emit('resampled', null);
    
    return entry;
  }

  /**
   * Remove a pinned point
   */
  removePinned(entry) {
    const state = this.state.get();
    const pinnedPoints = [...state.pinnedPoints];
    const idx = pinnedPoints.indexOf(entry);
    if (idx >= 0) {
      pinnedPoints.splice(idx, 1);
      this._updateState({ 
        pinnedPoints,
        status: '标记点已删除'
      });
    }
  }

  /**
   * Clear all pinned points
   */
  clearPinned() {
    this._updateState({ 
      pinnedPoints: [],
      status: '已清除所有标记'
    });
  }

  /**
   * Export pinned points as CSV
   */
  exportPinnedCSV() {
    const state = this.state.get();
    const pinnedPoints = state.pinnedPoints;
    
    if (!pinnedPoints.length) return null;

    let out = 'series,rel_us,value,label,meta\n';
    for (const p of pinnedPoints) {
      const label = p.label != null ? JSON.stringify(String(p.label)) : '';
      const metaObj = (p.sourcePoint && p.sourcePoint.meta) ? p.sourcePoint.meta : (p.meta || null);
      const meta = metaObj ? JSON.stringify(metaObj) : '';
      out += `${JSON.stringify(p.seriesName)},${p.relMicro},${p.val},${label},${meta}\n`;
    }
    return new Blob([out], { type: 'text/csv;charset=utf-8;' });
  }

  /**
   * Jump to pin location (update view to center on pin)
   */
  jumpToPin(pin) {
    if (!pin) return;
    const state = this.state.get();
    const span = Math.max(1, state.viewMaxX - state.viewMinX || 1);
    const centerX = pin.relMicro;
    
    this._updateState({
      viewMinX: Math.max(0, centerX - span / 2),
      viewMaxX: centerX + span / 2
    });
    this.resampleInView();
  }

  // ---------- Utilities for UI ----------

  /**
   * Get base plot metrics for rendering (used by ChartUI/ChartView)
   */
  getBasePlotMetrics(canvasWidth, canvasHeight, dpr) {
    const state = this.state.get();
    const W = canvasWidth, H = canvasHeight;
    const marginBase = {
      left: 70 * dpr,
      right: 18 * dpr,
      top: 18 * dpr,
      bottom: 48 * dpr
    };
    const plotH = H - marginBase.top - marginBase.bottom;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of state.seriesList) {
      if (!s.visible) continue;
      const arr = (s.sampled && s.sampled.length > 0) ? s.sampled : s.rel;
      if (!arr || arr.length === 0) continue;
      minX = Math.min(minX, arr[0][0]);
      maxX = Math.max(maxX, arr[arr.length - 1][0]);
      for (const p of arr) {
        minY = Math.min(minY, p[1]);
        maxY = Math.max(maxY, p[1]);
      }
    }

    if (!isFinite(minX)) { minX = 0; maxX = 1; minY = 0; maxY = 1; }
    minX = Math.max(0, minX);
    minY = Math.max(0, minY);

    const globalExt = this.computeGlobalExtents();
    if (isFinite(state.viewMinX) && isFinite(state.viewMaxX) && state.viewMaxX > state.viewMinX) {
      minX = state.viewMinX;
      maxX = state.viewMaxX;
    }

    const yPadTop = (maxY - minY) * 0.06 || 1;
    maxY = maxY + yPadTop;
    minY = 0;

    return {
      W, H,
      marginBase,
      plotW: W - marginBase.left - marginBase.right,
      plotH,
      minX, maxX, minY, maxY,
      minXSec: minX / 1e6,
      maxXSec: maxX / 1e6
    };
  }

  // Legacy properties for backward compatibility (getter/setter delegates to observable state)
  get seriesList() { return this.state.get().seriesList; }
  set seriesList(val) { this._updateState({ seriesList: val }); }

  get viewMinX() { return this.state.get().viewMinX; }
  set viewMinX(val) { this._updateState({ viewMinX: val }); }

  get viewMaxX() { return this.state.get().viewMaxX; }
  set viewMaxX(val) { this._updateState({ viewMaxX: val }); }

  get pinnedPoints() { return this.state.get().pinnedPoints; }
  set pinnedPoints(val) { this._updateState({ pinnedPoints: val }); }

  get originalViewSet() { return this.state.get().originalViewSet; }
  set originalViewSet(val) { this._updateState({ originalViewSet: val }); }

  get originalViewMin() { return this.state.get().originalViewMin; }
  set originalViewMin(val) { this._updateState({ originalViewMin: val }); }

  get originalViewMax() { return this.state.get().originalViewMax; }
  set originalViewMax(val) { this._updateState({ originalViewMax: val }); }

  get sampleTarget() { return this.state.get().sampleTarget; }
  set sampleTarget(val) { this._updateState({ sampleTarget: val }); }
}
