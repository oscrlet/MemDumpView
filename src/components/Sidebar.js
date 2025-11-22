/**
 * Sidebar component - manages the control panel UI
 */

export class Sidebar {
  constructor(container) {
    this.container = typeof container === 'string' 
      ? document.getElementById(container)
      : container;
    
    this.callbacks = {};
    this.state = {
      filename: '',
      status: '',
      samplingAlgorithm: 'lttb',
      targetPoints: 1000,
      showOriginal: false
    };
  }

  /**
   * Register event callback
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    this.callbacks[event] = callback;
  }

  /**
   * Emit event to registered callback
   */
  emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event](data);
    }
  }

  /**
   * Render the sidebar UI
   */
  render() {
    this.container.innerHTML = `
      <div class="sidebar-section">
        <h2>Data Loading</h2>
        <div class="form-group">
          <input 
            type="file" 
            id="file-input" 
            class="form-input" 
            accept=".csv,.txt,.log"
          />
          <label for="file-input" class="form-label">Select CSV file</label>
        </div>
        <div id="file-status" class="mt-1"></div>
      </div>

      <div class="sidebar-section">
        <h2>Sampling</h2>
        <div class="form-group">
          <label for="algorithm-select" class="form-label">Algorithm</label>
          <select id="algorithm-select" class="form-select">
            <option value="lttb" selected>LTTB (Recommended)</option>
            <option value="bucket">Bucket Min/Max</option>
            <option value="none">No Sampling</option>
          </select>
        </div>
        <div class="form-group">
          <label for="target-points" class="form-label">Target Points</label>
          <input 
            type="number" 
            id="target-points" 
            class="form-input"
            min="100"
            max="10000"
            step="100"
            value="1000"
          />
        </div>
        <button id="apply-sampling-btn" class="btn btn-primary" style="width: 100%;">
          Apply Sampling
        </button>
        <button id="toggle-original-btn" class="btn btn-outline mt-1" style="width: 100%;">
          Show Original
        </button>
      </div>

      <div class="sidebar-section">
        <h2>Export</h2>
        <div class="flex flex-col gap-1">
          <button id="export-png-btn" class="btn btn-secondary">
            Export as PNG
          </button>
          <button id="export-csv-btn" class="btn btn-secondary">
            Export Pinned CSV
          </button>
          <button id="clear-pinned-btn" class="btn btn-danger">
            Clear All Pinned
          </button>
        </div>
      </div>

      <div class="sidebar-section">
        <h2>Info</h2>
        <div class="card">
          <div class="card-content" id="data-info">
            <div>No data loaded</div>
          </div>
        </div>
      </div>

      <div class="sidebar-section">
        <h3>Keyboard Shortcuts</h3>
        <div class="card">
          <div class="card-content" style="font-size: 0.75rem;">
            <div><strong>P</strong>: Pin tooltip</div>
            <div><strong>Esc</strong>: Close pinned tooltips</div>
            <div><strong>Arrow Keys</strong>: Navigate pins</div>
            <div><strong>Delete</strong>: Remove pin</div>
            <div><strong>+/-</strong>: Zoom in/out</div>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Attach event listeners to sidebar elements
   */
  attachEventListeners() {
    // File input
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.state.filename = file.name;
          this.updateStatus(`Loading ${file.name}...`, 'info');
          this.emit('fileSelected', file);
        }
      });
    }

    // Algorithm select
    const algorithmSelect = document.getElementById('algorithm-select');
    if (algorithmSelect) {
      algorithmSelect.addEventListener('change', (e) => {
        this.state.samplingAlgorithm = e.target.value;
        this.emit('algorithmChanged', e.target.value);
      });
    }

    // Target points input
    const targetPointsInput = document.getElementById('target-points');
    if (targetPointsInput) {
      targetPointsInput.addEventListener('change', (e) => {
        this.state.targetPoints = parseInt(e.target.value, 10);
        this.emit('targetPointsChanged', this.state.targetPoints);
      });
    }

    // Apply sampling button
    const applySamplingBtn = document.getElementById('apply-sampling-btn');
    if (applySamplingBtn) {
      applySamplingBtn.addEventListener('click', () => {
        this.emit('applySampling', {
          algorithm: this.state.samplingAlgorithm,
          targetPoints: this.state.targetPoints
        });
      });
    }

    // Toggle original button
    const toggleOriginalBtn = document.getElementById('toggle-original-btn');
    if (toggleOriginalBtn) {
      toggleOriginalBtn.addEventListener('click', () => {
        this.state.showOriginal = !this.state.showOriginal;
        toggleOriginalBtn.textContent = this.state.showOriginal 
          ? 'Show Sampled' 
          : 'Show Original';
        this.emit('toggleOriginal', this.state.showOriginal);
      });
    }

    // Export buttons
    const exportPngBtn = document.getElementById('export-png-btn');
    if (exportPngBtn) {
      exportPngBtn.addEventListener('click', () => {
        this.emit('exportPNG');
      });
    }

    const exportCsvBtn = document.getElementById('export-csv-btn');
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => {
        this.emit('exportCSV');
      });
    }

    const clearPinnedBtn = document.getElementById('clear-pinned-btn');
    if (clearPinnedBtn) {
      clearPinnedBtn.addEventListener('click', () => {
        this.emit('clearPinned');
      });
    }
  }

  /**
   * Update status message
   */
  updateStatus(message, type = 'info') {
    const statusEl = document.getElementById('file-status');
    if (statusEl) {
      statusEl.innerHTML = `
        <div class="status-message status-${type}">
          ${message}
        </div>
      `;
    }
  }

  /**
   * Update data info display
   */
  updateDataInfo(info) {
    const infoEl = document.getElementById('data-info');
    if (infoEl) {
      infoEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <div><strong>Series:</strong> ${info.seriesCount || 0}</div>
          <div><strong>Points:</strong> ${info.totalPoints || 0}</div>
          <div><strong>Sampled:</strong> ${info.sampledPoints || 0}</div>
          <div><strong>Pinned:</strong> ${info.pinnedCount || 0}</div>
        </div>
      `;
    }
  }

  /**
   * Set button enabled/disabled state
   */
  setButtonEnabled(buttonId, enabled) {
    const btn = document.getElementById(buttonId);
    if (btn) {
      btn.disabled = !enabled;
    }
  }
}
