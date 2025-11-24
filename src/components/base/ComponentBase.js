/**
 * ComponentBase: Base utilities for creating components in the MVVM pattern
 * 
 * Provides helper functions for:
 * - Creating card wrappers (re-exports from Card.js)
 * - Binding events with automatic cleanup
 * - Mounting components to DOM
 */

import { createCard } from '../shared/Card.js';

/**
 * Re-export createCard for convenience
 */
export { createCard };

/**
 * Helper to bind event listeners with automatic cleanup tracking
 * Returns an object with cleanup methods
 */
export function createEventBinder() {
  const bindings = [];

  return {
    /**
     * Bind an event listener and track it for cleanup
     * @param {Element} element - DOM element
     * @param {string} event - event name
     * @param {Function} handler - event handler
     * @param {Object} options - addEventListener options
     */
    bind(element, event, handler, options) {
      element.addEventListener(event, handler, options);
      bindings.push({ element, event, handler, options });
    },

    /**
     * Unbind all tracked event listeners
     */
    unbindAll() {
      for (const { element, event, handler, options } of bindings) {
        try {
          element.removeEventListener(event, handler, options);
        } catch (e) {
          console.warn('Failed to remove event listener:', e);
        }
      }
      bindings.length = 0;
    },

    /**
     * Get number of bindings (useful for debugging)
     */
    count() {
      return bindings.length;
    }
  };
}

/**
 * Mount a component element to a container
 * @param {Element} container - parent element
 * @param {Element} element - element to mount
 */
export function mount(container, element) {
  if (!container || !element) {
    throw new Error('mount() requires both container and element');
  }
  container.appendChild(element);
}

/**
 * Unmount (remove) an element from its parent
 * @param {Element} element - element to remove
 */
export function unmount(element) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

/**
 * Base class for View components (optional, can use plain functions)
 * Provides lifecycle hooks and event binding management
 */
export class ViewComponent {
  constructor(container) {
    this.container = container;
    this.eventBinder = createEventBinder();
    this._mounted = false;
  }

  /**
   * Override this to render your component
   */
  render() {
    throw new Error('ViewComponent.render() must be implemented by subclass');
  }

  /**
   * Mount the component to its container
   */
  mount() {
    if (this._mounted) return;
    this.render();
    this._mounted = true;
  }

  /**
   * Unmount and cleanup
   */
  unmount() {
    if (!this._mounted) return;
    this.eventBinder.unbindAll();
    this._mounted = false;
  }

  /**
   * Helper to bind events (delegates to eventBinder)
   */
  bindEvent(element, event, handler, options) {
    this.eventBinder.bind(element, event, handler, options);
  }
}
