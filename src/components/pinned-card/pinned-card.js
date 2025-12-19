import '../base-card/base-card.js';
import '../item-list/item-list.js';
import template from './pinned-card.html?raw';
import style from './pinned-card.css?raw';
import { dataModel } from '../../model/data-model.js';

export class PinnedCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode: 'open'});
    this.shadowRoot.innerHTML = `${template}<style>${style}</style>`;
  }
  connectedCallback() {
    this._bind();
    this._updateList();
    dataModel.pinnedList.on && dataModel.pinnedList.on('changed', () => this._updateList());
  }

  _bind() {
    const itemList = this.shadowRoot.getElementById('itemList');
    // 菜单：导出等
    itemList.menuConfig = [
    ];
    // 监听重命名、删除
    itemList.addEventListener('menu-action', e => {
    });
  }

  _updateList() {
    const itemList = this.shadowRoot.getElementById('itemList');
    itemList.list = dataModel.pinnedList;
  }

  _setStatus(msg, loading = false) {
    const statusBar = document.querySelector('status-bar');
    if (statusBar && typeof statusBar.setStatus === 'function') {
      statusBar.setStatus(msg, loading);
    }
  }
}
customElements.define('pinned-card', PinnedCard);

