/**
 * PinnedList component - DOM-only with event hooks
 */

import { formatCoordinate } from '../utils/format.js';

export class PinnedList {
  constructor(container) {
    this.container = container;
    this.eventHandlers = {};
    this.pinnedPoints = [];
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <h3>Pinned Points (${this.pinnedPoints.length})</h3>
      <div id="pinned-items"></div>
      <button class="clear-btn" id="clear-pinned-btn" style="display: none;">Clear All</button>
    `;

    this.attachEventListeners();
    this.renderItems();
  }

  attachEventListeners() {
    const clearBtn = this.container.querySelector('#clear-pinned-btn');
    clearBtn.addEventListener('click', () => this.emit('clearAll'));
  }

  renderItems() {
    const itemsContainer = this.container.querySelector('#pinned-items');
    const clearBtn = this.container.querySelector('#clear-pinned-btn');

    if (this.pinnedPoints.length === 0) {
      itemsContainer.innerHTML = '<div class="info-text">No pinned points</div>';
      clearBtn.style.display = 'none';
    } else {
      itemsContainer.innerHTML = this.pinnedPoints.map((point, index) => `
        <div class="pinned-item" data-index="${index}">
          <div class="pin-coords">Point ${index + 1}: (${formatCoordinate(point.x)}, ${formatCoordinate(point.y)})</div>
          <div class="pin-value">${point.label || ''}</div>
        </div>
      `).join('');

      clearBtn.style.display = 'block';

      // Attach click handlers to items
      itemsContainer.querySelectorAll('.pinned-item').forEach(item => {
        item.addEventListener('click', () => {
          const index = parseInt(item.dataset.index);
          this.emit('jumpToPin', index);
        });
      });
    }
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

  setPinnedPoints(points) {
    this.pinnedPoints = points;
    this.render();
  }

  addPinnedPoint(point) {
    this.pinnedPoints.push(point);
    this.render();
  }

  removePinnedPoint(index) {
    this.pinnedPoints.splice(index, 1);
    this.render();
  }

  clearAll() {
    this.pinnedPoints = [];
    this.render();
  }
}
