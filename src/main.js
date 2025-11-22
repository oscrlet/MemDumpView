/**
 * Main application orchestrator
 */

import { Sidebar } from './components/Sidebar.js';
import { Chart } from './components/Chart.js';
import { PinnedList } from './components/PinnedList.js';
import { formatNumber } from './utils/format.js';

class App {
  constructor() {
    this.sidebar = null;
    this.chart = null;
    this.pinnedList = null;
    this.tooltip = null;
    this.dropOverlay = null;
    
    this.init();
  }

  init() {
    // Initialize components
    this.sidebar = new Sidebar(document.getElementById('sidebar'));
    this.chart = new Chart(document.getElementById('chart'));
    this.pinnedList = new PinnedList(document.getElementById('pinned-list'));
    
    this.tooltip = document.getElementById('tooltip');
    this.dropOverlay = document.getElementById('drop-overlay');
    
    // Wire up sidebar events
    this.sidebar.on('loadFile', () => this.handleLoadFile());
    this.sidebar.on('loadSample', () => this.handleLoadSample());
    this.sidebar.on('resample', () => this.handleResample());
    this.sidebar.on('resetView', () => this.handleResetView());
    this.sidebar.on('exportPNG', () => this.handleExportPNG());
    this.sidebar.on('exportCSV', () => this.handleExportCSV());
    
    // Wire up chart events
    this.chart.on('status', (data) => this.handleChartStatus(data));
    this.chart.on('seriesChanged', (data) => this.handleSeriesChanged(data));
    this.chart.on('pinnedChanged', (data) => this.handlePinnedChanged(data));
    this.chart.on('resampled', (data) => this.handleResampled(data));
    this.chart.on('hover', (data) => this.handleHover(data));
    
    // Wire up pinned list events
    this.pinnedList.on('jumpToPin', (index) => this.chart.jumpToPin(index));
    this.pinnedList.on('clearAll', () => this.handleClearPinned());
    
    // Set up global event listeners
    this.setupGlobalEvents();
    
    // Try loading sample files
    this.tryLoadSampleFile();
  }

  setupGlobalEvents() {
    // Drag and drop
    document.body.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropOverlay.classList.add('active');
    });
    
    document.body.addEventListener('dragleave', (e) => {
      if (e.target === document.body) {
        this.dropOverlay.classList.remove('active');
      }
    });
    
    document.body.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropOverlay.classList.remove('active');
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.loadFile(files[0]);
      }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      this.chart.handleKeyEvent(e);
    });
  }

  handleLoadFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt,.log';
    
    input.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.loadFile(e.target.files[0]);
      }
    });
    
    input.click();
  }

  async loadFile(file) {
    this.sidebar.updateFileInfo(`Loading ${file.name}...`);
    const success = await this.chart.loadFile(file);
    
    if (success) {
      this.sidebar.updateFileInfo(`Loaded: ${file.name}`);
      this.sidebar.enableControls(true);
    } else {
      this.sidebar.updateFileInfo('Failed to load file');
      this.sidebar.enableControls(false);
    }
  }

  async handleLoadSample() {
    // Try to fetch sample files
    const sampleFiles = ['sample1.csv', 'sample2.csv'];
    
    for (const filename of sampleFiles) {
      try {
        const response = await fetch(`/${filename}`);
        if (response.ok) {
          const text = await response.text();
          const blob = new Blob([text], { type: 'text/csv' });
          const file = new File([blob], filename, { type: 'text/csv' });
          await this.loadFile(file);
          return;
        }
      } catch (error) {
        console.log(`Sample file ${filename} not found`);
      }
    }
    
    this.sidebar.updateFileInfo('No sample files available. Use "Load CSV File" to upload your own.');
  }

  async tryLoadSampleFile() {
    // Silently try to load sample file on startup
    const sampleFiles = ['sample1.csv', 'sample2.csv'];
    
    for (const filename of sampleFiles) {
      try {
        const response = await fetch(`/${filename}`);
        if (response.ok) {
          const text = await response.text();
          const blob = new Blob([text], { type: 'text/csv' });
          const file = new File([blob], filename, { type: 'text/csv' });
          await this.loadFile(file);
          return;
        }
      } catch (error) {
        // Silently fail
      }
    }
  }

  handleResample() {
    this.chart.resampleInViewAndRender(1000);
  }

  handleResetView() {
    this.chart.resetView();
  }

  handleExportPNG() {
    this.chart.exportPNG();
  }

  handleExportCSV() {
    this.chart.exportPinnedCSV();
  }

  handleClearPinned() {
    this.chart.clearPinned();
  }

  handleChartStatus(data) {
    this.sidebar.updateFileInfo(data.message);
    this.sidebar.updateProgress(data.progress);
  }

  handleSeriesChanged(data) {
    this.sidebar.updateDataInfo(
      `Data loaded: ${formatNumber(data.pointCount)} points`
    );
  }

  handlePinnedChanged(data) {
    this.pinnedList.setPinnedPoints(data.points);
  }

  handleResampled(data) {
    this.sidebar.updateDataInfo(
      `Resampled: ${formatNumber(data.original)} → ${formatNumber(data.resampled)} points`
    );
  }

  handleHover(data) {
    if (data) {
      const rect = this.chart.canvas.getBoundingClientRect();
      
      // Position tooltip
      let left = data.screenX + 10;
      let top = data.screenY - 30;
      
      // Clamp to chart area
      const tooltipWidth = 150; // Approximate
      const tooltipHeight = 40;
      
      if (left + tooltipWidth > rect.width) {
        left = data.screenX - tooltipWidth - 10;
      }
      if (top < 0) {
        top = data.screenY + 10;
      }
      
      this.tooltip.style.left = `${left}px`;
      this.tooltip.style.top = `${top}px`;
      this.tooltip.textContent = `x: ${data.point.x.toFixed(2)}, y: ${data.point.y.toFixed(2)}`;
      this.tooltip.classList.add('visible');
    } else {
      this.tooltip.classList.remove('visible');
    }
  }
}

// Start the app
new App();
