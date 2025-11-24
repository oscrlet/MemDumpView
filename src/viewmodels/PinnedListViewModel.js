import { createObservable } from "../lib/observable.js";

/**
 * PinnedListViewModel: Manages pinned list state and commands
 * Handles pin selection, deletion, renaming, and navigation
 */
export class PinnedListViewModel {
  constructor(chartModel) {
    this.model = chartModel;
    
    // ViewModel-specific state
    this.state = createObservable({
      pinnedCount: 0,
      selectedCount: 0,
      filter: '__all',
      groupBy: false,
      sortBy: 'time'
    });

    // Subscribe to model changes
    this.model.subscribe(modelState => {
      const selectedCount = modelState.pinnedPoints.filter(p => p.selected).length;
      this.state.set({
        pinnedCount: modelState.pinnedPoints.length,
        selectedCount
      });
    });
  }

  /**
   * Subscribe to state changes
   */
  subscribe(callback) {
    // Combine model pinnedPoints with local state
    const modelUnsub = this.model.subscribe(modelState => {
      const viewState = this.state.get();
      callback({
        ...viewState,
        pinnedPoints: modelState.pinnedPoints
      });
    });

    const viewUnsub = this.state.subscribe(viewState => {
      const modelState = this.model.getState();
      callback({
        ...viewState,
        pinnedPoints: modelState.pinnedPoints
      });
    });

    return () => {
      modelUnsub();
      viewUnsub();
    };
  }

  /**
   * Get current state (including pins from model)
   */
  getState() {
    const modelState = this.model.getState();
    const viewState = this.state.get();
    return {
      ...viewState,
      pinnedPoints: modelState.pinnedPoints
    };
  }

  /**
   * Get filtered and sorted pinned points
   */
  getPinnedPoints() {
    const state = this.getState();
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
      list.sort((a, b) => {
        const cmp = (a.seriesName || '').localeCompare(b.seriesName || '');
        return cmp !== 0 ? cmp : a.relMicro - b.relMicro;
      });
    }

    return list;
  }

  /**
   * Get grouped pinned points (if groupBy is enabled)
   */
  getGroupedPinnedPoints() {
    const state = this.getState();
    if (!state.groupBy) return null;

    const list = this.getPinnedPoints();
    const groups = {};
    
    for (const p of list) {
      const key = p.seriesName || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    }

    return groups;
  }

  // ---------- Commands ----------

  /**
   * Toggle pin selection
   */
  togglePinSelection(pin) {
    const state = this.model.getState();
    const pinnedPoints = [...state.pinnedPoints];
    
    const target = pinnedPoints.find(p => 
      p.seriesId === pin.seriesId && 
      p.relMicro === pin.relMicro && 
      p.val === pin.val
    );
    
    if (target) {
      target.selected = !target.selected;
      this.model._updateState({ pinnedPoints });
    }
  }

  /**
   * Toggle pin hidden state
   */
  togglePinHidden(pin) {
    const state = this.model.getState();
    const pinnedPoints = [...state.pinnedPoints];
    
    const target = pinnedPoints.find(p => 
      p.seriesId === pin.seriesId && 
      p.relMicro === pin.relMicro && 
      p.val === pin.val
    );
    
    if (target) {
      target.hidden = !target.hidden;
      this.model._updateState({ pinnedPoints });
    }
  }

  /**
   * Rename a pin
   */
  renamePin(pin, newName) {
    const state = this.model.getState();
    const pinnedPoints = [...state.pinnedPoints];
    
    const target = pinnedPoints.find(p => 
      p.seriesId === pin.seriesId && 
      p.relMicro === pin.relMicro && 
      p.val === pin.val
    );
    
    if (target) {
      const label = String(newName || '');
      target.label = label;
      
      // Update source point if present
      if (target.sourcePoint && typeof target.sourcePoint === 'object') {
        try {
          target.sourcePoint.label = label;
        } catch (e) {
          // Best effort
        }
      }
      
      this.model._updateState({ 
        pinnedPoints,
        status: '已重命名标记'
      });
    }
  }

  /**
   * Delete a pin
   */
  deletePin(pin) {
    this.model.removePinned(pin);
  }

  /**
   * Jump to pin location
   */
  jumpToPin(pin) {
    this.model.jumpToPin(pin);
  }

  /**
   * Select all pins
   */
  selectAll() {
    const state = this.model.getState();
    const pinnedPoints = [...state.pinnedPoints];
    
    for (const p of pinnedPoints) {
      p.selected = true;
    }
    
    this.model._updateState({ 
      pinnedPoints,
      status: `已全选 ${pinnedPoints.length} 个标记`
    });
  }

  /**
   * Delete selected pins
   */
  deleteSelected() {
    const state = this.model.getState();
    const toDelete = state.pinnedPoints.filter(p => p.selected);
    
    if (toDelete.length === 0) {
      this.model._updateState({ status: '未选中任何标记' });
      return 0;
    }
    
    for (const p of toDelete) {
      this.model.removePinned(p);
    }
    
    this.model._updateState({ status: `已删除 ${toDelete.length} 个标记` });
    return toDelete.length;
  }

  /**
   * Clear selection
   */
  clearSelection() {
    const state = this.model.getState();
    const pinnedPoints = [...state.pinnedPoints];
    
    for (const p of pinnedPoints) {
      p.selected = false;
    }
    
    this.model._updateState({ pinnedPoints });
  }

  /**
   * Update filter
   */
  setFilter(filter) {
    this.state.set({ filter });
  }

  /**
   * Toggle group by
   */
  setGroupBy(enabled) {
    this.state.set({ groupBy: enabled });
  }

  /**
   * Set sort order
   */
  setSortBy(sortBy) {
    this.state.set({ sortBy });
  }

  /**
   * Export pinned points as CSV
   */
  exportPinnedCSV() {
    return this.model.exportPinnedCSV();
  }
}
