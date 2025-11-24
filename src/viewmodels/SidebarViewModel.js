/**
 * SidebarViewModel: Provides commands for sidebar interactions.
 * Wraps ChartModel commands for sidebar UI operations.
 */
export class SidebarViewModel {
  constructor(chartModel) {
    this.model = chartModel;
  }

  // ========== Commands: File Operations ==========
  async openFile(files) {
    if (!files || files.length === 0) {
      this.model.setStatus('未选择文件');
      return false;
    }
    
    this.model.setStatus('开始解析文件...', true);
    for (const file of files) {
      await this.model.loadFile(file);
    }
    return true;
  }

  // ========== Commands: Export Operations ==========
  exportPNG(exportFn) {
    // exportFn is provided by the view (ChartView.exportPNG)
    return exportFn ? exportFn() : null;
  }

  exportCSV() {
    const arr = [];
    for (const s of this.model.seriesList) {
      const arrPts = s.sampled && s.sampled.length ? s.sampled : s.rel;
      if (!arrPts) continue;
      for (const p of arrPts) {
        arr.push(`${JSON.stringify(s.name)},${p[0]},${p[1]}`);
      }
    }
    const out = 'series,rel_us,value\n' + arr.join('\n');
    return new Blob([out], { type: 'text/csv;charset=utf-8;' });
  }

  exportPinnedCSV() {
    const blob = this.model.exportPinnedCSV();
    if (!blob) {
      this.model.setStatus('没有任何标记点可导出');
      return null;
    }
    return blob;
  }

  // ========== Commands: View Management ==========
  clearAll() {
    this.model.seriesList = [];
    this.model.clearPinned();
    this.model.resampleInView();
    this.model.setStatus('已清除所有序列及标记');
  }

  autoFit() {
    this.model.resampleInView();
    this.model.setStatus('已自动适配像素');
  }

  zoomReset() {
    const ext = this.model.computeGlobalExtents();
    this.model.viewMinX = 0;
    this.model.viewMaxX = ext.max;
    this.model.resampleInView();
    this.model.setStatus('视窗已重置');
  }

  resetOriginal() {
    if (!this.model.originalViewSet) {
      this.model.setStatus('尚未记录初始视窗');
      return false;
    }
    this.model.viewMinX = this.model.originalViewMin;
    this.model.viewMaxX = this.model.originalViewMax;
    this.model.resampleInView();
    this.model.setStatus('已恢复到初始视窗');
    return true;
  }

  fitAll() {
    const ext = this.model.computeGlobalExtents();
    this.model.viewMinX = 0;
    this.model.viewMaxX = ext.max;
    this.model.resampleInView();
    this.model.setStatus('已适配所有数据');
  }

  // ========== Commands: Sample Target ==========
  setSampleTarget(value) {
    this.model.setSampleTarget(value);
  }

  // ========== Commands: Legend Toggle ==========
  toggleSeriesVisibility(series) {
    series.visible = !series.visible;
    this.model.resampleInView();
    this.model.setStatus(`${series.name} 已${series.visible ? '显示' : '隐藏'}`);
    // Trigger series changed event
    this.model._emit('seriesChanged', this.model.seriesList);
    return series.visible;
  }

  // ========== Getters ==========
  getSeriesList() {
    return this.model.seriesList;
  }

  getModel() {
    return this.model;
  }
}
