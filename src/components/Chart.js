/**
 * Chart component - Event emitter API with canvas rendering
 */

import { downsampleLTTB } from '../utils/lttb.js';
import { parseCSVStream } from '../utils/csv.js';
import { formatCoordinate } from '../utils/format.js';

export class Chart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.eventHandlers = {};
    
    // Data
    this.rawData = [];
    this.displayData = [];
    this.pinnedPoints = [];
    
    // View state
    this.viewX = 0;
    this.viewY = 0;
    this.viewWidth = 100;
    this.viewHeight = 100;
    this.globalExtents = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    
    // Interaction state
    this.isSelecting = false;
    this.selectStart = null;
    this.selectEnd = null;
    this.isPanning = false;
    this.panStart = null;
    this.lastMousePos = null;
    this.touchStartDist = null;
    this.longPressTimer = null;
    
    this.setupCanvas();
    this.attachEventListeners();
  }

  setupCanvas() {
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = rect.width * window.devicePixelRatio;
      this.canvas.height = rect.height * window.devicePixelRatio;
      this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      this.render();
    };
    
    window.addEventListener('resize', resize);
    resize();
  }

  attachEventListeners() {
    // Mouse events
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    this.canvas.addEventListener('click', this.handleClick.bind(this));
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
    
    // Touch events
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
  }

  // Event emitter methods
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

  // Public API methods
  async loadFile(file) {
    this.emit('status', { message: 'Loading file...', progress: 0 });
    
    try {
      const result = await parseCSVStream(file, (progress) => {
        this.emit('status', { message: 'Parsing CSV...', progress });
      });
      
      // Assume first two columns are x, y
      this.rawData = result.rows.map(row => {
        const values = Object.values(row);
        return {
          x: parseFloat(values[0]) || 0,
          y: parseFloat(values[1]) || 0
        };
      }).filter(p => !isNaN(p.x) && !isNaN(p.y));
      
      this.displayData = [...this.rawData];
      this.computeGlobalExtents();
      this.resetView();
      
      this.emit('status', { message: `Loaded ${this.rawData.length} points`, progress: 1 });
      this.emit('seriesChanged', { pointCount: this.rawData.length });
      this.render();
      
      return true;
    } catch (error) {
      this.emit('status', { message: `Error: ${error.message}`, progress: 0 });
      return false;
    }
  }

  resampleInViewAndRender(threshold = 1000) {
    if (this.rawData.length <= threshold) {
      this.displayData = [...this.rawData];
    } else {
      this.displayData = downsampleLTTB(this.rawData, threshold);
      this.emit('resampled', { 
        original: this.rawData.length, 
        resampled: this.displayData.length 
      });
    }
    this.render();
  }

  exportPNG() {
    const link = document.createElement('a');
    link.download = `chart-${Date.now()}.png`;
    link.href = this.canvas.toDataURL();
    link.click();
  }

  exportPinnedCSV() {
    if (this.pinnedPoints.length === 0) {
      return;
    }
    
    const csv = 'x,y\n' + this.pinnedPoints.map(p => `${p.x},${p.y}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `pinned-points-${Date.now()}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }

  clearPinned() {
    this.pinnedPoints = [];
    this.emit('pinnedChanged', { points: [] });
    this.render();
  }

  computeGlobalExtents() {
    if (this.rawData.length === 0) {
      this.globalExtents = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
      return;
    }
    
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const point of this.rawData) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    
    // Add 5% padding
    const padX = (maxX - minX) * 0.05;
    const padY = (maxY - minY) * 0.05;
    
    this.globalExtents = {
      minX: minX - padX,
      maxX: maxX + padX,
      minY: minY - padY,
      maxY: maxY + padY
    };
  }

  resetView() {
    this.viewX = this.globalExtents.minX;
    this.viewY = this.globalExtents.minY;
    this.viewWidth = this.globalExtents.maxX - this.globalExtents.minX;
    this.viewHeight = this.globalExtents.maxY - this.globalExtents.minY;
    this.render();
  }

  jumpToPin(index) {
    if (index >= 0 && index < this.pinnedPoints.length) {
      const point = this.pinnedPoints[index];
      // Center view on point
      this.viewX = point.x - this.viewWidth / 2;
      this.viewY = point.y - this.viewHeight / 2;
      this.render();
    }
  }

  handleKeyEvent(event) {
    switch (event.key.toLowerCase()) {
      case 'a':
        this.navigateToPreviousPin();
        break;
      case 'd':
        this.navigateToNextPin();
        break;
      case 'w':
        this.viewY -= this.viewHeight * 0.1;
        this.render();
        break;
      case 's':
        this.viewY += this.viewHeight * 0.1;
        this.render();
        break;
      case 'q':
        this.zoomOut();
        break;
      case 'escape':
        this.cancelSelection();
        break;
      case 'delete':
        if (this.pinnedPoints.length > 0) {
          this.pinnedPoints.pop();
          this.emit('pinnedChanged', { points: this.pinnedPoints });
          this.render();
        }
        break;
    }
  }

  navigateToPreviousPin() {
    if (this.pinnedPoints.length > 0) {
      const currentIndex = this.findClosestPinIndex();
      const prevIndex = (currentIndex - 1 + this.pinnedPoints.length) % this.pinnedPoints.length;
      this.jumpToPin(prevIndex);
    }
  }

  navigateToNextPin() {
    if (this.pinnedPoints.length > 0) {
      const currentIndex = this.findClosestPinIndex();
      const nextIndex = (currentIndex + 1) % this.pinnedPoints.length;
      this.jumpToPin(nextIndex);
    }
  }

  findClosestPinIndex() {
    const centerX = this.viewX + this.viewWidth / 2;
    const centerY = this.viewY + this.viewHeight / 2;
    
    let closestIndex = 0;
    let closestDist = Infinity;
    
    for (let i = 0; i < this.pinnedPoints.length; i++) {
      const dx = this.pinnedPoints[i].x - centerX;
      const dy = this.pinnedPoints[i].y - centerY;
      const dist = dx * dx + dy * dy;
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
    }
    
    return closestIndex;
  }

  zoomOut() {
    const centerX = this.viewX + this.viewWidth / 2;
    const centerY = this.viewY + this.viewHeight / 2;
    
    this.viewWidth *= 1.2;
    this.viewHeight *= 1.2;
    
    this.viewX = centerX - this.viewWidth / 2;
    this.viewY = centerY - this.viewHeight / 2;
    
    this.render();
  }

  cancelSelection() {
    this.isSelecting = false;
    this.selectStart = null;
    this.selectEnd = null;
    this.updateSelectRect();
  }

  // Mouse event handlers
  handleMouseDown(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    if (event.shiftKey) {
      this.isSelecting = true;
      this.selectStart = { x, y };
      this.selectEnd = { x, y };
      this.updateSelectRect();
    } else {
      this.isPanning = true;
      this.panStart = { x: event.clientX, y: event.clientY };
    }
  }

  handleMouseMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    this.lastMousePos = { x, y };
    
    if (this.isSelecting && this.selectStart) {
      this.selectEnd = { x, y };
      this.updateSelectRect();
    } else if (this.isPanning && this.panStart) {
      const dx = event.clientX - this.panStart.x;
      const dy = event.clientY - this.panStart.y;
      
      const worldDx = (dx / rect.width) * this.viewWidth;
      const worldDy = (dy / rect.height) * this.viewHeight;
      
      this.viewX -= worldDx;
      this.viewY -= worldDy;
      
      this.panStart = { x: event.clientX, y: event.clientY };
      this.render();
    } else {
      // Hover detection
      const worldPos = this.screenToWorld(x, y);
      const hoveredPoint = this.findNearestPoint(worldPos.x, worldPos.y);
      
      if (hoveredPoint) {
        this.emit('hover', {
          point: hoveredPoint,
          screenX: x,
          screenY: y
        });
      } else {
        this.emit('hover', null);
      }
    }
  }

  handleMouseUp(event) {
    if (this.isSelecting && this.selectStart && this.selectEnd) {
      this.finishSelection();
    }
    
    this.isSelecting = false;
    this.isPanning = false;
    this.panStart = null;
  }

  handleMouseLeave() {
    this.emit('hover', null);
  }

  handleClick(event) {
    if (this.isSelecting) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const worldPos = this.screenToWorld(x, y);
    
    const nearestPoint = this.findNearestPoint(worldPos.x, worldPos.y);
    if (nearestPoint) {
      this.togglePin(nearestPoint);
    }
  }

  handleWheel(event) {
    event.preventDefault();
    
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const worldPos = this.screenToWorld(x, y);
    
    const zoomFactor = event.deltaY < 0 ? 0.9 : 1.1;
    
    this.viewWidth *= zoomFactor;
    this.viewHeight *= zoomFactor;
    
    this.viewX = worldPos.x - ((x / rect.width) * this.viewWidth);
    this.viewY = worldPos.y - ((y / rect.height) * this.viewHeight);
    
    this.render();
  }

  // Touch event handlers
  handleTouchStart(event) {
    event.preventDefault();
    
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      
      this.panStart = { x: touch.clientX, y: touch.clientY };
      
      // Long press for pin
      this.longPressTimer = setTimeout(() => {
        const worldPos = this.screenToWorld(x, y);
        const nearestPoint = this.findNearestPoint(worldPos.x, worldPos.y);
        if (nearestPoint) {
          this.togglePin(nearestPoint);
        }
      }, 500);
    } else if (event.touches.length === 2) {
      clearTimeout(this.longPressTimer);
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      this.touchStartDist = Math.sqrt(dx * dx + dy * dy);
    }
  }

  handleTouchMove(event) {
    event.preventDefault();
    clearTimeout(this.longPressTimer);
    
    const rect = this.canvas.getBoundingClientRect();
    
    if (event.touches.length === 1 && this.panStart) {
      const touch = event.touches[0];
      const dx = touch.clientX - this.panStart.x;
      const dy = touch.clientY - this.panStart.y;
      
      const worldDx = (dx / rect.width) * this.viewWidth;
      const worldDy = (dy / rect.height) * this.viewHeight;
      
      this.viewX -= worldDx;
      this.viewY -= worldDy;
      
      this.panStart = { x: touch.clientX, y: touch.clientY };
      this.render();
    } else if (event.touches.length === 2 && this.touchStartDist) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const zoomFactor = this.touchStartDist / dist;
      
      const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left;
      const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2 - rect.top;
      const worldPos = this.screenToWorld(centerX, centerY);
      
      this.viewWidth *= zoomFactor;
      this.viewHeight *= zoomFactor;
      
      this.viewX = worldPos.x - ((centerX / rect.width) * this.viewWidth);
      this.viewY = worldPos.y - ((centerY / rect.height) * this.viewHeight);
      
      this.touchStartDist = dist;
      this.render();
    }
  }

  handleTouchEnd(event) {
    event.preventDefault();
    clearTimeout(this.longPressTimer);
    
    if (event.touches.length === 0) {
      this.panStart = null;
      this.touchStartDist = null;
    }
  }

  // Helper methods
  screenToWorld(screenX, screenY) {
    const rect = this.canvas.getBoundingClientRect();
    const worldX = this.viewX + (screenX / rect.width) * this.viewWidth;
    const worldY = this.viewY + (screenY / rect.height) * this.viewHeight;
    return { x: worldX, y: worldY };
  }

  worldToScreen(worldX, worldY) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = ((worldX - this.viewX) / this.viewWidth) * rect.width;
    const screenY = ((worldY - this.viewY) / this.viewHeight) * rect.height;
    return { x: screenX, y: screenY };
  }

  findNearestPoint(worldX, worldY, maxDistance = null) {
    const rect = this.canvas.getBoundingClientRect();
    const threshold = maxDistance || (this.viewWidth / rect.width) * 10;
    
    let nearest = null;
    let nearestDist = Infinity;
    
    for (const point of this.displayData) {
      const dx = point.x - worldX;
      const dy = point.y - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < nearestDist && dist < threshold) {
        nearestDist = dist;
        nearest = point;
      }
    }
    
    return nearest;
  }

  togglePin(point) {
    const index = this.pinnedPoints.findIndex(p => p.x === point.x && p.y === point.y);
    
    if (index !== -1) {
      this.pinnedPoints.splice(index, 1);
    } else {
      this.pinnedPoints.push({ ...point });
    }
    
    this.emit('pinnedChanged', { points: this.pinnedPoints });
    this.render();
  }

  finishSelection() {
    const start = this.screenToWorld(this.selectStart.x, this.selectStart.y);
    const end = this.screenToWorld(this.selectEnd.x, this.selectEnd.y);
    
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    
    // Zoom to selection
    this.viewX = minX;
    this.viewY = minY;
    this.viewWidth = maxX - minX;
    this.viewHeight = maxY - minY;
    
    this.selectStart = null;
    this.selectEnd = null;
    this.updateSelectRect();
    this.render();
  }

  updateSelectRect() {
    const selectRect = document.getElementById('select-rect');
    
    if (this.isSelecting && this.selectStart && this.selectEnd) {
      const minX = Math.min(this.selectStart.x, this.selectEnd.x);
      const minY = Math.min(this.selectStart.y, this.selectEnd.y);
      const width = Math.abs(this.selectEnd.x - this.selectStart.x);
      const height = Math.abs(this.selectEnd.y - this.selectStart.y);
      
      selectRect.style.left = `${minX}px`;
      selectRect.style.top = `${minY}px`;
      selectRect.style.width = `${width}px`;
      selectRect.style.height = `${height}px`;
      selectRect.classList.add('active');
    } else {
      selectRect.classList.remove('active');
    }
  }

  // Rendering
  render() {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    
    // Clear canvas
    this.ctx.clearRect(0, 0, w, h);
    
    // Draw grid
    this.drawGrid(w, h);
    
    // Draw data points
    this.drawPoints(w, h);
    
    // Draw pinned points
    this.drawPinnedPoints(w, h);
    
    this.emit('rendered', {});
  }

  drawGrid(w, h) {
    this.ctx.strokeStyle = '#e0e0e0';
    this.ctx.lineWidth = 1;
    
    const gridSpacingX = this.viewWidth / 10;
    const gridSpacingY = this.viewHeight / 10;
    
    // Vertical lines
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * w;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();
    }
    
    // Horizontal lines
    for (let i = 0; i <= 10; i++) {
      const y = (i / 10) * h;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
      this.ctx.stroke();
    }
  }

  drawPoints(w, h) {
    this.ctx.fillStyle = '#4a90e2';
    
    for (const point of this.displayData) {
      const screen = this.worldToScreen(point.x, point.y);
      
      if (screen.x >= 0 && screen.x <= w && screen.y >= 0 && screen.y <= h) {
        this.ctx.beginPath();
        this.ctx.arc(screen.x, screen.y, 2, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
  }

  drawPinnedPoints(w, h) {
    this.ctx.fillStyle = '#e74c3c';
    this.ctx.strokeStyle = '#fff';
    this.ctx.lineWidth = 2;
    
    for (const point of this.pinnedPoints) {
      const screen = this.worldToScreen(point.x, point.y);
      
      if (screen.x >= 0 && screen.x <= w && screen.y >= 0 && screen.y <= h) {
        this.ctx.beginPath();
        this.ctx.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
      }
    }
  }
}
