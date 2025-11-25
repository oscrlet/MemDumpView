import { makeColors } from "../utils/lttb.js";
import sidebarTemplate from "../templates/sidebar.html?raw";

export class Sidebar {
  constructor(container) {
    this.el = container;
    this.onOpenFile = () => {};
    this.onExportPNG = () => {};
    this.onExportCSV = () => {};
    this.onExportPinned = () => {};
    this.onClearAll = () => {};
    this.onAutoFit = () => {};
    this.onZoomReset = () => {};
    this.onResetOriginal = () => {};
    this.onFitAll = () => {};
    this.onTargetChange = () => {};
    this.legendClick = () => {};
    this._render();
  }

  _render() {
    // use external template
    this.el.innerHTML = sidebarTemplate;
    this._refs = {
      openFile: this.el.querySelector('#openFile'),
      exportPng: this.el.querySelector('#exportPng'),
      exportCsv: this.el.querySelector('#exportCsv'),
      exportPinned: this.el.querySelector('#exportPinned'),
      clearAll: this.el.querySelector('#clearAll'),
      legend: this.el.querySelector('#legend'),
      seriesCount: this.el.querySelector('#seriesCount')
    };
    this._attach();
  }

  _attach() {
    this._refs.openFile.addEventListener('click', () => this.onOpenFile());
    this._refs.exportPng.addEventListener('click', () => this.onExportPNG());
    this._refs.exportCsv.addEventListener('click', () => this.onExportCSV());
    this._refs.exportPinned.addEventListener('click', () => this.onExportPinned());
    this._refs.clearAll.addEventListener('click', () => this.onClearAll());
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

      // click toggles visibility via provided callback (main app should set sidebar.legendClick)
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        item.style.opacity = (s.visible ? '0.45' : '1');
        this.legendClick(s);
      });

      // explicit hover highlight
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