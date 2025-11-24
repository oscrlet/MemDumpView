/**
 * PinnedListViewModel: ViewModel for pinned points list
 * 
 * Responsibilities:
 * - Manages pinned points state
 * - Provides commands for pin operations (select, delete, hide, rename, jump)
 * - Handles filtering and sorting of pins
 */

import { createObservable } from "../lib/observable.js";

export class PinnedListViewModel {
  constructor(chartModel) {
    if (!chartModel) {
      throw new Error('PinnedListViewModel requires a ChartModel instance');
    }
    
    this.model = chartModel;
    
    // ViewModel-specific state
    this.state = createObservable({
      pinnedPoints: [],
      filter: '__all',  // '__all' or seriesId
      groupBy: false,
      sortBy: 'time'    // 'time', 'value', 'series'
    });
    
    // Subscribe to model changes
    this.model.state.subscribe((modelState) => {
      this.state.set({
        pinnedPoints: modelState.pinnedPoints
      });
    });
  }

  /**
   * Subscribe to pinned list state changes
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

  /**
   * Get filtered and sorted pins
   */
  getDisplayPins() {
    const state = this.state.get();
    let list = state.pinnedPoints.slice();
    
    // Apply filter
    if (state.filter && state.filter !== '__all') {
      list = list.filter(p => p.seriesId === state.filter);
    }
    
    // Apply sort
    if (state.sortBy === 'time') {
      list.sort((a, b) => a.relMicro - b.relMicro);
    } else if (state.sortBy === 'value') {
      list.sort((a, b) => a.val - b.val);
    } else if (state.sortBy === 'series') {
      list.sort((a, b) => 
        (a.seriesName || '').localeCompare(b.seriesName || '') || 
        a.relMicro - b.relMicro
      );
    }
    
    return list;
  }

  /**
   * Get grouped pins (if groupBy is enabled)
   */
  getGroupedPins() {
    const state = this.state.get();
    if (!state.groupBy) {
      return null;
    }
    
    const list = this.getDisplayPins();
    const groups = {};
    
    for (const p of list) {
      const key = p.seriesName || 'Unknown';
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(p);
    }
    
    return groups;
  }

  // ========== Commands ==========

  /**
   * Select/deselect a pin
   */
  toggleSelect(pin) {
    pin.selected = !pin.selected;
    this.model._emit('pinnedChanged', this.model.state.get().pinnedPoints);
  }

  /**
   * Select all pins
   */
  selectAll() {
    const state = this.state.get();
    for (const p of state.pinnedPoints) {
      p.selected = true;
    }
    this.model._emit('pinnedChanged', state.pinnedPoints);
  }

  /**
   * Deselect all pins
   */
  deselectAll() {
    const state = this.state.get();
    for (const p of state.pinnedPoints) {
      p.selected = false;
    }
    this.model._emit('pinnedChanged', state.pinnedPoints);
  }

  /**
   * Delete a specific pin
   */
  deletePin(pin) {
    this.model.removePinned(pin);
  }

  /**
   * Delete selected pins
   */
  deleteSelected() {
    const state = this.state.get();
    const toDelete = state.pinnedPoints.filter(p => p.selected);
    
    for (const p of toDelete) {
      const idx = state.pinnedPoints.indexOf(p);
      if (idx >= 0) {
        state.pinnedPoints.splice(idx, 1);
      }
    }
    
    this.model._emit('pinnedChanged', state.pinnedPoints);
    return toDelete.length;
  }

  /**
   * Toggle pin visibility (hide/show)
   */
  toggleHide(pin) {
    pin.hidden = !pin.hidden;
    this.model._emit('pinnedChanged', this.model.state.get().pinnedPoints);
  }

  /**
   * Rename a pin
   */
  renamePin(pin, newName) {
    const label = String(newName || '');
    pin.label = label;
    
    // Sync with source point if available
    if (pin.sourcePoint && typeof pin.sourcePoint === 'object') {
      try {
        pin.sourcePoint.label = label;
      } catch (e) {
        // Best effort
      }
    }
    
    this.model._emit('pinnedChanged', this.model.state.get().pinnedPoints);
  }

  /**
   * Jump to a pin (adjust view to show it)
   */
  jumpToPin(pin) {
    if (!pin || !isFinite(pin.relMicro)) return;
    
    const modelState = this.model.state.get();
    const span = Math.max(1, modelState.viewMaxX - modelState.viewMinX || 1);
    const center = pin.relMicro;
    
    this.model.viewMinX = Math.max(0, center - span / 2);
    this.model.viewMaxX = this.model.viewMinX + span;
    this.model.resampleInView();
  }

  /**
   * Update display options (filter, groupBy, sortBy)
   */
  updateOptions({ filter, groupBy, sortBy } = {}) {
    const updates = {};
    if (filter !== undefined) updates.filter = filter;
    if (groupBy !== undefined) updates.groupBy = groupBy;
    if (sortBy !== undefined) updates.sortBy = sortBy;
    
    this.state.set(updates);
  }

  /**
   * Get count of selected pins
   */
  getSelectedCount() {
    const state = this.state.get();
    return state.pinnedPoints.filter(p => p.selected).length;
  }

  /**
   * Get total pin count
   */
  getTotalCount() {
    const state = this.state.get();
    return state.pinnedPoints.length;
  }
}
