/**
 * Main application entry point
 * Orchestrates the sidebar, chart, and pinned list components
 */

import { Sidebar } from './components/Sidebar.js';
import { Chart } from './components/Chart.js';
import { PinnedList } from './components/PinnedList.js';

// Global state
const appState = {
  pinnedPoints: [],
  currentFile: null,
  samplingAlgorithm: 'lttb',
  targetPoints: 1000
};

// Initialize components
const sidebar = new Sidebar('sidebar');
const chart = new Chart('chart-container');
const pinnedList = new PinnedList('pinned-container');

/**
 * Initialize the application
 */
function init() {
  // Render sidebar
  sidebar.render();

  // Setup drag and drop
  setupDragAndDrop();

  // Setup component event handlers
  setupSidebarHandlers();
  setupChartHandlers();
  setupPinnedListHandlers();

  // Setup keyboard shortcuts
  setupKeyboardShortcuts();

  // Try to load sample files
  tryLoadSampleFiles();
}

/**
 * Setup drag and drop functionality
 */
function setupDragAndDrop() {
  const dropOverlay = document.getElementById('drop-overlay');
  const chartContainer = document.getElementById('chart-container');

  if (!dropOverlay || !chartContainer) return;

  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Show overlay on drag enter
  ['dragenter', 'dragover'].forEach(eventName => {
    chartContainer.addEventListener(eventName, () => {
      dropOverlay.classList.remove('hidden');
    }, false);
  });

  // Hide overlay on drag leave
  ['dragleave', 'drop'].forEach(eventName => {
    chartContainer.addEventListener(eventName, () => {
      dropOverlay.classList.add('hidden');
    }, false);
  });

  // Handle drop
  chartContainer.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, false);
}

/**
 * Setup sidebar event handlers
 */
function setupSidebarHandlers() {
  // File selected
  sidebar.on('fileSelected', (file) => {
    handleFileUpload(file);
  });

  // Sampling algorithm changed
  sidebar.on('algorithmChanged', (algorithm) => {
    appState.samplingAlgorithm = algorithm;
  });

  // Target points changed
  sidebar.on('targetPointsChanged', (targetPoints) => {
    appState.targetPoints = targetPoints;
  });

  // Apply sampling
  sidebar.on('applySampling', (config) => {
    chart.resampleInViewAndRender(config.algorithm, config.targetPoints);
    updateDataInfo();
  });

  // Toggle original
  sidebar.on('toggleOriginal', (showOriginal) => {
    if (showOriginal) {
      chart.state.displayData = chart.state.originalData;
    } else {
      chart.resampleInViewAndRender();
    }
    chart.render();
    updateDataInfo();
  });

  // Export PNG
  sidebar.on('exportPNG', () => {
    chart.exportPNG();
  });

  // Export CSV
  sidebar.on('exportCSV', () => {
    chart.exportPinnedCSV(appState.pinnedPoints);
  });

  // Clear pinned
  sidebar.on('clearPinned', () => {
    appState.pinnedPoints = [];
    pinnedList.clearAll();
    chart.clearPinned();
    updateDataInfo();
  });
}

/**
 * Setup chart event handlers
 */
function setupChartHandlers() {
  // Status updates
  chart.on('status', (status) => {
    if (status.message === 'loaded') {
      sidebar.updateStatus(`Loaded ${status.pointCount} points`, 'success');
      updateDataInfo();
    } else if (status.message === 'error') {
      sidebar.updateStatus(`Error: ${status.error.message}`, 'error');
    }
  });

  // Series changed
  chart.on('seriesChanged', (data) => {
    updateDataInfo();
  });

  // Point pinned
  chart.on('pinnedChanged', (event) => {
    if (event.action === 'add') {
      appState.pinnedPoints.push(event.point);
      pinnedList.addPin(event.point);
    } else if (event.action === 'clear') {
      appState.pinnedPoints = [];
      pinnedList.clearAll();
    }
    updateDataInfo();
  });

  // Resampled
  chart.on('resampled', (info) => {
    sidebar.updateStatus(
      `Resampled: ${info.original} → ${info.sampled} points`,
      'info'
    );
  });

  // Hover
  chart.on('hover', (point) => {
    // Could show additional info in sidebar
  });

  // Selection changed
  chart.on('selectionChanged', (selected) => {
    if (selected.length > 0) {
      sidebar.updateStatus(`Selected ${selected.length} points`, 'info');
    }
  });
}

/**
 * Setup pinned list event handlers
 */
function setupPinnedListHandlers() {
  // Pin removed
  pinnedList.on('pinRemoved', (pin) => {
    const index = appState.pinnedPoints.findIndex(p => p.id === pin.id);
    if (index !== -1) {
      appState.pinnedPoints.splice(index, 1);
    }
    updateDataInfo();
  });

  // All pins cleared
  pinnedList.on('allPinsCleared', () => {
    appState.pinnedPoints = [];
    chart.clearPinned();
    updateDataInfo();
  });

  // Jump to pin
  pinnedList.on('jumpToPin', (pin) => {
    chart.jumpToPin(pin);
  });

  // Pin hover
  pinnedList.on('pinHover', (pin) => {
    // Could highlight point on chart
  });
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    chart.handleKeyEvent(e);
  });
}

/**
 * Handle file upload
 */
async function handleFileUpload(file) {
  if (!file) return;

  // Validate file type
  const validExtensions = ['.csv', '.txt', '.log'];
  const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  
  if (!validExtensions.includes(extension)) {
    sidebar.updateStatus(
      `Invalid file type. Please upload ${validExtensions.join(', ')} files.`,
      'error'
    );
    return;
  }

  appState.currentFile = file;
  await chart.loadFile(file);
}

/**
 * Update data info in sidebar
 */
function updateDataInfo() {
  const info = {
    seriesCount: chart.state.series.length || 1,
    totalPoints: chart.state.originalData.length,
    sampledPoints: chart.state.displayData.length,
    pinnedCount: appState.pinnedPoints.length
  };

  sidebar.updateDataInfo(info);
}

/**
 * Try to load sample files if they exist
 */
async function tryLoadSampleFiles() {
  const sampleFiles = ['sample1.csv', 'sample2.csv'];
  
  for (const filename of sampleFiles) {
    try {
      const response = await fetch(`/${filename}`);
      if (response.ok) {
        const text = await response.text();
        const blob = new Blob([text], { type: 'text/csv' });
        const file = new File([blob], filename, { type: 'text/csv' });
        
        // Only load the first available sample
        sidebar.updateStatus(`Sample file "${filename}" available. Upload a file to get started.`, 'info');
        break;
      }
    } catch (error) {
      // Silently fail - sample files are optional
    }
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for debugging
window.app = {
  sidebar,
  chart,
  pinnedList,
  state: appState
};
