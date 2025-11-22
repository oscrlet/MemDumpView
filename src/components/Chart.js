/**
 * Chart component - manages data visualization and interaction
 */

import { formatNumber, formatCoordinate } from '../utils/format.js';
import { downsampleLTTB, downsampleBucket } from '../utils/lttb.js';

export class Chart {
  constructor(container) {
    this.container = typeof container === 'string'
      ? document.getElementById(container)
      : container;
    
    this.callbacks = {};
    this.state = {
      series: [],
      originalData: [],
      displayData: [],
      extents: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      hoveredPoint: null,
      selectedPoints: [],
      tooltip: null,
      pinnedTooltips: [],
      isSelecting: false,
      selectionStart: null,
      samplingAlgorithm: 'lttb',
      targetPoints: 1000
    };

    this.canvas = null;
    this.ctx = null;
    this.tooltipEl = null;
    this.selectionRect = null;

    this.init();
  }

  /**
   * Initialize the chart
   */
  init() {
    this.createCanvas();
    this.attachEventListeners();
    this.showStatus('Drop a CSV file or use the sidebar to load data');
  }

  /**
   * Create canvas element
   */
  createCanvas() {
    this.container.innerHTML = `
      <canvas id="chart" style="width: 100%; height: 100%;"></canvas>
      <div id="chart-status" class="chart-status"></div>
    `;

    this.canvas = document.getElementById('chart');
    this.ctx = this.canvas.getContext('2d');
    
    // Set canvas size
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  /**
   * Resize canvas to match container
   */
  resizeCanvas() {
    if (!this.canvas) return;

    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    
    this.ctx.scale(dpr, dpr);
    
    // Redraw
    this.render();
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    if (!this.canvas) return;

    // Mouse events
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    this.canvas.addEventListener('click', this.handleClick.bind(this));
    this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));

    // Touch events for mobile
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));

    // Wheel event for zooming
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
  }

  /**
   * Register event callback
   */
  on(event, callback) {
    this.callbacks[event] = callback;
  }

  /**
   * Emit event
   */
  emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event](data);
    }
  }

  /**
   * Load data from file
   */
  async loadFile(file) {
    try {
      this.showStatus(`Loading ${file.name}...`);
      this.emit('status', { message: 'loading', file });

      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim());

      // Parse CSV data (simple parsing for now)
      const data = this.parseCSVData(lines);
      
      this.state.originalData = data;
      this.state.displayData = data;
      
      this.computeGlobalExtents();
      this.resampleInViewAndRender();
      
      this.showStatus(`Loaded ${data.length} points from ${file.name}`);
      this.emit('status', { message: 'loaded', pointCount: data.length });
      this.emit('seriesChanged', { data, extents: this.state.extents });
      
    } catch (error) {
      console.error('Error loading file:', error);
      this.showStatus(`Error loading file: ${error.message}`);
      this.emit('status', { message: 'error', error });
    }
  }

  /**
   * Parse CSV data
   */
  parseCSVData(lines) {
    const data = [];
    
    // Skip header if present
    const startIdx = lines[0].includes(',') && isNaN(parseFloat(lines[0].split(',')[0])) ? 1 : 0;
    
    for (let i = startIdx; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 2) {
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        
        if (!isNaN(x) && !isNaN(y)) {
          data.push({ x, y, index: data.length });
        }
      }
    }
    
    return data;
  }

  /**
   * Compute global data extents
   */
  computeGlobalExtents() {
    if (this.state.originalData.length === 0) {
      this.state.extents = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
      return;
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const point of this.state.originalData) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    // Add 5% padding
    const padX = (maxX - minX) * 0.05;
    const padY = (maxY - minY) * 0.05;

    this.state.extents = {
      minX: minX - padX,
      maxX: maxX + padX,
      minY: minY - padY,
      maxY: maxY + padY
    };
  }

  /**
   * Resample data and render
   */
  resampleInViewAndRender(algorithm = null, targetPoints = null) {
    if (algorithm) this.state.samplingAlgorithm = algorithm;
    if (targetPoints) this.state.targetPoints = targetPoints;

    const data = this.state.originalData;
    if (data.length === 0) return;

    // Apply downsampling
    if (this.state.samplingAlgorithm !== 'none' && data.length > this.state.targetPoints) {
      const xData = data.map(p => p.x);
      const yData = data.map(p => p.y);
      
      const samplingFunc = this.state.samplingAlgorithm === 'lttb' 
        ? downsampleLTTB 
        : downsampleBucket;
      
      const sampled = samplingFunc(xData, yData, this.state.targetPoints, new Set());
      
      this.state.displayData = sampled.x.map((x, i) => ({
        x,
        y: sampled.y[i],
        index: i
      }));
      
      this.emit('resampled', {
        original: data.length,
        sampled: this.state.displayData.length
      });
    } else {
      this.state.displayData = data;
    }

    this.render();
  }

  /**
   * Render the chart
   */
  render() {
    if (!this.ctx || !this.canvas) return;

    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);

    if (this.state.displayData.length === 0) {
      return;
    }

    // Draw axes
    this.drawAxes(width, height);

    // Draw data points
    this.drawData(width, height);

    // Draw selection rectangle if selecting
    if (this.state.isSelecting && this.selectionRect) {
      this.drawSelectionRect();
    }

    this.emit('rendered');
  }

  /**
   * Draw axes
   */
  drawAxes(width, height) {
    const padding = 60;
    
    this.ctx.strokeStyle = '#e2e8f0';
    this.ctx.lineWidth = 1;
    
    // Y axis
    this.ctx.beginPath();
    this.ctx.moveTo(padding, padding);
    this.ctx.lineTo(padding, height - padding);
    this.ctx.stroke();
    
    // X axis
    this.ctx.beginPath();
    this.ctx.moveTo(padding, height - padding);
    this.ctx.lineTo(width - padding, height - padding);
    this.ctx.stroke();

    // Draw labels
    this.ctx.fillStyle = '#475569';
    this.ctx.font = '12px sans-serif';
    this.ctx.textAlign = 'center';
    
    // X axis label
    this.ctx.fillText('X', width / 2, height - 20);
    
    // Y axis label
    this.ctx.save();
    this.ctx.translate(20, height / 2);
    this.ctx.rotate(-Math.PI / 2);
    this.ctx.fillText('Y', 0, 0);
    this.ctx.restore();
  }

  /**
   * Draw data points
   */
  drawData(width, height) {
    const padding = 60;
    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;

    const { minX, maxX, minY, maxY } = this.state.extents;
    const scaleX = plotWidth / (maxX - minX);
    const scaleY = plotHeight / (maxY - minY);

    // Draw lines
    this.ctx.strokeStyle = '#2563eb';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    for (let i = 0; i < this.state.displayData.length; i++) {
      const point = this.state.displayData[i];
      const x = padding + (point.x - minX) * scaleX;
      const y = height - padding - (point.y - minY) * scaleY;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    this.ctx.stroke();

    // Draw points
    this.ctx.fillStyle = '#2563eb';
    for (const point of this.state.displayData) {
      const x = padding + (point.x - minX) * scaleX;
      const y = height - padding - (point.y - minY) * scaleY;

      this.ctx.beginPath();
      this.ctx.arc(x, y, 3, 0, 2 * Math.PI);
      this.ctx.fill();
    }

    // Highlight hovered point
    if (this.state.hoveredPoint) {
      const point = this.state.hoveredPoint;
      const x = padding + (point.x - minX) * scaleX;
      const y = height - padding - (point.y - minY) * scaleY;

      this.ctx.fillStyle = '#ef4444';
      this.ctx.beginPath();
      this.ctx.arc(x, y, 6, 0, 2 * Math.PI);
      this.ctx.fill();
    }
  }

  /**
   * Draw selection rectangle
   */
  drawSelectionRect() {
    if (!this.selectionRect) return;

    const { x, y, width, height } = this.selectionRect;
    
    this.ctx.strokeStyle = '#2563eb';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x, y, width, height);
    
    this.ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
    this.ctx.fillRect(x, y, width, height);
  }

  /**
   * Show status message
   */
  showStatus(message) {
    const statusEl = document.getElementById('chart-status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.style.display = message ? 'block' : 'none';
    }
  }

  /**
   * Find nearest point to mouse position
   */
  findNearestPoint(mouseX, mouseY) {
    const padding = 60;
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;

    const { minX, maxX, minY, maxY } = this.state.extents;
    const scaleX = plotWidth / (maxX - minX);
    const scaleY = plotHeight / (maxY - minY);

    let nearest = null;
    let minDist = Infinity;

    for (const point of this.state.displayData) {
      const x = padding + (point.x - minX) * scaleX;
      const y = height - padding - (point.y - minY) * scaleY;

      const dist = Math.sqrt(Math.pow(x - mouseX, 2) + Math.pow(y - mouseY, 2));
      
      if (dist < minDist && dist < 20) {
        minDist = dist;
        nearest = point;
      }
    }

    return nearest;
  }

  /**
   * Mouse event handlers
   */
  handleMouseDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    this.state.isSelecting = true;
    this.state.selectionStart = { x, y };
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.state.isSelecting && this.state.selectionStart) {
      // Update selection rectangle
      this.selectionRect = {
        x: Math.min(x, this.state.selectionStart.x),
        y: Math.min(y, this.state.selectionStart.y),
        width: Math.abs(x - this.state.selectionStart.x),
        height: Math.abs(y - this.state.selectionStart.y)
      };
      this.render();
    } else {
      // Find and highlight nearest point
      const nearest = this.findNearestPoint(x, y);
      
      if (nearest !== this.state.hoveredPoint) {
        this.state.hoveredPoint = nearest;
        this.render();
        
        if (nearest) {
          this.showTooltip(nearest, e.clientX, e.clientY);
          this.emit('hover', nearest);
        } else {
          this.hideTooltip();
        }
      }
    }
  }

  handleMouseUp(e) {
    if (this.state.isSelecting) {
      this.state.isSelecting = false;
      
      // Process selection
      if (this.selectionRect && this.selectionRect.width > 5 && this.selectionRect.height > 5) {
        this.selectPointsInRect(this.selectionRect);
      }
      
      this.selectionRect = null;
      this.render();
    }
  }

  handleMouseLeave() {
    this.state.hoveredPoint = null;
    this.hideTooltip();
    this.render();
  }

  handleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const nearest = this.findNearestPoint(x, y);
    if (nearest) {
      this.emit('pointClicked', nearest);
    }
  }

  handleDoubleClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const nearest = this.findNearestPoint(x, y);
    if (nearest) {
      this.pinPoint(nearest);
    }
  }

  /**
   * Touch event handlers
   */
  handleTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      const nearest = this.findNearestPoint(x, y);
      if (nearest) {
        this.state.hoveredPoint = nearest;
        this.showTooltip(nearest, touch.clientX, touch.clientY);
        this.render();
      }
    }
  }

  handleTouchMove(e) {
    e.preventDefault();
    // Handle touch move for panning if needed
  }

  handleTouchEnd(e) {
    // Pin point on touch end if point was hovered
    if (this.state.hoveredPoint) {
      this.pinPoint(this.state.hoveredPoint);
    }
    
    this.state.hoveredPoint = null;
    this.hideTooltip();
    this.render();
  }

  /**
   * Wheel handler for zooming
   */
  handleWheel(e) {
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    const { extents } = this.state;
    
    const rangeX = extents.maxX - extents.minX;
    const rangeY = extents.maxY - extents.minY;
    
    const newRangeX = rangeX * delta;
    const newRangeY = rangeY * delta;
    
    const centerX = (extents.minX + extents.maxX) / 2;
    const centerY = (extents.minY + extents.maxY) / 2;
    
    this.state.extents = {
      minX: centerX - newRangeX / 2,
      maxX: centerX + newRangeX / 2,
      minY: centerY - newRangeY / 2,
      maxY: centerY + newRangeY / 2
    };
    
    this.render();
  }

  /**
   * Show tooltip at position
   */
  showTooltip(point, x, y) {
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement('div');
      this.tooltipEl.className = 'chart-tooltip';
      document.body.appendChild(this.tooltipEl);
    }

    this.tooltipEl.innerHTML = `
      <div class="tooltip-content">
        <div class="tooltip-row">
          <span class="tooltip-label">Position:</span>
          <span class="tooltip-value">${formatCoordinate(point.x, point.y)}</span>
        </div>
        <div class="tooltip-row">
          <span class="tooltip-label">Index:</span>
          <span class="tooltip-value">${formatNumber(point.index)}</span>
        </div>
      </div>
    `;

    this.tooltipEl.style.left = `${x + 10}px`;
    this.tooltipEl.style.top = `${y + 10}px`;
    this.tooltipEl.style.display = 'block';
  }

  /**
   * Hide tooltip
   */
  hideTooltip() {
    if (this.tooltipEl) {
      this.tooltipEl.style.display = 'none';
    }
  }

  /**
   * Pin a point
   */
  pinPoint(point) {
    const pinId = `pin-${Date.now()}-${Math.random()}`;
    const pinnedPoint = { ...point, id: pinId };
    
    this.emit('pinnedChanged', { action: 'add', point: pinnedPoint });
  }

  /**
   * Select points in rectangle
   */
  selectPointsInRect(rect) {
    const padding = 60;
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;

    const { minX, maxX, minY, maxY } = this.state.extents;
    const scaleX = plotWidth / (maxX - minX);
    const scaleY = plotHeight / (maxY - minY);

    const selected = [];

    for (const point of this.state.displayData) {
      const x = padding + (point.x - minX) * scaleX;
      const y = height - padding - (point.y - minY) * scaleY;

      if (x >= rect.x && x <= rect.x + rect.width &&
          y >= rect.y && y <= rect.y + rect.height) {
        selected.push(point);
      }
    }

    this.state.selectedPoints = selected;
    this.emit('selectionChanged', selected);
  }

  /**
   * Export chart as PNG
   */
  exportPNG() {
    if (!this.canvas) return;

    const link = document.createElement('a');
    link.download = `chart-${Date.now()}.png`;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  }

  /**
   * Export pinned points as CSV
   */
  exportPinnedCSV(pinnedPoints) {
    if (!pinnedPoints || pinnedPoints.length === 0) {
      alert('No pinned points to export');
      return;
    }

    const csv = 'x,y,index\n' + 
      pinnedPoints.map(p => `${p.x},${p.y},${p.index}`).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.download = `pinned-points-${Date.now()}.csv`;
    link.href = url;
    link.click();
    
    URL.revokeObjectURL(url);
  }

  /**
   * Clear all pinned points
   */
  clearPinned() {
    this.state.pinnedTooltips = [];
    this.emit('pinnedChanged', { action: 'clear' });
  }

  /**
   * Jump to pinned point
   */
  jumpToPin(pin) {
    // Center view on pin
    const rangeX = this.state.extents.maxX - this.state.extents.minX;
    const rangeY = this.state.extents.maxY - this.state.extents.minY;

    this.state.extents = {
      minX: pin.x - rangeX / 4,
      maxX: pin.x + rangeX / 4,
      minY: pin.y - rangeY / 4,
      maxY: pin.y + rangeY / 4
    };

    this.render();
  }

  /**
   * Handle keyboard events
   */
  handleKeyEvent(e) {
    switch(e.key) {
      case 'Escape':
        this.clearPinned();
        break;
      case 'p':
      case 'P':
        if (this.state.hoveredPoint) {
          this.pinPoint(this.state.hoveredPoint);
        }
        break;
      case '+':
      case '=':
        this.handleWheel({ deltaY: -100, preventDefault: () => {} });
        break;
      case '-':
      case '_':
        this.handleWheel({ deltaY: 100, preventDefault: () => {} });
        break;
    }
  }
}
