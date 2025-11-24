import { createObservable } from "../lib/observable.js";

/**
 * ChartViewModel: Provides commands and derived state for chart interactions.
 * Acts as intermediary between ChartModel (data) and ChartView (rendering).
 */
export class ChartViewModel {
  constructor(chartModel) {
    this.model = chartModel;
    
    // Observable state for view-specific concerns
    this.state = createObservable({
      hoverCandidate: null,
      selecting: false,
      metrics: null
    });

    // Subscribe to model state changes
    this.model.state.subscribe((modelState) => {
      // Model state changes automatically trigger re-render through model events
      // ViewModels can add derived state here if needed
    });
  }

  // ========== Derived State Getters ==========
  get sampledSeries() {
    return this.model.seriesList.filter(s => s.visible);
  }

  get visibleSeries() {
    return this.model.seriesList.filter(s => s.visible);
  }

  get metrics() {
    return this.state.get().metrics;
  }

  // ========== Commands: File Operations ==========
  async loadFiles(files) {
    for (const file of files) {
      await this.model.loadFile(file);
    }
    return true;
  }

  // ========== Commands: View Navigation ==========
  pan(deltaX) {
    const span = Math.max(1, this.model.viewMaxX - this.model.viewMinX || 1);
    const ext = this.model.computeGlobalExtents();
    
    let newMin = this.model.viewMinX + deltaX;
    let newMax = this.model.viewMaxX + deltaX;
    
    // Clamp to valid range
    newMin = Math.max(0, newMin);
    newMax = Math.max(newMin + 1, newMax);
    
    if (newMax > ext.max) {
      newMax = ext.max;
      newMin = Math.max(0, newMax - span);
    }
    
    this.model.viewMinX = newMin;
    this.model.viewMaxX = newMax;
    this.model.resampleInView();
  }

  zoom(factor, centerRelMicro = null) {
    const span = Math.max(1, this.model.viewMaxX - this.model.viewMinX || 1);
    const newSpan = Math.max(1, span * factor);
    
    const center = centerRelMicro != null ? centerRelMicro : (this.model.viewMinX + this.model.viewMaxX) / 2;
    
    let newMin = Math.max(0, center - newSpan / 2);
    let newMax = newMin + newSpan;
    
    const ext = this.model.computeGlobalExtents();
    if (newMax > ext.max) {
      newMax = ext.max;
      newMin = Math.max(0, newMax - newSpan);
    }
    
    this.model.viewMinX = newMin;
    this.model.viewMaxX = newMax;
    this.model.resampleInView();
  }

  jumpToPin(pin) {
    this.model.jumpToPin(pin);
  }

  // ========== Commands: Pin Management ==========
  togglePinAt(seriesId, relMicro, val, color, seriesName) {
    const existingIdx = this.model.pinnedPoints.findIndex(p =>
      p.seriesId === seriesId && p.relMicro === relMicro && p.val === val
    );
    
    if (existingIdx >= 0) {
      this.model.removePinned(this.model.pinnedPoints[existingIdx]);
      return { action: 'removed', pin: null };
    } else {
      const pin = this.model.addPinned(seriesId, relMicro, val, color, seriesName);
      return { action: 'added', pin };
    }
  }

  clearAllPins() {
    this.model.clearPinned();
  }

  // ========== Commands: Sampling ==========
  setSampleTarget(n) {
    this.model.setSampleTarget(n);
  }

  // ========== Commands: View State ==========
  setHoverCandidate(candidate) {
    this.state.set({ hoverCandidate: candidate });
    this.model._emit('hover', candidate);
  }

  setMetrics(metrics) {
    this.state.set({ metrics });
  }

  // ========== Utilities ==========
  getModel() {
    return this.model;
  }
}
