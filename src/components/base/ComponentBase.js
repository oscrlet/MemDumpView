/**
 * Base component infrastructure for MVVM pattern.
 * Provides common DOM utilities for creating card-based components.
 * 
 * Note: Reuses existing Card.css from src/components/shared/Card.css
 */

/**
 * Create a card container with title
 * @param {string} title - Card title
 * @param {Object} options - Additional options
 * @returns {Object} Card object with DOM elements and utility methods
 */
export function createCard(title = '', options = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'card-box';
  
  if (options.className) {
    wrapper.className += ' ' + options.className;
  }

  const header = document.createElement('div');
  header.className = 'card-header';
  header.textContent = title || '';
  wrapper.appendChild(header);

  const content = document.createElement('div');
  content.className = 'card-content';
  wrapper.appendChild(content);

  const footer = document.createElement('div');
  footer.className = 'card-footer';
  footer.style.display = 'none';
  wrapper.appendChild(footer);

  return {
    el: wrapper,
    headerEl: header,
    contentEl: content,
    footerEl: footer,
    
    setTitle(t) {
      header.textContent = t;
    },
    
    showFooter(show) {
      footer.style.display = show ? '' : 'none';
    },
    
    mount(container) {
      if (container) {
        container.appendChild(wrapper);
      }
      return this;
    },
    
    unmount() {
      if (wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
      return this;
    }
  };
}

/**
 * Bind an event handler to an element with optional delegation
 * @param {HTMLElement} element - Target element
 * @param {string} eventType - Event type (e.g., 'click', 'input')
 * @param {string|Function} selectorOrHandler - CSS selector for delegation or handler function
 * @param {Function} handler - Handler function (if using delegation)
 * @returns {Function} Cleanup function to remove the event listener
 */
export function bindEvent(element, eventType, selectorOrHandler, handler) {
  if (typeof selectorOrHandler === 'function') {
    // Direct binding
    const fn = selectorOrHandler;
    element.addEventListener(eventType, fn);
    return () => element.removeEventListener(eventType, fn);
  } else {
    // Delegated binding
    const selector = selectorOrHandler;
    const delegatedHandler = (ev) => {
      const target = ev.target.closest(selector);
      if (target && element.contains(target)) {
        handler.call(target, ev);
      }
    };
    element.addEventListener(eventType, delegatedHandler);
    return () => element.removeEventListener(eventType, delegatedHandler);
  }
}

/**
 * Base component class that provides lifecycle hooks and common utilities
 */
export class ComponentBase {
  constructor(container) {
    this.container = container;
    this._cleanups = [];
    this._isMounted = false;
  }

  /**
   * Mount the component (override in subclass)
   */
  mount() {
    this._isMounted = true;
  }

  /**
   * Unmount the component and clean up resources
   */
  unmount() {
    this._isMounted = false;
    this._cleanups.forEach(cleanup => {
      try {
        cleanup();
      } catch (err) {
        console.error('[ComponentBase] Cleanup error:', err);
      }
    });
    this._cleanups = [];
  }

  /**
   * Register a cleanup function to be called on unmount
   * @param {Function} fn - Cleanup function
   */
  onCleanup(fn) {
    this._cleanups.push(fn);
  }

  /**
   * Helper to bind event and auto-cleanup on unmount
   * @param {HTMLElement} element - Target element
   * @param {string} eventType - Event type
   * @param {Function} handler - Handler function
   */
  bindEvent(element, eventType, handler) {
    const cleanup = bindEvent(element, eventType, handler);
    this.onCleanup(cleanup);
  }
}
