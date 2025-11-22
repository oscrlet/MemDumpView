/**
 * PinnedList component - manages pinned tooltip display
 */

import { formatNumber, formatCoordinate } from '../utils/format.js';

export class PinnedList {
  constructor(container) {
    this.container = typeof container === 'string'
      ? document.getElementById(container)
      : container;
    
    this.callbacks = {};
    this.pinnedItems = [];
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
   * Add a pinned item
   */
  addPin(item) {
    // Check if already pinned
    const exists = this.pinnedItems.some(p => p.id === item.id);
    if (exists) return;

    this.pinnedItems.push(item);
    this.render();
    this.emit('pinAdded', item);
  }

  /**
   * Remove a pinned item
   */
  removePin(id) {
    const index = this.pinnedItems.findIndex(p => p.id === id);
    if (index !== -1) {
      const item = this.pinnedItems[index];
      this.pinnedItems.splice(index, 1);
      this.render();
      this.emit('pinRemoved', item);
    }
  }

  /**
   * Clear all pinned items
   */
  clearAll() {
    this.pinnedItems = [];
    this.render();
    this.emit('allPinsCleared');
  }

  /**
   * Get all pinned items
   */
  getAll() {
    return [...this.pinnedItems];
  }

  /**
   * Render the pinned list
   */
  render() {
    if (this.pinnedItems.length === 0) {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'block';

    this.container.innerHTML = `
      <div class="pinned-header">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span class="pinned-title">Pinned Items</span>
          <span class="pinned-count">${this.pinnedItems.length}</span>
        </div>
        <button id="clear-all-pins-btn" class="btn btn-danger btn-sm">
          Clear All
        </button>
      </div>
      <div class="pinned-list">
        ${this.pinnedItems.map(item => this.renderPinnedItem(item)).join('')}
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Render a single pinned item
   */
  renderPinnedItem(item) {
    const coord = formatCoordinate(item.x, item.y);
    
    return `
      <div class="pinned-item" data-pin-id="${item.id}">
        <div class="pinned-item-header">
          <span class="pinned-item-title">${item.series || 'Data Point'}</span>
          <div class="pinned-item-actions">
            <button 
              class="pinned-item-btn jump-to-pin-btn" 
              data-pin-id="${item.id}"
              title="Jump to point"
            >
              📍
            </button>
            <button 
              class="pinned-item-btn remove-pin-btn" 
              data-pin-id="${item.id}"
              title="Remove pin"
            >
              ✕
            </button>
          </div>
        </div>
        <div class="pinned-item-content">
          <div><strong>Position:</strong> ${coord}</div>
          <div><strong>Index:</strong> ${formatNumber(item.index)}</div>
          ${item.value !== undefined ? `<div><strong>Value:</strong> ${formatNumber(item.value)}</div>` : ''}
          ${item.timestamp ? `<div><strong>Time:</strong> ${new Date(item.timestamp).toLocaleString()}</div>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners to pinned items
   */
  attachEventListeners() {
    // Clear all button
    const clearAllBtn = document.getElementById('clear-all-pins-btn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        this.clearAll();
      });
    }

    // Jump to pin buttons
    const jumpBtns = this.container.querySelectorAll('.jump-to-pin-btn');
    jumpBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pinId = e.target.dataset.pinId;
        const item = this.pinnedItems.find(p => p.id === pinId);
        if (item) {
          this.emit('jumpToPin', item);
        }
      });
    });

    // Remove pin buttons
    const removeBtns = this.container.querySelectorAll('.remove-pin-btn');
    removeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pinId = e.target.dataset.pinId;
        this.removePin(pinId);
      });
    });

    // Hover effect on pinned items
    const items = this.container.querySelectorAll('.pinned-item');
    items.forEach(item => {
      item.addEventListener('mouseenter', (e) => {
        const pinId = e.currentTarget.dataset.pinId;
        const pinnedItem = this.pinnedItems.find(p => p.id === pinId);
        if (pinnedItem) {
          this.emit('pinHover', pinnedItem);
        }
      });

      item.addEventListener('mouseleave', () => {
        this.emit('pinLeave');
      });
    });
  }
}
