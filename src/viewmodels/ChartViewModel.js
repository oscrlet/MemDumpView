import { createObservable } from "../lib/observable.js";

/**
 * ChartViewModel: Provides commands and derived state for ChartView
 * Wraps ChartModel and exposes UI-friendly operations
 */
export class ChartViewModel {
  constructor(chartModel) {
    this.model = chartModel;
    
    // ViewModel-specific state (UI concerns)
    this.viewState = createObservable({
      hoverCandidate: null,
      isBoxSelecting: false,
      tooltipVisible: false
    });

    // Subscribe to model changes and compute derived state
    this.model.subscribe(modelState => {
      this._onModelStateChange(modelState);
    });
  }

  /**
   * Subscribe to combined state (model + view state)
   */
  subscribe(callback) {
    // Combine model state and view state
    const modelUnsub = this.model.subscribe(modelState => {
      const viewState = this.viewState.get();
      callback({ ...modelState, ...viewState });
    });

    const viewUnsub = this.viewState.subscribe(viewState => {
      const modelState = this.model.getState();
      callback({ ...modelState, ...viewState });
    });

    // Return combined unsubscribe
    return () => {
      modelUnsub();
      viewUnsub();
    };
  }

  /**
   * Get complete current state
   */
  getState() {
    const modelState = this.model.getState();
    const viewState = this.viewState.get();
    return { ...modelState, ...viewState };
  }

  _onModelStateChange(modelState) {
    // Hook for reacting to model changes
    // Currently no additional processing needed as state is
    // already propagated through subscribe mechanism
  }

  // ---------- Commands (user actions) ----------

  /**
   * Load files (CSV or JSON)
   */
  async loadFiles(files) {
    for (const file of files) {
      await this.model.loadFile(file);
    }
  }

  /**
   * Toggle pin at a specific point
   */
  togglePinAt(seriesId, relMicro, val, color, seriesName) {
    const state = this.model.getState();
    const existing = state.pinnedPoints.find(
      p => p.seriesId === seriesId && p.relMicro === relMicro && p.val === val
    );
    
    if (existing) {
      this.model.removePinned(existing);
    } else {
      this.model.addPinned(seriesId, relMicro, val, color, seriesName);
    }
  }

  /**
   * Delete selected pins
   */
  deleteSelectedPins() {
    const state = this.model.getState();
    const selected = state.pinnedPoints.filter(p => p.selected);
    
    for (const pin of selected) {
      this.model.removePinned(pin);
    }
  }

  /**
   * Select all pins
   */
  selectAllPins() {
    const state = this.model.getState();
    const pinnedPoints = [...state.pinnedPoints];
    
    for (const p of pinnedPoints) {
      p.selected = true;
    }
    
    this.model._updateState({ pinnedPoints });
  }

  /**
   * Clear pin selection
   */
  clearPinSelection() {
    const state = this.model.getState();
    const pinnedPoints = [...state.pinnedPoints];
    
    for (const p of pinnedPoints) {
      p.selected = false;
    }
    
    this.model._updateState({ pinnedPoints });
  }

  /**
   * Pan view (move left/right)
   */
  pan(deltaX) {
    const state = this.model.getState();
    const newMinX = state.viewMinX + deltaX;
    const newMaxX = state.viewMaxX + deltaX;
    
    this.model._updateState({
      viewMinX: Math.max(0, newMinX),
      viewMaxX: Math.max(0, newMaxX)
    });
    this.model.resampleInView();
  }

  /**
   * Zoom view (in/out around a center point)
   */
  zoom(factor, centerRelMicro) {
    const state = this.model.getState();
    const span = Math.max(1, state.viewMaxX - state.viewMinX || 1);
    const newSpan = Math.max(1, span * factor);
    
    let newMinX = Math.max(0, centerRelMicro - newSpan / 2);
    let newMaxX = newMinX + newSpan;
    
    // Clamp to global extents
    const ext = this.model.computeGlobalExtents();
    if (newMaxX > ext.max) {
      newMaxX = ext.max;
      newMinX = Math.max(0, newMaxX - newSpan);
    }
    
    this.model._updateState({
      viewMinX: newMinX,
      viewMaxX: newMaxX
    });
    this.model.resampleInView();
  }

  /**
   * Zoom to box selection
   */
  zoomToBox(minRelMicro, maxRelMicro) {
    const newMinX = Math.max(0, Math.min(minRelMicro, maxRelMicro));
    const newMaxX = Math.max(newMinX + 1, Math.max(minRelMicro, maxRelMicro));
    
    this.model._updateState({
      viewMinX: newMinX,
      viewMaxX: newMaxX
    });
    this.model.resampleInView();
  }

  /**
   * Jump to a pinned point
   */
  jumpToPin(pin) {
    this.model.jumpToPin(pin);
  }

  /**
   * Set sampling target
   */
  setSampleTarget(target) {
    this.model.setSampleTarget(target);
  }

  /**
   * Reset view to original extents
   */
  resetViewToOriginal() {
    const state = this.model.getState();
    if (!state.originalViewSet) return;
    
    this.model._updateState({
      viewMinX: state.originalViewMin,
      viewMaxX: state.originalViewMax
    });
    this.model.resampleInView();
  }

  /**
   * Fit view to all data
   */
  fitViewToAll() {
    const ext = this.model.computeGlobalExtents();
    this.model._updateState({
      viewMinX: 0,
      viewMaxX: ext.max
    });
    this.model.resampleInView();
  }

  /**
   * Clear all data
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
  }

  /**
   * Update hover candidate
   */
  setHoverCandidate(candidate) {
    this.viewState.set({ hoverCandidate: candidate });
  }

  /**
   * Set box selecting state
   */
  setBoxSelecting(isSelecting) {
    this.viewState.set({ isBoxSelecting: isSelecting });
  }

  // ---------- Derived state / queries ----------

  /**
   * Get visible series
   */
  getVisibleSeries() {
    const state = this.model.getState();
    return state.seriesList.filter(s => s.visible);
  }

  /**
   * Get sampled series for rendering
   */
  getSampledSeries() {
    const state = this.model.getState();
    return state.seriesList.map(s => ({
      ...s,
      points: s.sampled && s.sampled.length > 0 ? s.sampled : s.rel
    }));
  }

  /**
   * Get visible pinned points
   */
  getVisiblePinnedPoints() {
    const state = this.model.getState();
    return state.pinnedPoints.filter(p => !p.hidden);
  }

  /**
   * Export pinned CSV
   */
  exportPinnedCSV() {
    return this.model.exportPinnedCSV();
  }

  /**
   * Export current series as CSV
   */
  exportSeriesCSV() {
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
}
