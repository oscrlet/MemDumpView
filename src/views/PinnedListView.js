import { formatSI, formatSeconds } from "../utils/format.js";

/**
 * PinnedListView: Pure view for pinned points list
 * Uses PinnedListViewModel for all data and commands
 */
export class PinnedListView {
  constructor(viewModel, container) {
    this.viewModel = viewModel;
    this.container = container;
    
    // Track currently open menu for cleanup
    this._openMenu = null;
    this._openMenuDocHandler = null;
    
    // Subscribe to ViewModel state changes
    this.viewModel.subscribe(state => {
      this._render(state);
    });
    
    // Initial render
    const initialState = this.viewModel.getState();
    this._render(initialState);
  }

  _closeOpenMenu() {
    if (this._openMenu && this._openMenu.el) {
      try { 
        this._openMenu.el.remove(); 
      } catch (e) {
        // Ignore errors if element already removed from DOM
      }
      this._openMenu = null;
    }
    if (this._openMenuDocHandler) {
      try { 
        document.removeEventListener('click', this._openMenuDocHandler); 
      } catch (e) {
        // Ignore errors if listener not found
      }
      this._openMenuDocHandler = null;
    }
  }

  _render(state) {
    // Close any floating UI before re-rendering
    this._closeOpenMenu();

    this.container.innerHTML = '';
    
    const pins = this.viewModel.getPinnedPoints();
    const groups = this.viewModel.getGroupedPinnedPoints();
    
    if (state.groupBy && groups) {
      // Grouped rendering
      for (const groupName of Object.keys(groups)) {
        const header = document.createElement('div');
        header.className = 'pinned-group-header';
        header.textContent = groupName;
        this.container.appendChild(header);
        
        for (const pin of groups[groupName]) {
          this.container.appendChild(this._makeRow(pin));
        }
      }
    } else {
      // Flat list
      for (const pin of pins) {
        this.container.appendChild(this._makeRow(pin));
      }
    }
  }

  _makeRow(pin) {
    const el = document.createElement('div');
    el.className = 'pinned-item' + (pin.selected ? ' selected' : '') + (pin.hidden ? ' hidden' : '');

    // Checkbox
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'pin-checkbox';
    const ariaName = pin.label ? `${pin.label}` : `${pin.seriesName} ${(pin.relMicro / 1e6).toFixed(3)}s`;
    chk.setAttribute('aria-label', `选择 标记 ${ariaName}`);
    chk.checked = !!pin.selected;

    // Meta (title + subtitle)
    const meta = document.createElement('div');
    meta.className = 'meta';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = pin.label ? String(pin.label) : pin.seriesName;
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = `${formatSeconds(pin.relMicro / 1e6)} — ${formatSI(pin.val)}`;
    meta.appendChild(title);
    meta.appendChild(sub);

    // Menu button
    const menuBtn = document.createElement('button');
    menuBtn.className = 'menu-btn';
    menuBtn.setAttribute('aria-label', '更多操作');
    menuBtn.innerHTML = '&#x22EE;'; // vertical ellipsis

    // Layout
    el.appendChild(chk);
    el.appendChild(meta);
    el.appendChild(menuBtn);

    // Row click -> toggle hidden
    el.addEventListener('click', (ev) => {
      if (ev.target && ev.target.closest) {
        if (ev.target.closest('.menu-btn')) return;
        if (ev.target.classList && ev.target.classList.contains('pin-checkbox')) return;
      }
      this.viewModel.togglePinHidden(pin);
    });

    // Checkbox click -> toggle selection
    chk.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.viewModel.togglePinSelection(pin);
    });

    // Menu button -> open floating menu
    menuBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      
      // If menu already open for this button, close it
      if (this._openMenu && this._openMenu.target === menuBtn) {
        this._closeOpenMenu();
        return;
      }
      
      // Close any other menu
      this._closeOpenMenu();

      const rect = menuBtn.getBoundingClientRect();
      const menu = document.createElement('div');
      menu.className = 'pin-menu';
      menu.style.position = 'absolute';
      menu.style.zIndex = '99999';
      menu.innerHTML = `
        <div class="pin-menu-item rename">重命名</div>
        <div class="pin-menu-item delete">删除</div>
      `;
      
      // Append first to measure
      document.body.appendChild(menu);

      // Position with clamping
      const MARGIN = 8;
      const SPACING = 6;
      const menuW = Math.max(120, menu.offsetWidth || 120);
      const menuH = Math.max(36, menu.offsetHeight || 36);
      const innerW = window.innerWidth || document.documentElement.clientWidth;
      const innerH = window.innerHeight || document.documentElement.clientHeight;

      let left = Math.round(rect.left);
      left = Math.max(MARGIN, Math.min(left, innerW - menuW - MARGIN));

      let top = Math.round(rect.bottom + SPACING);
      if (top + menuH + MARGIN > innerH) {
        top = Math.round(rect.top - menuH - SPACING);
      }
      top = Math.max(MARGIN, Math.min(top, innerH - menuH - MARGIN));

      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;

      // Handlers
      const onRenameClick = (e) => {
        e.stopPropagation();
        const defaultName = pin.label ? String(pin.label) : (pin.seriesName || '');
        const newName = window.prompt('请输入新的标记名称（只影响该标记条目）', defaultName);
        if (newName !== null) {
          this.viewModel.renamePin(pin, newName);
        }
        this._closeOpenMenu();
      };
      
      const onDeleteClick = (e) => {
        e.stopPropagation();
        this.viewModel.deletePin(pin);
        this._closeOpenMenu();
      };

      const renameEl = menu.querySelector('.pin-menu-item.rename');
      const deleteEl = menu.querySelector('.pin-menu-item.delete');
      renameEl.addEventListener('click', onRenameClick);
      deleteEl.addEventListener('click', onDeleteClick);

      // Close menu when clicking elsewhere
      const docHandler = (evDoc) => {
        if (!menu.contains(evDoc.target) && evDoc.target !== menuBtn) {
          this._closeOpenMenu();
        }
      };
      
      this._openMenu = { el: menu, target: menuBtn };
      this._openMenuDocHandler = docHandler;
      document.addEventListener('click', docHandler);
    });

    return el;
  }
}
