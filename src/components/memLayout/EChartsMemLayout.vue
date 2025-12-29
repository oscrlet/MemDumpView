<template>
  <div class="echarts-layout-container" :class="{ 'is-expanded-view': isChartExpanded }">
    <div v-if="conclusion && !isChartExpanded" class="detail-header-panel">
      <div class="detail-header">
        <div class="header-info">
          <h3>Memory Layout</h3>
          <p>Page-level occupancy grid</p>
        </div>
      </div>

      <div class="detail-stats">
        <div class="stat-box">
          <span class="label">Pages</span>
          <span class="value">{{ conclusion.totalPageCount }}</span>
        </div>
        <div class="stat-box">
          <span class="label">Total Size</span>
          <span class="value">{{ formatBytes(conclusion.totalSize) }}</span>
        </div>
        <div class="stat-box">
          <span class="label">Used Size</span>
          <span class="value">{{ formatBytes(conclusion.totalUsedSize) }}</span>
        </div>
        <div class="stat-box">
          <span class="label">Survival</span>
          <span class="value">{{ (conclusion.overallSurvivalRate * 100).toFixed(1) }}%</span>
        </div>
        <div class="stat-box danger" v-if="conclusion.emptyPageCount > 0">
          <span class="label">Empty Pages</span>
          <span class="value">{{ conclusion.emptyPageCount }}</span>
        </div>
        <div class="stat-box danger" v-if="conclusion.totalEmptySize > 0">
          <span class="label">Empty Size</span>
          <span class="value">{{ formatBytes(conclusion.totalEmptySize) }}</span>
        </div>
      </div>

      <div class="expandable-wrapper" :class="{ 'is-expanded': isExpanded, 'needs-toggle': needsToggle }">
        <div class="breakdown-header" v-if="isExpanded">
          <span class="breakdown-title">Page Type Breakdown</span>
          <button class="expand-toggle mini" @click="isExpanded = false">
            Show Less <svg class="rotate" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
        </div>

        <div ref="breakdownRef" class="compact-type-breakdown">
          <div v-for="type in conclusion.typeStats" :key="type.name" class="type-pill" :title="`${type.name}: ${type.count} pages, ${(type.survivalRate * 100).toFixed(1)}% survival`">
              <span class="type-dot" :style="{ backgroundColor: getTypeColor(type.name, 1) }"></span>
              <span class="type-name">{{ type.name }}</span>
              <span class="type-percent">{{ (type.survivalRate * 100).toFixed(0) }}%</span>
          </div>
        </div>

        <button v-if="needsToggle && !isExpanded" class="expand-toggle" @click="isExpanded = true">
           Show all {{ conclusion.typeStats.length }} types
           <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
      </div>
    </div>
    <!-- Responsive container -->
    <div ref="containerRef" class="chart-responsive-container">
        <!-- Explicit square chart div -->
        <div ref="chartDiv" class="chart-square"></div>
    </div>

    <!-- Page Detail Overlay -->
    <PageDetailViewer
      v-if="selectedPageDetail"
      :page="selectedPageDetail.page"
      :type-name="selectedPageDetail.typeName"
      @close="selectedPageDetail = null"
    />

    <!-- Expansion Controls -->
    <div class="chart-controls" v-if="conclusion">
      <button v-if="!isChartExpanded" class="icon-btn expand-btn" title="Expand Heatmap" @click="toggleExpansion">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
      </button>
      <button v-else class="icon-btn restore-btn" title="Restore View" @click="toggleExpansion">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, shallowRef, computed } from 'vue';
import * as echarts from 'echarts';
import type { MemoryMetadata, Page } from '@/types';
import PageDetailViewer from './PageDetailViewer.vue';
import { stringToHsl } from '@/utils/color';

const props = withDefaults(defineProps<{
  data: MemoryMetadata | undefined | null;
  targetTotalPages?: number; // Optional prop to force a specific grid size (based on total pages)
  clickable?: boolean;
}>(), {
  clickable: true
});

const containerRef = ref<HTMLDivElement | null>(null);
const chartDiv = ref<HTMLDivElement | null>(null);
const chartInstance = shallowRef<echarts.ECharts | null>(null);
let resizeObserver: ResizeObserver | null = null;

const selectedPageDetail = ref<{ page: Page; typeName: string } | null>(null);
const isExpanded = ref(false);
const needsToggle = ref(false);
const breakdownRef = ref<HTMLElement | null>(null);
const visibleCountAtOneLine = ref(0);
const isChartExpanded = ref(false);

const toggleExpansion = () => {
    isChartExpanded.value = !isChartExpanded.value;
    // Trigger chart update to apply/remove dataZoom and handle resize
    setTimeout(() => {
        if (chartInstance.value) {
            updateChart();
            chartInstance.value.resize();
        }
    }, 50);
};

const getTypeColor = (typeName: string, occupancy: number) => {
    // baseSaturation = 75, baseLightness = 45 (slightly darker for better contrast)
    return stringToHsl(typeName, 75, 45, occupancy);
};

const checkBreakdownOverflow = () => {
    if (!breakdownRef.value || !conclusion.value) return;

    const el = breakdownRef.value;
    const singleLineHeight = 32;

    // Temporarily set to full height to measure
    const originalMaxHeight = el.style.maxHeight;
    el.style.maxHeight = 'none';
    const naturalHeight = el.scrollHeight;
    el.style.maxHeight = originalMaxHeight;

    if (naturalHeight > singleLineHeight * 2.5) {
        needsToggle.value = true;
        visibleCountAtOneLine.value = Math.max(1, Math.floor(conclusion.value.typeStats.length / (naturalHeight / singleLineHeight)));
    } else {
        needsToggle.value = false;
        isExpanded.value = false;
    }
};

const conclusion = computed(() => {
    if (!props.data) return null;

    // Use pre-calculated conclusion if available
    if (props.data.conclusion) {
        console.log("Using pre-calculated conclusion:", props.data.conclusion);
        return props.data.conclusion;
    }

    // Fallback calculation
    let totalPageCount = 0;
    let grandTotalSize = 0;
    let grandTotalUsedSize = 0;
    let emptyPageCount = 0;
    let totalEmptySize = 0;
    const typeMap = new Map<string, { count: number; totalSize: number; usedSize: number }>();

    props.data.pageTypes.forEach(type => {
        const stats = { count: 0, totalSize: 0, usedSize: 0 };

        type.pages.forEach(page => {
            totalPageCount++;
            const totalSize = type.uniformPageSize || page.size || 0;
            let usedSize = 0;

            if (page.occupancy !== undefined) {
                usedSize = totalSize * page.occupancy;
            } else {
                const freeSize = ((page.freeList as [number, number][]) || []).reduce((s, range) => s + (range[1] - range[0]), 0);
                usedSize = Math.max(0, totalSize - freeSize);
            }

            const survivalRate = page.occupancy !== undefined ? page.occupancy : (totalSize > 0 ? usedSize / totalSize : 0);
            if (survivalRate === 0) {
              emptyPageCount++;
              totalEmptySize += totalSize;
            }

            stats.count++;
            stats.totalSize += totalSize;
            stats.usedSize += usedSize;

            grandTotalSize += totalSize;
            grandTotalUsedSize += usedSize;
        });

        typeMap.set(type.name, stats);
    });

    const typeStats = Array.from(typeMap.entries()).map(([name, stats]) => ({
        name,
        count: stats.count,
        survivalRate: stats.totalSize > 0 ? stats.usedSize / stats.totalSize : 0
    }));

    return {
        totalPageCount,
        totalSize: grandTotalSize,
        totalUsedSize: grandTotalUsedSize,
        overallSurvivalRate: grandTotalSize > 0 ? grandTotalUsedSize / grandTotalSize : 0,
        emptyPageCount,
        totalEmptySize,
        typeStats
    };
});

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const initChart = () => {
    if (chartDiv.value) {
        chartInstance.value = echarts.init(chartDiv.value);

        chartInstance.value.on('click', (params) => {
            if (!props.clickable) return;
            if (!props.data) return;

            if (params.componentType === 'series' && params.seriesType === 'heatmap') {
                const item = params.data as any;
                if (item && item.meta && item.meta.type === 'page') {
                    const typeIdx = item.meta.typeIndex;
                    const pageIdx = item.meta.pageIndex;
                    const type = props.data.pageTypes[typeIdx];
                    if (type && type.pages[pageIdx]) {
                        selectedPageDetail.value = {
                            page: type.pages[pageIdx]!,
                            typeName: type.name
                        };
                    }
                }
            }
        });

        updateChart();
    }
};

const updateChart = () => {
    if (!chartInstance.value || !props.data) {
        chartInstance.value?.clear();
        return;
    }

    const { pageTypes } = props.data;
    const pageRefs: { typeIdx: number; pageIdx: number; typeName: string }[] = [];
    pageTypes.forEach((type, typeIdx) => {
        type.pages.forEach((_, pageIdx) => {
            pageRefs.push({ typeIdx, pageIdx, typeName: type.name });
        });
    });

    const effectiveTotalPages = Math.max(pageRefs.length, props.targetTotalPages || 0);
    if (effectiveTotalPages === 0) {
        chartInstance.value.clear();
        return;
    }

    const gridSize = Math.ceil(Math.sqrt(effectiveTotalPages));
    const totalCells = gridSize * gridSize;
    const data = [];

    for (let i = 0; i < totalCells; i++) {
        const x = i % gridSize;
        const row = Math.floor(i / gridSize);
        const y = gridSize - 1 - row;

        const pageRef = pageRefs[i];
        if (pageRef) {
            const type = pageTypes[pageRef.typeIdx]!;
            const page = type.pages[pageRef.pageIdx]!;
            const pageSize = type.uniformPageSize || page.size || 0;
            let usedSize = 0;

            if (page.occupancy !== undefined) {
                usedSize = pageSize * page.occupancy;
            } else {
                const freeSize = page.freeList.reduce((s, range) => s + (range[1] - range[0]), 0);
                usedSize = Math.max(0, pageSize - freeSize);
            }

            const survivalRate = page.occupancy !== undefined ? page.occupancy : (pageSize > 0 ? usedSize / pageSize : 0);
            const color = getTypeColor(pageRef.typeName, survivalRate);
            data.push({
                value: [x, y, survivalRate] as any[],
                itemStyle: {
                    color: color,
                    borderColor: survivalRate === 0 ? '#94a3b8' : '#ffffff',
                    borderWidth: survivalRate === 0 ? 0.5 : 2,
                    borderRadius: 1
                },
                meta: {
                    type: 'page',
                    typeName: pageRef.typeName,
                    totalSize: pageSize,
                    usedSize,
                    survivalRate,
                    typeIndex: pageRef.typeIdx,
                    pageIndex: pageRef.pageIdx
                }
            });
        } else {
            data.push({
                value: [x, y, -1] as any[],
                meta: { type: 'empty' },
                itemStyle: { color: '#f3f4f6', borderColor: '#fff', borderWidth: 1 }
            });
        }
    }

    const option: echarts.EChartsOption = {
        tooltip: {
            confine: true,
            position: function (point, _params, _dom, _rect, size) {
                const [x, y] = point;
                const { contentSize, viewSize } = size;
                const [boxW, boxH] = contentSize;
                const [viewW, viewH] = viewSize;
                const offset = 10;
                let posX = x + offset;
                let posY = y + offset;
                if (posX + boxW > viewW) posX = x - offset - boxW;
                if (posY + boxH > viewH) posY = y - offset - boxH;
                return [posX, posY];
            },
            formatter: (params: any) => {
                const item = params.data;
                const meta = item.meta;
                if (meta.type === 'empty') return '';
                return `
                  <div style="font-size:12px;">
                    <b>${meta.typeName}</b><br/>
                    Size: ${formatBytes(meta.totalSize)}<br/>
                    Used: ${formatBytes(meta.usedSize)}<br/>
                    Survival: ${(meta.survivalRate * 100).toFixed(1)}%
                  </div>
                `;
            }
        },
        grid: { top: 10, bottom: 10, left: 10, right: 10, containLabel: false },
        xAxis: { type: 'category', show: false, data: Array.from({ length: gridSize }, (_, i) => i) },
        yAxis: { type: 'category', show: false, data: Array.from({ length: gridSize }, (_, i) => i) },
        visualMap: { show: false },
        dataZoom: isChartExpanded.value ? [
            {
                type: 'inside',
                xAxisIndex: 0,
                filterMode: 'none'
            },
            {
                type: 'inside',
                yAxisIndex: 0,
                filterMode: 'none'
            }
        ] : [],
        series: [
            {
                type: 'heatmap',
                data: data,
                label: { show: false },
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowColor: 'rgba(0, 0, 0, 0.5)',
                        borderWidth: 2
                    }
                },
                itemStyle: {
                    borderRadius: 1
                }
            } as any
        ]
    };
    chartInstance.value.setOption(option, { notMerge: true });
};
onMounted(() => {
    initChart();

    // Detect overflow after a short delay to ensure DOM is ready
    setTimeout(checkBreakdownOverflow, 100);

    resizeObserver = new ResizeObserver((entries) => {
        // Enforce square size in JS
        for (const entry of entries) {
            const { width, height } = entry.contentRect;
            const size = Math.min(width, height);

            if (chartDiv.value) {
                chartDiv.value.style.width = `${size}px`;
                chartDiv.value.style.height = `${size}px`;
            }
            chartInstance.value?.resize();
        }
        // Also re-check breakdown overflow on resize if needed
        checkBreakdownOverflow();
    });

    if (containerRef.value) {
        resizeObserver.observe(containerRef.value);
    }
});

onUnmounted(() => {
    if (resizeObserver && containerRef.value) {
        resizeObserver.unobserve(containerRef.value);
    }
    chartInstance.value?.dispose();
});

watch(() => props.data, () => {
    updateChart();
    setTimeout(checkBreakdownOverflow, 100);
}, { deep: false });

</script>

<style scoped>
.echarts-layout-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: white;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    position: relative; /* Anchor for absolute-positioned children like PageDetailViewer */
}

.detail-header-panel {
    flex-shrink: 0;
    padding: 20px;
    background-color: #fff;
    border-bottom: 1px solid #e5e7eb;
}

.detail-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
}

.detail-header h3 {
    margin: 0;
    font-size: 1.25rem;
    color: #111827;
}

.detail-header p {
    margin: 4px 0 0 0;
    font-size: 0.875rem;
    color: #6b7280;
}

.detail-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 10px;
}

.stat-box {
    background: #f9fafb;
    padding: 10px 8px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid #f3f4f6;
}

.stat-box .label {
    font-size: 0.7rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
}

.stat-box .value {
    font-size: 0.9rem;
    font-weight: 600;
    color: #111827;
}

.stat-box.danger {
    background: #fef2f2;
    border-color: #fee2e2;
}

.stat-box.danger .label {
    color: #991b1b;
}

.stat-box.danger .value {
    color: #b91c1c;
}

.expandable-wrapper {
    position: relative;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px dashed #e5e7eb;
}

.compact-type-breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    overflow: hidden;
    transition: max-height 0.3s ease;
}

.expandable-wrapper.needs-toggle:not(.is-expanded) .compact-type-breakdown {
    max-height: 28px; /* Slightly tighter for one line */
}

.breakdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.breakdown-title {
    font-size: 0.7rem;
    font-weight: 700;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.expand-toggle {
    margin-top: 10px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 11px;
    color: #4b5563;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.expand-toggle.mini {
    margin-top: 0;
    padding: 2px 8px;
    background: #f9fafb;
}

.expand-toggle:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
    color: #111827;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.expand-toggle svg {
    transition: transform 0.3s ease;
    color: #9ca3af;
}

.expand-toggle:hover svg {
    color: #6366f1;
}

.expand-toggle svg.rotate {
    transform: rotate(180deg);
}

.type-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.7rem;
    color: #4b5563;
    padding: 2px 8px;
    background: #fff;
    border-radius: 4px;
    border: 1px solid #f3f4f6;
}

.type-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
}

.type-name {
    font-weight: 500;
}

.type-percent {
    font-weight: 700;
    color: #111827;
    margin-left: 2px;
}

.chart-responsive-container {
    flex-grow: 1;
    width: 100%;
    min-height: 0; /* Enable shrinking */
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
}

.is-expanded-view .chart-responsive-container {
    background-color: #f8fafc;
}

.chart-controls {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 10;
}

.icon-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    background: white;
    color: #4b5563;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    transition: all 0.2s;
}

.icon-btn:hover {
    background: #f9fafb;
    color: #111827;
    border-color: #d1d5db;
    transform: translateY(-1px);
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
}

.icon-btn:active {
    transform: translateY(0);
}

.restore-btn {
    border-color: #6366f1;
    color: #6366f1;
}

</style>
