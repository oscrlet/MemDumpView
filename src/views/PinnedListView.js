import '../components/PinnedList.css';
import { formatSI, formatSeconds } from "../utils/format.js";

/**
 * PinnedListView: Pure view for pinned list UI.
 * Uses PinnedListViewModel for commands.
 */
export class PinnedListView {
  constructor(viewModel, container) {
    this.viewModel = viewModel;
    this.model = viewModel.getModel();
    this.container = container;
    this.pinned = [];
    this.filter = '__all';
    this.groupBy = false;
    this.sortBy = 'time';
    
    // Track currently open menu
    this._openMenu = null;
    this._openMenuDocHandler = null;
    
    this._render();
    
    // Subscribe to model events
    this.model.on('pinnedChanged', (pins) => this.setPinned(pins));
  }

  setPinned(pins) {
    this.pinned = pins ? pins.slice() : [];
    this._render();
  }

  updateOptions({ filter, groupBy, sortBy } = {}) {
    if (filter !== undefined) this.filter = filter;
    if (groupBy !== undefined) this.groupBy = groupBy;
    if (sortBy !== undefined) this.sortBy = sortBy;
    this._render();
  }

  _closeOpenMenu() {
    if (this._openMenu && this._openMenu.el) {
      try { this._openMenu.el.remove(); } catch(e) {}
      this._openMenu = null;
    }
    if (this._openMenuDocHandler) {
      try { document.removeEventListener('click', this._openMenuDocHandler); } catch(e) {}
      this._openMenuDocHandler = null;
    }
  }

  _render() {
    this._closeOpenMenu();

    this.container.innerHTML = '';
    let list = this.pinned.slice();
    
    if (this.filter && this.filter !== '__all') {
      list = list.filter(p => p.seriesId === this.filter);
    }
    
    if (this.sortBy === 'time') list.sort((a, b) => a.relMicro - b.relMicro);
    if (this.sortBy === 'value') list.sort((a, b) => a.val - b.val);
    if (this.sortBy === 'series') list.sort((a, b) => (a.seriesName || '').localeCompare(b.seriesName) || a.relMicro - b.relMicro);
    
    if (this.groupBy) {
      const groups = {};
      for (const p of list) {
        (groups[p.seriesName] = groups[p.seriesName] || []).push(p);
      }
      for (const k of Object.keys(groups)) {
        const header = document.createElement('div');
        header.className = 'pinned-group-header';
        header.textContent = k;
        this.container.appendChild(header);
        for (const p of groups[k]) {
          this.container.appendChild(this._makeRow(p));
        }
      }
    } else {
      for (const p of list) {
        this.container.appendChild(this._makeRow(p));
      }
    }
  }

  _makeRow(p) {
    const el = document.createElement('div');
    el.className = 'pinned-item' + (p.selected ? ' selected' : '') + (p.hidden ? ' hidden' : '');

    // Checkbox
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'pin-checkbox';
    const ariaName = p.label ? `${p.label}` : `${p.seriesName} ${(p.relMicro/1e6).toFixed(3)}s`;
    chk.setAttribute('aria-label', `选择 标记 ${ariaName}`);
    chk.checked = !!p.selected;

    const meta = document.createElement('div');
    meta.className = 'meta';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = p.label ? String(p.label) : p.seriesName;
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = `${formatSeconds(p.relMicro/1e6)} — ${formatSI(p.val)}`;
    meta.appendChild(title);
    meta.appendChild(sub);

    // Menu button
    const menuBtn = document.createElement('button');
    menuBtn.className = 'menu-btn';
    menuBtn.setAttribute('aria-label', '更多操作');
    menuBtn.innerHTML = '&#x22EE;'; // vertical ellipsis

    el.appendChild(chk);
    el.appendChild(meta);
    el.appendChild(menuBtn);

    // Row click -> toggle hidden
    el.addEventListener('click', (ev) => {
      if (ev.target && ev.target.closest) {
        if (ev.target.closest('.menu-btn')) return;
        if (ev.target.classList && ev.target.classList.contains('pin-checkbox')) return;
      }
      this.viewModel.togglePinHidden(p);
    });

    // Checkbox click -> toggle selection
    chk.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.viewModel.togglePinSelection(p);
    });

    // Menu button -> open floating menu
    menuBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      
      if (this._openMenu && this._openMenu.target === menuBtn) {
        this._closeOpenMenu();
        return;
      }
      
      this._closeOpenMenu();

      const rect = menuBtn.getBoundingClientRect();
      const menu = document.createElement('div');
      menu.className = 'pin-menu';
      menu.style.position = 'absolute';
      menu.style.zIndex = 99999;
      menu.innerHTML = `
        <div class="pin-menu-item rename">重命名</div>
        <div class="pin-menu-item delete">删除</div>
      `;
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
        const defaultName = p.label ? String(p.label) : (p.seriesName || '');
        const newName = window.prompt('请输入新的标记名称（只影响该标记条目）', defaultName);
        if (newName !== null) {
          this.viewModel.renamePin(p, newName);
        }
        this._closeOpenMenu();
      };
      
      const onDeleteClick = (e) => {
        e.stopPropagation();
        this.viewModel.deletePin(p);
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
      
      this._openMenu = { el: menu, target: menuBtn, handlers: { onRenameClick, onDeleteClick } };
      this._openMenuDocHandler = docHandler;
      document.addEventListener('click', docHandler);
    });

    return el;
  }
}
