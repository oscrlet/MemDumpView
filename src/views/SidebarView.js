import { svgIcon } from "../components/base/ComponentBase.js";

/**
 * SidebarView: Pure view for sidebar UI
 * Uses SidebarViewModel for all data and commands
 */
export class SidebarView {
  constructor(viewModel, container) {
    this.viewModel = viewModel;
    this.container = container;
    this._refs = {};
    
    // Callbacks to be set by consumer
    this.onExportPNG = null;
    
    this._render();
    this._attach();
    
    // Subscribe to ViewModel state changes
    this.viewModel.subscribe(state => {
      this._updateLegend();
      this._updateSeriesCount();
    });
  }

  _render() {
    this.container.innerHTML = `
      <div class="box" aria-label="交互">
        <strong>交互</strong>
        <button id="openFile" class="card-btn"><span class="icon">${svgIcon('open')}</span><span>打开文件</span></button>
        <button id="exportPng" class="card-btn"><span class="icon">${svgIcon('png')}</span><span>导出 PNG</span></button>
        <button id="exportCsv" class="card-btn"><span class="icon">${svgIcon('csv')}</span><span>导出 CSV</span></button>
        <button id="exportPinned" class="card-btn"><span class="icon">${svgIcon('pinned')}</span><span>导出 标记CSV</span></button>
        <button id="clearAll" class="card-btn"><span class="icon">${svgIcon('clear')}</span><span>清除 所有</span></button>
      </div>
      <div class="box stretch" aria-label="当前文件">
        <div class="card-header"><strong>当前文件</strong></div>
        <div class="card-content" style="padding-top:8px;">
          <div id="legend" class="legend"></div>
          <div class="small series-count" style="margin-top:8px">已加载: <span id="seriesCount">0</span></div>
        </div>
      </div>
    `;
    
    this._refs = {
      openFile: this.container.querySelector('#openFile'),
      exportPng: this.container.querySelector('#exportPng'),
      exportCsv: this.container.querySelector('#exportCsv'),
      exportPinned: this.container.querySelector('#exportPinned'),
      clearAll: this.container.querySelector('#clearAll'),
      legend: this.container.querySelector('#legend'),
      seriesCount: this.container.querySelector('#seriesCount')
    };
  }

  _attach() {
    // Open file
    this._refs.openFile.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,text/csv,text/plain,.json,application/json';
      input.multiple = true;
      input.style.display = 'none';
      
      input.addEventListener('change', async (ev) => {
        const files = Array.from(ev.target.files || []);
        if (files.length === 0) return;
        await this.viewModel.openFiles(files);
      });
      
      document.body.appendChild(input);
      input.click();
      setTimeout(() => input.remove(), 3000);
    });

    // Export PNG (delegate to callback)
    this._refs.exportPng.addEventListener('click', () => {
      if (this.onExportPNG) this.onExportPNG();
    });

    // Export CSV
    this._refs.exportCsv.addEventListener('click', () => {
      const blob = this.viewModel.exportCSV();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sampled.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    // Export pinned CSV
    this._refs.exportPinned.addEventListener('click', () => {
      const blob = this.viewModel.exportPinnedCSV();
      if (!blob) {
        alert('没有任何标记点可导出');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pinned.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    // Clear all
    this._refs.clearAll.addEventListener('click', () => {
      this.viewModel.clearAll();
    });
  }

  _updateLegend() {
    const seriesList = this.viewModel.getSeriesList();
    const el = this._refs.legend;
    el.innerHTML = '';
    
    if (!seriesList || seriesList.length === 0) return;

    seriesList.forEach(s => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.style.opacity = s.visible ? '1' : '0.45';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      item.style.minWidth = '0';
      item.innerHTML = `<span style="width:14px;height:14px;display:inline-block;border-radius:3px;background:${s.color}"></span><span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.name}</span>`;

      // Click to toggle visibility
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.viewModel.toggleSeriesVisibility(s);
      });

      // Hover effects
      item.addEventListener('mouseenter', () => {
        item.style.transform = 'translateY(-3px)';
        item.style.boxShadow = 'var(--shadow-subtle)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.transform = '';
        item.style.boxShadow = '';
      });

      el.appendChild(item);
    });
  }

  _updateSeriesCount() {
    const state = this.viewModel.getState();
    this._refs.seriesCount.textContent = state.seriesCount || 0;
  }
}
