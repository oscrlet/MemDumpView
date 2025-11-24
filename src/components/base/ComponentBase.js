/**
 * Base component utilities for MVVM components.
 * Provides helper functions for creating card-based UI components.
 * Reuses existing Card.css styles.
 */

/**
 * Create a card container element with standard styling
 * @param {string} title - Card title
 * @param {Object} options - Configuration options
 * @returns {Object} - { element, header, content } references
 */
export function createCard(title, options = {}) {
  const {
    className = '',
    stretch = false,
    ariaLabel = title
  } = options;

  const card = document.createElement('div');
  card.className = `box ${stretch ? 'stretch' : ''} ${className}`.trim();
  if (ariaLabel) {
    card.setAttribute('aria-label', ariaLabel);
  }

  const header = document.createElement('div');
  header.className = 'card-header';
  header.innerHTML = `<strong>${title}</strong>`;

  const content = document.createElement('div');
  content.className = 'card-content';

  card.appendChild(header);
  card.appendChild(content);

  return {
    element: card,
    header,
    content
  };
}

/**
 * Create a button element with standard styling
 * @param {string} text - Button text
 * @param {Object} options - Configuration options
 * @returns {HTMLButtonElement}
 */
export function createButton(text, options = {}) {
  const {
    className = '',
    icon = null,
    onClick = null,
    ariaLabel = text
  } = options;

  const btn = document.createElement('button');
  btn.className = `card-btn ${className}`.trim();
  btn.setAttribute('aria-label', ariaLabel);

  if (icon) {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'icon';
    iconSpan.innerHTML = icon;
    btn.appendChild(iconSpan);
  }

  const textSpan = document.createElement('span');
  textSpan.textContent = text;
  btn.appendChild(textSpan);

  if (onClick) {
    btn.addEventListener('click', onClick);
  }

  return btn;
}

/**
 * Bind an event listener and return cleanup function
 * @param {HTMLElement} element - Target element
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 * @param {Object} options - addEventListener options
 * @returns {Function} - Cleanup function to remove listener
 */
export function bindEvent(element, event, handler, options = {}) {
  element.addEventListener(event, handler, options);
  return () => {
    element.removeEventListener(event, handler, options);
  };
}

/**
 * Mount a component to a container
 * @param {HTMLElement} component - Component element to mount
 * @param {HTMLElement} container - Container element
 */
export function mount(component, container) {
  if (!container) {
    throw new Error('Container element is required');
  }
  container.innerHTML = '';
  container.appendChild(component);
}

/**
 * Simple SVG icon helper (reuse from existing code)
 * @param {string} name - Icon name
 * @returns {string} - SVG markup
 */
export function svgIcon(name) {
  switch (name) {
    case 'open':
      return `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 7a2 2 0 0 1 2-2h3l2 2h6a2 2 0 0 1 2 2v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'png':
      return `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M7 12h10M7 8h10M7 16h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    case 'csv':
      return `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    case 'pinned':
      return `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2v7M9 11l-3 9 6-4 6 4-3-9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'clear':
      return `<svg class="icon-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18M8 6v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6M10 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    default:
      return '';
  }
}
