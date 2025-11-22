/**
 * Sidebar component - DOM-only with event hooks
 */

export class Sidebar {
  constructor(container) {
    this.container = container;
    this.eventHandlers = {};
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="section">
        <h2>Data Loading</h2>
        <button class="card-btn" id="load-file-btn">Load CSV File</button>
        <button class="card-btn" id="load-sample-btn">Load Sample Data</button>
        <div class="info-text" id="file-info"></div>
        <div class="progress-bar" id="progress-bar" style="display: none;">
          <div class="progress-fill" id="progress-fill" style="width: 0%"></div>
        </div>
      </div>

      <div class="section">
        <h2>View Controls</h2>
        <button class="card-btn" id="resample-btn" disabled>Resample (1000 pts)</button>
        <button class="card-btn" id="reset-view-btn" disabled>Reset View</button>
        <button class="card-btn" id="export-png-btn" disabled>Export PNG</button>
        <button class="card-btn" id="export-csv-btn" disabled>Export Pinned CSV</button>
      </div>

      <div class="section">
        <h2>Info</h2>
        <div class="info-text" id="data-info">
          No data loaded
        </div>
      </div>

      <div class="section">
        <h2>Keyboard Shortcuts</h2>
        <div class="info-text">
          <strong>a/d:</strong> Previous/Next pin<br>
          <strong>w/s:</strong> Pan view<br>
          <strong>q:</strong> Zoom out<br>
          <strong>Esc:</strong> Cancel selection<br>
          <strong>Del:</strong> Clear last pin
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const loadFileBtn = this.container.querySelector('#load-file-btn');
    const loadSampleBtn = this.container.querySelector('#load-sample-btn');
    const resampleBtn = this.container.querySelector('#resample-btn');
    const resetViewBtn = this.container.querySelector('#reset-view-btn');
    const exportPngBtn = this.container.querySelector('#export-png-btn');
    const exportCsvBtn = this.container.querySelector('#export-csv-btn');

    loadFileBtn.addEventListener('click', () => this.emit('loadFile'));
    loadSampleBtn.addEventListener('click', () => this.emit('loadSample'));
    resampleBtn.addEventListener('click', () => this.emit('resample'));
    resetViewBtn.addEventListener('click', () => this.emit('resetView'));
    exportPngBtn.addEventListener('click', () => this.emit('exportPNG'));
    exportCsvBtn.addEventListener('click', () => this.emit('exportCSV'));
  }

  on(event, handler) {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(handler);
  }

  emit(event, data) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(handler => handler(data));
    }
  }

  updateProgress(progress) {
    const progressBar = this.container.querySelector('#progress-bar');
    const progressFill = this.container.querySelector('#progress-fill');
    
    if (progress > 0 && progress < 1) {
      progressBar.style.display = 'block';
      progressFill.style.width = `${progress * 100}%`;
    } else {
      progressBar.style.display = 'none';
      progressFill.style.width = '0%';
    }
  }

  updateFileInfo(text) {
    const fileInfo = this.container.querySelector('#file-info');
    fileInfo.textContent = text;
  }

  updateDataInfo(text) {
    const dataInfo = this.container.querySelector('#data-info');
    dataInfo.textContent = text;
  }

  enableControls(enable) {
    const buttons = [
      '#resample-btn',
      '#reset-view-btn',
      '#export-png-btn',
      '#export-csv-btn'
    ];
    
    buttons.forEach(selector => {
      const btn = this.container.querySelector(selector);
      if (btn) {
        btn.disabled = !enable;
      }
    });
  }
}
