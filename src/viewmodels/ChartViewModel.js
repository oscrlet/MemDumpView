/**
 * ChartViewModel: ViewModel layer for chart visualization
 * 
 * Responsibilities:
 * - Wraps ChartModel and exposes commands for the View
 * - Provides derived/computed values from model state
 * - Handles user interactions and delegates to model
 * - Manages view-specific state (e.g., hover candidate)
 */

import { createObservable } from "../lib/observable.js";

export class ChartViewModel {
  constructor(chartModel) {
    if (!chartModel) {
      throw new Error('ChartViewModel requires a ChartModel instance');
    }
    
    this.model = chartModel;
    
    // View-specific state (not in model)
    this.viewState = createObservable({
      hoverCandidate: null,
      boxSelecting: false
    });
  }

  /**
   * Subscribe to model state changes
   * @param {Function} handler - callback(newState)
   * @returns {Function} unsubscribe function
   */
  subscribe(handler) {
    return this.model.state.subscribe(handler);
  }

  /**
   * Subscribe to view state changes
   * @param {Function} handler - callback(newState)
   * @returns {Function} unsubscribe function
   */
  subscribeViewState(handler) {
    return this.viewState.subscribe(handler);
  }

  /**
   * Get current model state
   */
  getState() {
    return this.model.state.get();
  }

  /**
   * Get visible series (filtered by visible flag)
   */
  getVisibleSeries() {
    const state = this.model.state.get();
    return state.seriesList.filter(s => s.visible);
  }

  /**
   * Get sampled or original series data
   */
  getSampledSeries() {
    const state = this.model.state.get();
    return state.seriesList.map(s => ({
      ...s,
      data: (s.sampled && s.sampled.length > 0) ? s.sampled : s.rel
    }));
  }

  /**
   * Get pinned points that are visible (not hidden)
   */
  getVisiblePins() {
    const state = this.model.state.get();
    return state.pinnedPoints.filter(p => !p.hidden);
  }

  // ========== Commands (user actions) ==========

  /**
   * Load a file into the model
   */
  async loadFile(file) {
    await this.model.loadFile(file);
  }

  /**
   * Set sampling target
   */
  setSampleTarget(target) {
    this.model.setSampleTarget(target);
  }

  /**
   * Resample data in current view window
   */
  resampleInView() {
    this.model.resampleInView();
  }

  /**
   * Toggle pin at given point
   */
  togglePinAt(series, point) {
    const state = this.model.state.get();
    const existingIdx = state.pinnedPoints.findIndex(
      pp => pp.seriesId === series.id && 
            pp.relMicro === point[0] && 
            pp.val === point[1]
    );
    
    if (existingIdx >= 0) {
      this.model.removePinned(state.pinnedPoints[existingIdx]);
    } else {
      this.model.addPinned(series.id, point[0], point[1], series.color || '#333', series.name);
    }
  }

  /**
   * Add a pinned point
   */
  addPin(seriesId, relMicro, val, color, seriesName) {
    return this.model.addPinned(seriesId, relMicro, val, color, seriesName);
  }

  /**
   * Remove a pinned point
   */
  removePin(pin) {
    this.model.removePinned(pin);
  }

  /**
   * Clear all pinned points
   */
  clearPins() {
    this.model.clearPinned();
  }

  /**
   * Jump to a specific pinned point (adjust view window)
   */
  jumpToPin(pin) {
    if (!pin || !isFinite(pin.relMicro)) return;
    
    const state = this.model.state.get();
    const span = Math.max(1, state.viewMaxX - state.viewMinX || 1);
    const center = pin.relMicro;
    
    this.model.viewMinX = Math.max(0, center - span / 2);
    this.model.viewMaxX = this.model.viewMinX + span;
    this.model.resampleInView();
  }

  /**
   * Pan the view window
   * @param {number} deltaX - amount to pan in microseconds
   */
  pan(deltaX) {
    const state = this.model.state.get();
    const ext = this.model.computeGlobalExtents();
    const span = Math.max(1, state.viewMaxX - state.viewMinX);
    
    let newMinX = state.viewMinX + deltaX;
    let newMaxX = state.viewMaxX + deltaX;
    
    // Clamp to valid range
    newMinX = Math.max(0, Math.min(newMinX, ext.max - span));
    newMaxX = newMinX + span;
    
    this.model.viewMinX = newMinX;
    this.model.viewMaxX = newMaxX;
    this.model.resampleInView();
  }

  /**
   * Zoom the view window
   * @param {number} factor - zoom factor (>1 = zoom out, <1 = zoom in)
   * @param {number} centerMicro - center point for zoom in microseconds
   */
  zoom(factor, centerMicro) {
    const state = this.model.state.get();
    const ext = this.model.computeGlobalExtents();
    const span = Math.max(1, state.viewMaxX - state.viewMinX);
    
    let newSpan = Math.max(1, span * factor);
    let newMinX = Math.max(0, centerMicro - newSpan / 2);
    let newMaxX = newMinX + newSpan;
    
    // Clamp to extents
    if (newMaxX > ext.max) {
      newMaxX = ext.max;
      newMinX = Math.max(0, newMaxX - newSpan);
    }
    
    this.model.viewMinX = newMinX;
    this.model.viewMaxX = newMaxX;
    this.model.resampleInView();
  }

  /**
   * Zoom to a specific region
   */
  zoomToRegion(minX, maxX) {
    const ext = this.model.computeGlobalExtents();
    let newMinX = Math.max(0, Math.min(minX, maxX));
    let newMaxX = Math.max(newMinX + 1, Math.max(minX, maxX));
    
    // Ensure minimum span
    const minSpan = Math.max(1, (newMaxX - newMinX) * 0.00001);
    if (newMaxX - newMinX < minSpan) {
      const center = (newMinX + newMaxX) / 2;
      newMinX = Math.max(0, center - minSpan / 2);
      newMaxX = newMinX + minSpan;
    }
    
    this.model.viewMinX = newMinX;
    this.model.viewMaxX = newMaxX;
    this.model.resampleInView();
  }

  /**
   * Reset view to original window
   */
  resetViewToOriginal() {
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
   * Reset view to fit all data
   */
  resetViewToFitAll() {
    const ext = this.model.computeGlobalExtents();
    this.model.viewMinX = 0;
    this.model.viewMaxX = ext.max;
    this.model.resampleInView();
  }

  /**
   * Toggle series visibility
   */
  toggleSeriesVisibility(series) {
    series.visible = !series.visible;
    this.model.resampleInView();
    // Explicitly trigger state update for reactive updates
    this.model.state.set({ seriesList: this.model.seriesList });
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
   * Set hover candidate (for tooltip display)
   */
  setHoverCandidate(candidate) {
    this.viewState.set({ hoverCandidate: candidate });
    // Also emit via legacy event system
    this.model._emit('hover', candidate);
  }

  /**
   * Export pinned points as CSV blob
   */
  exportPinnedCSV() {
    return this.model.exportPinnedCSV();
  }

  /**
   * Get plot metrics for rendering
   */
  getPlotMetrics(canvasWidth, canvasHeight, dpr) {
    return this.model.getBasePlotMetrics(canvasWidth, canvasHeight, dpr);
  }

  /**
   * Compute global data extents
   */
  computeGlobalExtents() {
    return this.model.computeGlobalExtents();
  }
}
