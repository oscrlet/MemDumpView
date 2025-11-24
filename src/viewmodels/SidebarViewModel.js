import { createObservable } from "../lib/observable.js";

/**
 * SidebarViewModel: Manages sidebar state and commands
 * Handles file operations, export, and legend interactions
 */
export class SidebarViewModel {
  constructor(chartModel) {
    this.model = chartModel;
    
    // Sidebar-specific state
    this.state = createObservable({
      seriesCount: 0,
      hasData: false
    });

    // Subscribe to model changes
    this.model.subscribe(modelState => {
      this.state.set({
        seriesCount: modelState.seriesList.length,
        hasData: modelState.seriesList.length > 0
      });
    });
  }

  /**
   * Subscribe to state changes
   */
  subscribe(callback) {
    return this.state.subscribe(callback);
  }

  /**
   * Get current state
   */
  getState() {
    return this.state.get();
  }

  /**
   * Get series list for legend
   */
  getSeriesList() {
    return this.model.getState().seriesList;
  }

  // ---------- Commands ----------

  /**
   * Request file open
   */
  openFiles(files) {
    return this.model.loadFile ? 
      Promise.all(Array.from(files).map(f => this.model.loadFile(f))) :
      Promise.resolve();
  }

  /**
   * Export PNG (delegate to view/UI layer)
   */
  requestExportPNG() {
    // This will be handled by the view layer
    // Return a signal that PNG export was requested
    return { type: 'export-png' };
  }

  /**
   * Export CSV of current series
   */
  exportCSV() {
    const state = this.model.getState();
    const arr = [];
    for (const s of state.seriesList) {
      const arrPts = s.sampled && s.sampled.length ? s.sampled : s.rel;
      if (!arrPts) continue;
      for (const p of arrPts) {
        arr.push(`${JSON.stringify(s.name)},${p[0]},${p[1]}`);
      }
    }
    const out = 'series,rel_us,value\n' + arr.join('\n');
    return new Blob([out], { type: 'text/csv;charset=utf-8;' });
  }

  /**
   * Export pinned points as CSV
   */
  exportPinnedCSV() {
    return this.model.exportPinnedCSV();
  }

  /**
   * Clear all data and pins
   */
  clearAll() {
    this.model._updateState({
      seriesList: [],
      pinnedPoints: [],
      status: '已清除所有序列及标记'
    });
    this.model.resampleInView();
  }

  /**
   * Toggle series visibility
   */
  toggleSeriesVisibility(series) {
    series.visible = !series.visible;
    this.model.resampleInView();
    // Trigger state update
    const state = this.model.getState();
    this.model._updateState({ seriesList: [...state.seriesList] });
  }

  /**
   * Set sample target
   */
  setSampleTarget(target) {
    this.model.setSampleTarget(target);
  }

  /**
   * Auto-fit view
   */
  autoFit() {
    this.model.resampleInView();
  }

  /**
   * Zoom reset to global extents
   */
  zoomReset() {
    const ext = this.model.computeGlobalExtents();
    this.model._updateState({
      viewMinX: 0,
      viewMaxX: ext.max
    });
    this.model.resampleInView();
  }

  /**
   * Reset to original view
   */
  resetOriginal() {
    const state = this.model.getState();
    if (!state.originalViewSet) return false;
    
    this.model._updateState({
      viewMinX: state.originalViewMin,
      viewMaxX: state.originalViewMax
    });
    this.model.resampleInView();
    return true;
  }

  /**
   * Fit all data
   */
  fitAll() {
    const ext = this.model.computeGlobalExtents();
    this.model._updateState({
      viewMinX: 0,
      viewMaxX: ext.max
    });
    this.model.resampleInView();
  }
}
