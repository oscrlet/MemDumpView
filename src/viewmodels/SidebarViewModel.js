/**
 * SidebarViewModel: ViewModel for sidebar controls
 * 
 * Responsibilities:
 * - Manages sidebar UI state (series count, legend)
 * - Provides commands for file operations (open, export)
 * - Handles view control commands (zoom, fit, clear)
 */

import { createObservable } from "../lib/observable.js";

export class SidebarViewModel {
  constructor(chartModel) {
    if (!chartModel) {
      throw new Error('SidebarViewModel requires a ChartModel instance');
    }
    
    this.model = chartModel;
    
    // Sidebar-specific state
    this.state = createObservable({
      seriesCount: 0,
      seriesList: []
    });
    
    // Subscribe to model changes
    this.model.state.subscribe((modelState) => {
      this.state.set({
        seriesCount: modelState.seriesList.length,
        seriesList: modelState.seriesList
      });
    });
  }

  /**
   * Subscribe to sidebar state changes
   */
  subscribe(handler) {
    return this.state.subscribe(handler);
  }

  /**
   * Get current state
   */
  getState() {
    return this.state.get();
  }

  // ========== Commands ==========

  /**
   * Open file command - delegates to model
   */
  async openFile(file) {
    await this.model.loadFile(file);
  }

  /**
   * Export current view as PNG
   * Note: This needs to be coordinated with the ChartView
   * Returns a promise that the View should fulfill
   */
  exportPNG() {
    // This is handled by the View (ChartView.exportPNG)
    // ViewModel just triggers the intent
    this.model._emit('exportPNGRequested');
  }

  /**
   * Export current sampled data as CSV
   */
  exportCSV() {
    const arr = [];
    const state = this.model.state.get();
    
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
  exportPinned() {
    return this.model.exportPinnedCSV();
  }

  /**
   * Clear all series and pinned points
   */
  clearAll() {
    this.model.seriesList = [];
    this.model.clearPinned();
    this.model.resampleInView();
  }

  /**
   * Set sample target
   */
  setSampleTarget(target) {
    this.model.setSampleTarget(target);
  }

  /**
   * Auto-fit view to current data
   */
  autoFit() {
    this.model.resampleInView();
  }

  /**
   * Reset zoom to show all data
   */
  zoomReset() {
    const ext = this.model.computeGlobalExtents();
    this.model.viewMinX = 0;
    this.model.viewMaxX = ext.max;
    this.model.resampleInView();
  }

  /**
   * Reset to original recorded view window
   */
  resetOriginal() {
    const state = this.model.state.get();
    if (!state.originalViewSet) {
      return false;
    }
    
    this.model.viewMinX = state.originalViewMin;
    this.model.viewMaxX = state.originalViewMax;
    this.model.resampleInView();
    return true;
  }

  /**
   * Fit view to all data
   */
  fitAll() {
    const ext = this.model.computeGlobalExtents();
    this.model.viewMinX = 0;
    this.model.viewMaxX = ext.max;
    this.model.resampleInView();
  }

  /**
   * Toggle series visibility
   */
  toggleSeries(series) {
    series.visible = !series.visible;
    this.model.resampleInView();
    // Trigger update
    this.model.seriesList = this.model.seriesList;
  }

  /**
   * Get series list for legend
   */
  getSeriesList() {
    return this.state.get().seriesList;
  }
}
