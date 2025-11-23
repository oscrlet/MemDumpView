import './PinnedList.css';
import { formatSI, formatSeconds } from "../utils/format.js";

export class PinnedList {
  constructor(container) {
    this.container = container;
    this.pinned = [];
    this.filter = '__all';
    this.groupBy = false;
    this.sortBy = 'time';
    this.onJump = () => {};
    this.onDelete = () => {};
    this.onRename = () => {};
    this.onSelect = () => {};
    this._activeMenu = null;
    this._render();
  }

  setPinned(pins) { this.pinned = pins ? pins.slice() : []; this._render(); }
  updateOptions({ filter, groupBy, sortBy } = {}) {
    if (filter !== undefined) this.filter = filter;
    if (groupBy !== undefined) this.groupBy = groupBy;
    if (sortBy !== undefined) this.sortBy = sortBy;
    this._render();
  }
  _render() {
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
    el.className = 'pinned-item' + (p.selected ? ' selected' : '');
    const meta = document.createElement('div'); meta.className='meta';
    const title = document.createElement('div'); title.className='title'; title.textContent = p.seriesName;
    const sub = document.createElement('div'); sub.className='sub'; sub.textContent = `${formatSeconds(p.relMicro/1e6)} — ${formatSI(p.val)}`;
    meta.appendChild(title); meta.appendChild(sub);
    const actions = document.createElement('div'); actions.className='actions';
    const jumpBtn = document.createElement('button'); jumpBtn.className='btn-ghost'; jumpBtn.textContent='跳转';
    const menuBtn = document.createElement('button'); menuBtn.className='btn-ghost btn-menu'; menuBtn.textContent='⋮';
    actions.appendChild(jumpBtn); actions.appendChild(menuBtn);
    el.appendChild(meta); el.appendChild(actions);

    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.onSelect(p, ev);
    });
    jumpBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.onJump(p); });
    menuBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this._openMenu(p, menuBtn); });

    return el;
  }

  _openMenu(p, button) {
    // Close any existing menu
    this._closeMenu();

    const menu = document.createElement('div');
    menu.className = 'pin-floating-menu';
    
    const renameBtn = document.createElement('button');
    renameBtn.className = 'menu-item';
    renameBtn.textContent = '重命名';
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'menu-item menu-item-danger';
    deleteBtn.textContent = '删除';
    
    menu.appendChild(renameBtn);
    menu.appendChild(deleteBtn);
    
    // Append to body so it can overflow the card
    document.body.appendChild(menu);
    
    // Measure menu dimensions
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const rect = button.getBoundingClientRect();
    
    // Get window dimensions
    const innerWidth = window.innerWidth;
    const innerHeight = window.innerHeight;
    
    // Calculate horizontal position (clamp to viewport)
    let left = rect.left;
    left = Math.max(8, Math.min(left, innerWidth - menuWidth - 8));
    
    // Calculate vertical position (prefer below, fallback to above)
    let top = rect.bottom + 6;
    if (top + menuHeight + 8 > innerHeight) {
      // Not enough space below, try above
      top = rect.top - menuHeight - 6;
      if (top < 8) {
        // Still not enough space, clamp to viewport
        top = Math.max(8, Math.min(top, innerHeight - menuHeight - 8));
      }
    }
    
    // Apply rounded positions
    menu.style.left = Math.round(left) + 'px';
    menu.style.top = Math.round(top) + 'px';
    
    // Wire up handlers
    renameBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._closeMenu();
      const newName = prompt('输入新名称:', p.seriesName);
      if (newName && newName.trim()) {
        this.onRename(p, newName.trim());
      }
    });
    
    deleteBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this._closeMenu();
      this.onDelete(p);
    });
    
    // Close menu on outside click
    // Use capture phase to handle clicks before they reach other elements
    const outsideClickHandler = (ev) => {
      if (!menu.contains(ev.target) && ev.target !== button) {
        this._closeMenu();
      }
    };
    
    // Add listener in next tick to avoid closing from the current click event
    requestAnimationFrame(() => {
      document.addEventListener('click', outsideClickHandler, true);
    });
    
    this._activeMenu = { element: menu, cleanup: () => {
      document.removeEventListener('click', outsideClickHandler, true);
    }};
  }

  _closeMenu() {
    if (this._activeMenu) {
      this._activeMenu.cleanup();
      this._activeMenu.element.remove();
      this._activeMenu = null;
    }
  }
}
