/**
 * PinnedListViewModel: Provides commands for pinned list interactions.
 * Manages pinned points state and operations.
 */
export class PinnedListViewModel {
  constructor(chartModel) {
    this.model = chartModel;
  }

  // ========== Getters ==========
  getPinnedPoints() {
    return this.model.pinnedPoints;
  }

  // ========== Commands: Pin Selection ==========
  togglePinSelection(pin) {
    pin.selected = !pin.selected;
    this.model._emit('pinnedChanged', this.model.pinnedPoints);
  }

  selectAllPins() {
    if (!this.model.pinnedPoints || this.model.pinnedPoints.length === 0) {
      this.model.setStatus('没有标记点可供选择');
      return false;
    }
    
    for (const p of this.model.pinnedPoints) {
      p.selected = true;
    }
    this.model._emit('pinnedChanged', this.model.pinnedPoints);
    this.model.setStatus(`已全选 ${this.model.pinnedPoints.length} 个标记`);
    return true;
  }

  deleteSelectedPins() {
    if (!this.model.pinnedPoints || this.model.pinnedPoints.length === 0) {
      this.model.setStatus('没有标记点可供删除');
      return false;
    }
    
    const toDelete = this.model.pinnedPoints.filter(p => p.selected);
    if (toDelete.length === 0) {
      this.model.setStatus('未选中任何标记');
      return false;
    }
    
    // Create new array without selected pins
    this.model.pinnedPoints = this.model.pinnedPoints.filter(p => !p.selected);
    this.model._emit('pinnedChanged', this.model.pinnedPoints);
    this.model.setStatus(`已删除 ${toDelete.length} 个标记`);
    return true;
  }

  // ========== Commands: Pin Operations ==========
  deletePin(pin) {
    this.model.removePinned(pin);
  }

  togglePinHidden(pin) {
    pin.hidden = !pin.hidden;
    this.model._emit('pinnedChanged', this.model.pinnedPoints);
    this.model.setStatus(`标记 ${pin.seriesName} ${(pin.relMicro/1e6).toFixed(3)}s 已${pin.hidden ? '隐藏' : '显示'}`);
  }

  renamePin(pin, newName) {
    const label = String(newName || '');
    pin.label = label;
    
    // If pin is linked to a source point object, update that object's label for export sync
    if (pin.sourcePoint && typeof pin.sourcePoint === 'object') {
      try {
        pin.sourcePoint.label = label;
      } catch (e) {
        // best-effort
      }
    }
    
    this.model._emit('pinnedChanged', this.model.pinnedPoints);
    this.model.setStatus('已重命名标记');
  }

  jumpToPin(pin) {
    this.model.jumpToPin(pin);
    this.model.setStatus(`跳转到 ${pin.seriesName}`);
  }

  // ========== Getters ==========
  getModel() {
    return this.model;
  }
}
