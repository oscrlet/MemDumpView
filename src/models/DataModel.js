// Global data model singleton:
// - canonical state: seriesList, viewMinX/viewMaxX, pinnedPoints, sampling target, original view
// - simple event emitter: on/_emit
// - pin management helpers and export helpers
// This module exports `dataModel` (singleton) which other components can import.

export class DataModel {
  constructor() {
    this.seriesList = [];
    this.viewMinX = NaN;
    this.viewMaxX = NaN;
    this.pinnedPoints = [];
    this.originalViewSet = false;
    this.originalViewMin = null;
    this.originalViewMax = null;
    this.sampleTarget = 1000;

    // simple event emitter map
    this.events = new Map();
  }

  // Event API
  on(evt, handler) {
    if (!this.events.has(evt)) this.events.set(evt, []);
    this.events.get(evt).push(handler);
  }
  _emit(evt, payload) {
    const handlers = this.events.get(evt) || [];
    for (const h of handlers) {
      try { h(payload); } catch (e) { /* swallow handler errors */ }
    }
  }

  // pinned helpers (UI-agnostic)
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

  // Basic layout/plot metrics helper used by UI (keeps UI agnostic)
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
    if (isFinite(this.viewMinX) && isFinite(this.viewMaxX) && this.viewMaxX > this.viewMinX) {
      minX = this.viewMinX; maxX = this.viewMaxX;
    }
    const yPadTop = (maxY - minY) * 0.06 || 1;
    maxY = maxY + yPadTop; minY = 0;
    return { W, H, marginBase, plotW: W - marginBase.left - marginBase.right, plotH, minX, maxX, minY, maxY, minXSec: minX / 1e6, maxXSec: maxX / 1e6 };
  }
}

// singleton instance used by the app
export const dataModel = new DataModel();
