import { ChartModel } from "./models/ChartModel.js";
import { ChartViewModel } from "./viewmodels/ChartViewModel.js";
import { SidebarViewModel } from "./viewmodels/SidebarViewModel.js";
import { PinnedListViewModel } from "./viewmodels/PinnedListViewModel.js";
import { ChartView } from "./views/ChartView.js";
import { SidebarView } from "./views/SidebarView.js";
import { PinnedListView } from "./views/PinnedListView.js";
import { formatSeconds } from "./utils/format.js";

const app = document.getElementById('app');
app.innerHTML = `
  <div class="controls"><div class="left small">拖拽上传或使用左侧"交互"面板打开文件。</div><div style="margin-left:auto" class="small">悬停显示点、点击固定浮窗、滚轮缩放、拖拽平移、双击复位</div></div>
  <div id="status" class="box" style="display:flex;align-items:center;gap:8px;">就绪</div>
  <div class="main">
    <div id="sidebar" class="sidebar"></div>
    <div id="chartWrap" class="chart-wrap box"></div>
    <div id="rightbar" class="rightbar"></div>
  </div>
`;

const statusEl = document.getElementById('status');
const chartWrap = document.getElementById('chartWrap');
const rightbar = document.getElementById('rightbar');

// ========== MVVM Initialization ==========
// Model
const chartModel = new ChartModel();

// ViewModels
const chartViewModel = new ChartViewModel(chartModel);
const sidebarViewModel = new SidebarViewModel(chartModel);
const pinnedListViewModel = new PinnedListViewModel(chartModel);

// Views
const chartView = new ChartView(chartViewModel, chartWrap);
const sidebarView = new SidebarView(
  sidebarViewModel,
  document.getElementById('sidebar'),
  () => chartView.exportPNG() // Pass exportPNG function
);

// Reset button (unchanged)
const resetBtn = document.createElement('button');
resetBtn.className = 'chart-reset-btn';
resetBtn.title = '重置视窗';
resetBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 3v6h-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
chartWrap.appendChild(resetBtn);
resetBtn.addEventListener('click', () => {
  if (!chartModel.originalViewSet) {
    setStatus('尚未記錄初始視窗');
    return;
  }
  chartModel.viewMinX = chartModel.originalViewMin;
  chartModel.viewMaxX = chartModel.originalViewMax;
  chartModel.resampleInView();
  setStatus('视窗已重置');
});

// Tooltip element (hover)
const tooltip = document.createElement('div');
tooltip.className = 'tooltip';
document.body.appendChild(tooltip);

function setStatus(msg, loading = false) {
  statusEl.textContent = msg;
  statusEl.setAttribute('aria-live', 'polite');
  if (loading) statusEl.classList.add('loading');
  else statusEl.classList.remove('loading');
}

// Pinned list UI container
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

const pinnedListView = new PinnedListView(
  pinnedListViewModel,
  document.getElementById('pinnedListRoot')
);

// Bulk action buttons wiring
const selectAllBtn = pinnedListContainer.querySelector('#selectAllPinned');
const deleteSelectedBtn = pinnedListContainer.querySelector('#deleteSelectedPinned');

selectAllBtn.addEventListener('click', () => {
  pinnedListViewModel.selectAllPins();
});

deleteSelectedBtn.addEventListener('click', () => {
  pinnedListViewModel.deleteSelectedPins();
});

// ========== Wire Model Events to UI ==========
chartModel.on('status', (msg) => setStatus(msg));
chartModel.on('hover', (candidate) => {
  if (!candidate) {
    tooltip.style.display = 'none';
    return;
  }
  tooltip.style.display = 'block';
  tooltip.style.left = candidate.clientX + 'px';
  tooltip.style.top = (candidate.clientY - 8) + 'px';
  tooltip.style.background = candidate.series.color || '#333';
  tooltip.style.color = '#fff';
  tooltip.style.padding = '8px 10px';
  tooltip.style.borderRadius = '8px';
  tooltip.innerHTML = `<div style="font-weight:700">${candidate.series.name}</div><div style="opacity:0.95">${formatSeconds(candidate.point[0]/1e6)} — ${candidate.point[1]}</div>`;
});

// ========== Keyboard Events ==========
window.addEventListener('keydown', (ev) => {
  if (chartView.handleKeyEvent) {
    chartView.handleKeyEvent(ev);
  }
}, true);

// ========== Drag & Drop Upload ==========
let dragCounter = 0;
const dropOverlay = document.createElement('div');
dropOverlay.className = 'drop-overlay';
dropOverlay.style.display = 'none';
dropOverlay.innerHTML = `<div class="message">释放文件以上传（支持多个 CSV）</div>`;
chartWrap.appendChild(dropOverlay);

chartWrap.addEventListener('dragenter', (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  dragCounter++;
  chartWrap.classList.add('dragover');
  dropOverlay.style.display = 'flex';
  setStatus('检测到拖拽文件，释放以上传', true);
});

chartWrap.addEventListener('dragover', (ev) => {
  ev.preventDefault();
  ev.dataTransfer.dropEffect = 'copy';
});

chartWrap.addEventListener('dragleave', (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  dragCounter--;
  if (dragCounter <= 0) {
    chartWrap.classList.remove('dragover');
    dropOverlay.style.display = 'none';
    setStatus('就绪', false);
    dragCounter = 0;
  }
});

chartWrap.addEventListener('drop', async (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  chartWrap.classList.remove('dragover');
  dropOverlay.style.display = 'none';
  dragCounter = 0;
  setStatus('开始处理拖拽的文件...', true);
  
  try {
    const items = ev.dataTransfer.files;
    if (!items || items.length === 0) {
      setStatus('未检测到文件', false);
      return;
    }
    
    for (const f of Array.from(items)) {
      if (f && f.size > 0) {
        await chartModel.loadFile(f);
      }
    }
    
    const ext = chartModel.computeGlobalExtents();
    chartModel.viewMinX = 0;
    chartModel.viewMaxX = ext.max;
    chartModel.resampleInView();
    setStatus('上传完成', false);
  } catch (err) {
    console.error('[drop] error', err);
    setStatus('上传失败: ' + (err && err.message ? err.message : err), false);
    alert('上传失败: ' + (err && err.message ? err.message : err));
  }
});

// ========== Try Load Sample Files ==========
(async function tryLoadSamples() {
  const samples = ['sample1.csv', 'sample2.csv'];
  for (const s of samples) {
    try {
      const resp = await fetch(s);
      if (!resp.ok) continue;
      const text = await resp.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const parsed = [];
      
      for (const line of lines) {
        const parts = line.split(',').map(x => x.trim());
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        if (isFinite(x) && isFinite(y)) parsed.push([x, y]);
      }
      
      if (parsed.length === 0) continue;
      
      const id = crypto.randomUUID?.() || `s${Date.now()}${Math.random()}`;
      parsed.sort((a, b) => a[0] - b[0]);
      const firstX = parsed[0][0];
      const rel = parsed.map(p => [p[0] - firstX, p[1]]);
      
      chartModel.seriesList = [
        ...chartModel.seriesList,
        { id, name: s, raw: parsed, rel, sampled: [], color: '', visible: true, firstX }
      ];
    } catch(e) {
      // Ignore sample loading errors
    }
  }
  
  if (chartModel.seriesList.length > 0) {
    chartModel._applyColors();
    const ext = chartModel.computeGlobalExtents();
    chartModel.viewMinX = 0;
    chartModel.viewMaxX = ext.max;
    chartModel.resampleInView();
    sidebarView.updateLegend(chartModel.seriesList);
    
    if (!chartModel.originalViewSet) {
      chartModel.originalViewMin = 0;
      chartModel.originalViewMax = ext.max;
      chartModel.originalViewSet = true;
    }
  }
})();

// Initial render
chartModel.resampleInView();
setStatus('就绪');
