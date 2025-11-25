import { Sidebar } from "./components/Sidebar.js";
import { ChartCore } from "./components/ChartCore.js";
import { ChartUI } from "./components/ChartUI.js";
import { PinnedList } from "./components/PinnedList.js";
import { formatSeconds } from "./utils/format.js";
import { dataModel } from "./models/DataModel.js";

const app = document.getElementById('app');
app.innerHTML = `
  <div id="status" class="box" style="display:flex;align-items:center;gap:8px;">就绪</div>
  <div class="main">
    <div id="sidebar" class="sidebar"></div>
    <div id="chartWrap" class="chart-wrap box"></div>
    <div id="rightbar" class="rightbar"></div>
  </div>
`;

const statusEl = document.getElementById('status');
const sidebar = new Sidebar(document.getElementById('sidebar'));
const chartWrap = document.getElementById('chartWrap');
const rightbar = document.getElementById('rightbar');

const core = new ChartCore();
const ui = new ChartUI(core, chartWrap);
// Provide legacy alias
const chart = core;
chart.exportPNG = ui.exportPNG.bind(ui);

// reset button (unchanged)
const resetBtn = document.createElement('button');
resetBtn.className = 'chart-reset-btn';
resetBtn.title = '重置视窗';
resetBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 3v6h-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
chartWrap.appendChild(resetBtn);
resetBtn.addEventListener('click', () => {
  if (!dataModel.originalViewSet) { setStatus('尚未記錄初始視窗'); return; }
  dataModel.viewMinX = dataModel.originalViewMin;
  dataModel.viewMaxX = dataModel.originalViewMax;
  chart.resampleInView();
  setStatus('视窗已重置');
});

// tooltip element (hover)
const tooltip = document.createElement('div');
tooltip.className = 'tooltip';
document.body.appendChild(tooltip);

function setStatus(msg, loading = false) {
  statusEl.textContent = msg;
  statusEl.setAttribute('aria-live', 'polite');
  if (loading) statusEl.classList.add('loading'); else statusEl.classList.remove('loading');
}

// pinned list UI
const pinnedListContainer = document.createElement('div');
pinnedListContainer.className = 'box pinned-box stretch';
pinnedListContainer.innerHTML = `
  <strong>标记点（Pinned）</strong>
  <div class="small" style="margin-bottom:6px">支持 Shift/Ctrl 多选或按住 Shift 框选</div>
  <div style="display:flex; gap:8px; margin-bottom:8px;">
    <button id="selectAllPinned" class="card-btn" style="padding:8px 10px; width:auto;">全选</button>
    <button id="deleteSelectedPinned" class="card-btn" style="padding:8px 10px; width:auto; background: #ff5a5f; color:#fff;">删除选中</button>
  </div>
  <div id="pinnedListRoot" style="margin-top:8px"></div>
`;
rightbar.appendChild(pinnedListContainer);
const pinnedList = new PinnedList(document.getElementById('pinnedListRoot'));

// bulk action buttons wiring
const selectAllBtn = pinnedListContainer.querySelector('#selectAllPinned');
const deleteSelectedBtn = pinnedListContainer.querySelector('#deleteSelectedPinned');

selectAllBtn.addEventListener('click', () => {
  if (!dataModel.pinnedPoints || dataModel.pinnedPoints.length === 0) {
    setStatus('没有标记点可供选择');
    return;
  }
  for (const p of dataModel.pinnedPoints) p.selected = true;
  dataModel._emit('pinnedChanged', dataModel.pinnedPoints);
  setStatus(`已全选 ${dataModel.pinnedPoints.length} 个标记`);
});

deleteSelectedBtn.addEventListener('click', () => {
  if (!dataModel.pinnedPoints || dataModel.pinnedPoints.length === 0) {
    setStatus('没有标记点可供删除');
    return;
  }
  const toDelete = dataModel.pinnedPoints.filter(p => p.selected);
  if (toDelete.length === 0) {
    setStatus('未选中任何标记');
    return;
  }
  for (const p of toDelete) {
    const idx = dataModel.pinnedPoints.indexOf(p);
    if (idx >= 0) dataModel.pinnedPoints.splice(idx, 1);
  }
  dataModel._emit('pinnedChanged', dataModel.pinnedPoints);
  setStatus(`已删除 ${toDelete.length} 个标记`);
});

// wire sidebar
sidebar.onOpenFile = async () => {
  const fi = document.createElement('input');
  fi.type = 'file';
  // accept CSV and JSON files
  fi.accept = '.csv,text/csv,text/plain,.json,application/json';
  fi.multiple = true; fi.style.display = 'none';
  fi.addEventListener('change', async (ev) => {
    const files = Array.from(ev.target.files || []);
    if (files.length === 0) { setStatus('未选择文件'); return; }
    setStatus('开始解析文件...');
    for (const f of files) await chart.loadFile(f);
  });
  document.body.appendChild(fi);
  fi.click();
  setTimeout(()=> fi.remove(), 3000);
};

sidebar.onExportPNG = async () => {
  const blob = await chart.exportPNG();
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'chart.png'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
};
sidebar.onExportCSV = () => {
  const arr = [];
  for (const s of dataModel.seriesList) {
    const arrPts = s.sampled && s.sampled.length ? s.sampled : s.rel;
    if (!arrPts) continue;
    for (const p of arrPts) arr.push(`${JSON.stringify(s.name)},${p[0]},${p[1]}`);
  }
  const out = 'series,rel_us,value\n' + arr.join('\n');
  const blob = new Blob([out], {type: 'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'sampled.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
};
sidebar.onExportPinned = () => {
  const blob = chart.exportPinnedCSV();
  if (!blob) { alert('没有任何标记点可导出'); return; }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'pinned.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
};
sidebar.onClearAll = () => { chart.seriesList = []; chart.clearPinned(); chart.resampleInView(); sidebar.updateLegend([]); pinnedList.setPinned([]); setStatus('已清除所有序列及标记'); };
sidebar.onTargetChange = (v) => { chart.setSampleTarget ? chart.setSampleTarget(v) : null; };
sidebar.onAutoFit = () => { chart.resampleInView(); setStatus('已自动适配像素'); };
sidebar.onZoomReset = () => { dataModel.viewMinX = 0; dataModel.viewMaxX = chart.computeGlobalExtents().max; chart.resampleInView(); setStatus('视窗已重置'); };
sidebar.onResetOriginal = () => {
  if (!dataModel.originalViewSet) { alert('尚未记录初始视窗'); return; }
  dataModel.viewMinX = dataModel.originalViewMin; dataModel.viewMaxX = dataModel.originalViewMax; chart.resampleInView(); setStatus('已恢复到初始视窗');
};
sidebar.onFitAll = () => { const ext = chart.computeGlobalExtents(); dataModel.viewMinX = 0; dataModel.viewMaxX = ext.max; chart.resampleInView(); setStatus('已适配所有数据'); };

// ensure legend click toggles visibility
sidebar.legendClick = (series) => {
  series.visible = !series.visible;
  chart.resampleInView();
  sidebar.updateLegend(dataModel.seriesList);
  setStatus(`${series.name} 已${series.visible ? '显示' : '隐藏'}`);
};

// wire model events to UI
dataModel.on('status', (msg) => setStatus(msg));
dataModel.on('seriesChanged', (series) => sidebar.updateLegend(series));
dataModel.on('pinnedChanged', (pins) => pinnedList.setPinned(pins));
dataModel.on('resampled', () => {
  // UI will re-render via dataModel.on('resampled') inside ChartUI
});
dataModel.on('hover', (candidate) => {
  if (!candidate) { tooltip.style.display = 'none'; return; }
  tooltip.style.display = 'block';
  tooltip.style.left = candidate.clientX + 'px';
  tooltip.style.top = (candidate.clientY - 8) + 'px';
  tooltip.style.background = candidate.series.color || '#333';
  tooltip.style.color = '#fff';
  tooltip.style.padding = '8px 10px';
  tooltip.style.borderRadius = '8px';
  tooltip.innerHTML = `<div style="font-weight:700">${candidate.series.name}</div><div style="opacity:0.95">${formatSeconds(candidate.point[0]/1e6)} — ${candidate.point[1]}</div>`;
});

// pinnedList interactions
pinnedList.onJump = (p) => {
  chart.jumpToPin ? chart.jumpToPin(p) : null;
  setStatus(`跳转到 ${p.seriesName}`);
};
pinnedList.onDelete = (p) => {
  chart.removePinned(p);
  setStatus('已删除标记', false);
};
// Selection: toggle p.selected (triggered by checkbox)
pinnedList.onSelect = (p, ev) => {
  p.selected = !p.selected;
  dataModel._emit('pinnedChanged', dataModel.pinnedPoints);
};
// Row click: toggle the pin's hidden flag (hide/show the single pin)
pinnedList.onHide = (p, ev) => {
  p.hidden = !p.hidden;
  dataModel._emit('pinnedChanged', dataModel.pinnedPoints);
  setStatus(`标记 ${p.seriesName} ${(p.relMicro/1e6).toFixed(3)}s 已${p.hidden ? '隐藏' : '显示'}`);
};
// NEW: rename handler — update pin label and propagate to source point if present
pinnedList.onRename = (p, newName) => {
  const label = String(newName || '');
  p.label = label;
  // if pin is linked to a source point object, update that object's label for export sync
  if (p.sourcePoint && typeof p.sourcePoint === 'object') {
    try { p.sourcePoint.label = label; } catch (e) { /* best-effort */ }
  }
  dataModel._emit('pinnedChanged', dataModel.pinnedPoints);
  setStatus('已重命名标记');
};
window.addEventListener('keydown', (ev) => ui.handleKeyEvent && ui.handleKeyEvent(ev), true);

// Drag & drop upload (on chartWrap) - unchanged
let dragCounter = 0;
const dropOverlay = document.createElement('div');
dropOverlay.className = 'drop-overlay';
dropOverlay.style.display = 'none';
dropOverlay.innerHTML = `<div class="message">释放文件以上传（支持多个 CSV）</div>`;
chartWrap.appendChild(dropOverlay);

chartWrap.addEventListener('dragenter', (ev) => {
  ev.preventDefault(); ev.stopPropagation();
  dragCounter++;
  chartWrap.classList.add('dragover');
  dropOverlay.style.display = 'flex';
  setStatus('检测到拖拽文件，释放以上传', true);
});
chartWrap.addEventListener('dragover', (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; });
chartWrap.addEventListener('dragleave', (ev) => {
  ev.preventDefault(); ev.stopPropagation();
  dragCounter--;
  if (dragCounter <= 0) { chartWrap.classList.remove('dragover'); dropOverlay.style.display = 'none'; setStatus('就绪', false); dragCounter = 0; }
});
chartWrap.addEventListener('drop', async (ev) => {
  ev.preventDefault(); ev.stopPropagation();
  chartWrap.classList.remove('dragover'); dropOverlay.style.display = 'none'; dragCounter = 0;
  setStatus('开始处理拖拽的文件...', true);
  try {
    const items = ev.dataTransfer.files;
    if (!items || items.length === 0) { setStatus('未检测到文件', false); return; }
    for (const f of Array.from(items)) {
      if (f && f.size > 0) await chart.loadFile(f);
    }
    const ext = chart.computeGlobalExtents();
    dataModel.viewMinX = 0; dataModel.viewMaxX = ext.max; chart.resampleInView();
    setStatus('上传完成', false);
  } catch (err) {
    console.error('[drop] error', err);
    setStatus('上传失败: ' + (err && err.message ? err.message : err), false);
    alert('上传失败: ' + (err && err.message ? err.message : err));
  }
});

// initial render
chart.resampleInView();
setStatus('就绪');
