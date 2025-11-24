import { makeColors } from "../utils/lttb.js";

function svgIcon(name) {
  // Inline SVG icons (reused from original Sidebar.js)
  switch (name) {
    case 'open': return `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 7a2 2 0 0 1 2-2h3l2 2h6a2 2 0 0 1 2 2v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'png': return `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 12h10M7 8h10M7 16h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    case 'csv': return `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    case 'pinned': return `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2v7M9 11l-3 9 6-4 6 4-3-9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'clear': return `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18M8 6v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6M10 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    default: return '';
  }
}

/**
 * SidebarView: Pure view for sidebar UI.
 * Uses SidebarViewModel for commands.
 */
export class SidebarView {
  constructor(viewModel, container, exportPNGFn) {
    this.viewModel = viewModel;
    this.model = viewModel.getModel();
    this.container = container;
    this.exportPNGFn = exportPNGFn; // Function to call ChartView.exportPNG
    
    this._render();
    
    // Subscribe to model events
    this.model.on('seriesChanged', (series) => this.updateLegend(series));
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
    
    this._attach();
  }

  _attach() {
    this._refs.openFile.addEventListener('click', () => this._onOpenFile());
    this._refs.exportPng.addEventListener('click', () => this._onExportPNG());
    this._refs.exportCsv.addEventListener('click', () => this._onExportCSV());
    this._refs.exportPinned.addEventListener('click', () => this._onExportPinned());
    this._refs.clearAll.addEventListener('click', () => this._onClearAll());
  }

  async _onOpenFile() {
    const fi = document.createElement('input');
    fi.type = 'file';
    fi.accept = '.csv,text/csv,text/plain,.json,application/json';
    fi.multiple = true;
    fi.style.display = 'none';
    
    fi.addEventListener('change', async (ev) => {
      const files = Array.from(ev.target.files || []);
      await this.viewModel.openFile(files);
    });
    
    document.body.appendChild(fi);
    fi.click();
    setTimeout(() => fi.remove(), 3000);
  }

  async _onExportPNG() {
    const blob = await this.viewModel.exportPNG(this.exportPNGFn);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chart.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  _onExportCSV() {
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
  }

  _onExportPinned() {
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
  }

  _onClearAll() {
    this.viewModel.clearAll();
    this.updateLegend([]);
  }

  updateLegend(seriesList) {
    const el = this._refs.legend;
    el.innerHTML = '';
    if (!seriesList) return;
    
    const colors = makeColors(seriesList.length);
    seriesList.forEach((s, i) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.style.opacity = s.visible ? '1' : '0.45';
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '8px';
      item.style.minWidth = '0';
      item.innerHTML = `<span style="width:14px;height:14px;display:inline-block;border-radius:3px;background:${s.color || colors[i]}"></span><span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.name}</span>`;

      // Click toggles visibility
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const newVisibility = this.viewModel.toggleSeriesVisibility(s);
        item.style.opacity = newVisibility ? '1' : '0.45';
      });

      // Hover highlight
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
    
    this._refs.seriesCount.textContent = seriesList.length;
  }
}
