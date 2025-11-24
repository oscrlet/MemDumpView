import './PinnedListView.css';
import { formatSI, formatSeconds } from "../utils/format.js";

/**
 * PinnedListView: View layer for pinned points list (MVVM pattern)
 * Depends on PinnedListViewModel for state and commands
 *
 * Each row:
 *  - has a checkbox to select (calls viewModel.toggleSelect)
 *  - clicking the row toggles the pin.hidden flag (calls viewModel.toggleHide)
 *  - has a menu button that opens a floating menu (重命名 / 删除)
 */
export class PinnedListView {
  constructor(viewModel, container) {
    this.viewModel = viewModel;
    this.container = container;
export class PinnedListView {
  constructor(viewModel, container) {
    this.viewModel = viewModel;
    this.container = container;
    this.pinned = [];
    this.filter = '__all';
    this.groupBy = false;
    this.sortBy = 'time';
    // callbacks (kept for compatibility, but can also use viewModel directly)
    this.onDelete = (p) => this.viewModel.deletePin(p);
    this.onSelect = (p, ev) => this.viewModel.toggleSelect(p);
    this.onHide = (p, ev) => this.viewModel.toggleHide(p);
    this.onRename = (p, newName) => this.viewModel.renamePin(p, newName);
    // track currently open menu so we can close it on rerender
    this._openMenu = null;
    this._openMenuDocHandler = null;
    this._render();
    
    // Subscribe to viewModel state changes
    this.viewModel.subscribe((state) => {
      this.pinned = state.pinnedPoints;
      this._render();
    });
  }

  setPinned(pins) { this.pinned = pins ? pins.slice() : []; this._render(); }
  updateOptions({ filter, groupBy, sortBy } = {}) {
    if (filter !== undefined) this.filter = filter;
    if (groupBy !== undefined) this.groupBy = groupBy;
    if (sortBy !== undefined) this.sortBy = sortBy;
    this._render();
  }

  _closeOpenMenu() {
    if (this._openMenu && this._openMenu.el) {
      try { this._openMenu.el.remove(); } catch(e){}
      this._openMenu = null;
    }
    if (this._openMenuDocHandler) {
      try { document.removeEventListener('click', this._openMenuDocHandler); } catch(e){}
      this._openMenuDocHandler = null;
    }
  }

  _render() {
    // close any floating UI before re-rendering
    this._closeOpenMenu();

    this.container.innerHTML = '';
    let list = this.pinned.slice();
    if (this.filter && this.filter !== '__all') list = list.filter(p => p.seriesId === this.filter);
    if (this.sortBy === 'time') list.sort((a,b)=>a.relMicro-b.relMicro);
    if (this.sortBy === 'value') list.sort((a,b)=>a.val-b.val);
    if (this.sortBy === 'series') list.sort((a,b)=> (a.seriesName||'').localeCompare(b.seriesName) || a.relMicro - b.relMicro);
    if (this.groupBy) {
      const groups = {};
      for (const p of list) (groups[p.seriesName] = groups[p.seriesName] || []).push(p);
      for (const k of Object.keys(groups)) {
        const header = document.createElement('div'); header.className = 'pinned-group-header'; header.textContent = k;
        this.container.appendChild(header);
        for (const p of groups[k]) this.container.appendChild(this._makeRow(p));
      }
    } else {
      for (const p of list) this.container.appendChild(this._makeRow(p));
    }
  }

  _makeRow(p) {
    const el = document.createElement('div');
    // reflect selected and hidden states in class names
    el.className = 'pinned-item' + (p.selected ? ' selected' : '') + (p.hidden ? ' hidden' : '');

    // checkbox (explicit selection control)
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'pin-checkbox';
    // aria: show label if present
    const ariaName = p.label ? `${p.label}` : `${p.seriesName} ${(p.relMicro/1e6).toFixed(3)}s`;
    chk.setAttribute('aria-label', `选择 标记 ${ariaName}`);
    chk.checked = !!p.selected;

    const meta = document.createElement('div'); meta.className='meta';
    // show label if present, otherwise seriesName
    const title = document.createElement('div'); title.className='title'; title.textContent = p.label ? String(p.label) : p.seriesName;
    const sub = document.createElement('div'); sub.className='sub'; sub.textContent = `${formatSeconds(p.relMicro/1e6)} — ${formatSI(p.val)}`;
    meta.appendChild(title); meta.appendChild(sub);

    // menu button (replaces per-row jump/delete buttons)
    const menuBtn = document.createElement('button');
    menuBtn.className = 'menu-btn';
    menuBtn.setAttribute('aria-label', '更多操作');
    menuBtn.innerHTML = '&#x22EE;'; // vertical ellipsis
    // layout: checkbox | meta | menuBtn
    el.appendChild(chk);
    el.appendChild(meta);
    el.appendChild(menuBtn);

    // Row click -> toggle pin.hidden (onHide), but ignore clicks from menu button or checkbox
    el.addEventListener('click', (ev) => {
      if (ev.target && ev.target.closest) {
        if (ev.target.closest('.menu-btn')) return;
        if (ev.target.classList && ev.target.classList.contains('pin-checkbox')) return;
      }
      this.onHide(p, ev);
    });

    // Checkbox click -> selection toggle. Stop propagation so row onHide won't run.
    chk.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.onSelect(p, ev);
    });

    // Menu button -> open floating menu appended to body, but clamp to viewport and try downward first then upward
    menuBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // if a menu is already open for this item, close it
      if (this._openMenu && this._openMenu.target === menuBtn) {
        this._closeOpenMenu();
        return;
      }
      // close any other menu
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
      // append first so we can measure size
      document.body.appendChild(menu);

      // position with clamping
      const MARGIN = 8; // px from viewport edges
      const SPACING = 6; // px gap from button
      const menuW = Math.max(120, menu.offsetWidth || 120);
      const menuH = Math.max(36, menu.offsetHeight || 36);
      const innerW = window.innerWidth || document.documentElement.clientWidth;
      const innerH = window.innerHeight || document.documentElement.clientHeight;

      // default left aligns with button left, but clamp to viewport
      let left = Math.round(rect.left);
      left = Math.max(MARGIN, Math.min(left, innerW - menuW - MARGIN));

      // prefer below button
      let top = Math.round(rect.bottom + SPACING);
      // if not enough space below, open above
      if (top + menuH + MARGIN > innerH) {
        top = Math.round(rect.top - menuH - SPACING);
      }
      // clamp top to viewport
      top = Math.max(MARGIN, Math.min(top, innerH - menuH - MARGIN));

      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;

      // handlers
      const onRenameClick = (e) => {
        e.stopPropagation();
        const defaultName = p.label ? String(p.label) : (p.seriesName || '');
        const newName = window.prompt('请输入新的标记名称（只影响该标记条目）', defaultName);
        if (newName !== null) {
          this.onRename(p, newName);
        }
        this._closeOpenMenu();
      };
      const onDeleteClick = (e) => {
        e.stopPropagation();
        this.onDelete(p);
        this._closeOpenMenu();
      };

      const renameEl = menu.querySelector('.pin-menu-item.rename');
      const deleteEl = menu.querySelector('.pin-menu-item.delete');
      renameEl.addEventListener('click', onRenameClick);
      deleteEl.addEventListener('click', onDeleteClick);

      // close menu when clicking elsewhere
      const docHandler = (evDoc) => {
        if (!menu.contains(evDoc.target) && evDoc.target !== menuBtn) this._closeOpenMenu();
      };
      this._openMenu = { el: menu, target: menuBtn, handlers: { onRenameClick, onDeleteClick } };
      this._openMenuDocHandler = docHandler;
      document.addEventListener('click', docHandler);
    });

    return el;
  }
}
