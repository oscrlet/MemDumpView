<template>
  <div class="page-detail-overlay"
       @click.self="$emit('close')"
       @mousemove.stop
       @mouseover.stop
       @mouseenter.stop>
    <div class="detail-card">
      <div class="detail-header">
        <div class="header-info">
          <h3>Page Detail - {{ typeName }}</h3>
          <p>Resolution: 8 bytes per block</p>
        </div>
        <button class="close-btn" @click="$emit('close')">&times;</button>
      </div>

      <div class="detail-stats">
        <div class="stat-box">
            <span class="label">Total Size</span>
            <span class="value">{{ formatBytes(page.size) }}</span>
        </div>
        <div v-if="page.freeList" class="stat-box">
            <span class="label">Used Size</span>
            <span class="value">{{ formatBytes(usedSize) }}</span>
        </div>
        <div v-if="page.freeList" class="stat-box">
            <span class="label">Free Regions</span>
            <span class="value">{{ page.freeList.length }}</span>
        </div>
      </div>

      <div ref="containerRef" class="chart-container">
        <div ref="chartDiv" class="detail-chart"></div>
      </div>

      <div class="legend">
          <div class="legend-item"><span class="swatch used"></span> Used</div>
          <div class="legend-item"><span class="swatch free"></span> Free</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, shallowRef } from 'vue';
import * as echarts from 'echarts';
import type { Page } from '@/types';
import { traverseRLEBitmap } from '@/utils/binaryParser';

const props = defineProps<{
  page: Page;
  typeName: string;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const chartDiv = ref<HTMLDivElement | null>(null);
const chartInstance = shallowRef<echarts.ECharts | null>(null);
let resizeObserver: ResizeObserver | null = null;

const usedSize = computed(() => {
  if (props.page.freeList) {
    const freeSize = props.page.freeList.reduce((s, range) => s + (range[1] - range[0]), 0);
    return Math.max(0, props.page.size - freeSize);
  }
  if (props.page.bitmap && typeof props.page.bitmap === 'string') {
    let freeSize = 0;
    traverseRLEBitmap(props.page.bitmap, (isFree, len) => {
        if (isFree) freeSize += len * 8;
    });
    return Math.max(0, props.page.size - freeSize);
  }
  return props.page.size; // Default to full if no info? Or 0? Let's assume full used if no free info.
});

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const updateChart = () => {
    if (!chartInstance.value) return;

    const totalSize = props.page.size;
    if (totalSize <= 0) return;

    // Check if we have data to render
    if (!props.page.freeList && !props.page.bitmap) {
        return;
    }

    // 1. Calculate Segments (Contiguous Used/Free blocks)
    const segments: { type: 'used' | 'free', start: number, end: number, size: number }[] = [];

    if (props.page.freeList) {
         // Legacy FreeList Logic
        let lastOffset = 0;
        const sortedFreeList = [...props.page.freeList].sort((a, b) => a[0] - b[0]);

        for (const [start, end] of sortedFreeList) {
            if (start > lastOffset) {
                segments.push({ type: 'used', start: lastOffset, end: start, size: start - lastOffset });
            }
            segments.push({ type: 'free', start: start, end: end, size: end - start });
            lastOffset = end;
        }
        if (lastOffset < totalSize) {
            segments.push({ type: 'used', start: lastOffset, end: totalSize, size: totalSize - lastOffset });
        }
    } else if (props.page.bitmap && typeof props.page.bitmap === 'string') {
        // Direct Bitmap RLE Traversal
        let currentOffset = 0;
        traverseRLEBitmap(props.page.bitmap, (isFree, len) => {
            const byteLen = len * 8;
            if (byteLen > 0) {
                 segments.push({
                     type: isFree ? 'free' : 'used',
                     start: currentOffset,
                     end: currentOffset + byteLen,
                     size: byteLen
                 });
                 currentOffset += byteLen;
            }
        });
        // Handle potential trailing space if any (RLE might be slightly short if final blocks are implicit?)
        // Our encoder is explicit, but good to be safe.
        if (currentOffset < totalSize) {
            // Implicitly occupied or strictly part of the page?
            // Usually the bitmap covers the full size. If not, assume occ?
            // Actually, if it falls short, it's safer to not add phantom data, or add 'used' if we are sure.
            // Let's add 'used' to fill the page, consistent with FreeList logic.
            segments.push({ type: 'used', start: currentOffset, end: totalSize, size: totalSize - currentOffset });
        }
    }

    // 2. Prepare ECharts Custom Series Data
    // We treat the memory as a 2D grid of 'units'.
    // To keep it visually consistent, let's use a fixed grid width (e.g. 128 units)
    // and calculate rows based on total size.
    const gridWidth = Math.ceil(Math.sqrt(totalSize / 8)); // 8 bytes per "visual unit" base
    const unitSize = 8; // Each unit in the grid represents 8 bytes (adjustable for visual density)

    // Each data item for the custom series will be a segment.
    // The custom series renderItem will handle splitting it into multiple row-rectangles.
    const chartData = segments.map(seg => [
        seg.start,
        seg.end,
        seg.type === 'used' ? 1 : 0
    ]);

    const option: echarts.EChartsOption = {
        tooltip: {
            show: true,
            formatter: (params: any) => {
                const [start, end, typeVal] = params.data;
                return `Range: ${start} - ${end} (${formatBytes(end - start)})<br/>State: ${typeVal === 1 ? 'Used' : 'Free'}`;
            }
        },
        grid: {
            top: 5,
            bottom: 5,
            left: 5,
            right: 5
        },
        xAxis: { type: 'value', min: 0, max: gridWidth, show: false },
        yAxis: { type: 'value', min: 0, show: false }, // max will be determined by data
        series: [{
            type: 'custom',
            renderItem: (_params, api) => {
                const start = api.value(0) as number;
                const end = api.value(1) as number;
                const typeVal = api.value(2);

                // Map memory offset to grid coordinates
                const startIdx = Math.floor(start / unitSize);
                const endIdx = Math.max(startIdx, Math.floor(end / unitSize) - 1); // -1 because end is exclusive

                const startX = startIdx % gridWidth;
                const startY = Math.floor(startIdx / gridWidth);
                const endX = endIdx % gridWidth;
                const endY = Math.floor(endIdx / gridWidth);

                const color = typeVal === 1 ? '#ef4444' : '#f3f4f6';
                const children: any[] = [];

                if (startY === endY) {
                    // Single row rectangle
                    const p1 = api.coord([startX, startY]);
                    const p2 = api.coord([endX + 1, startY + 1]);
                    if (!p1 || !p2) return;
                    children.push({
                        type: 'rect',
                        shape: { x: p1[0]!, y: p1[1]!, width: p2[0]! - p1[0]!, height: p2[1]! - p1[1]! },
                        style: { fill: color }
                    });
                } else {
                    // Multiple rows
                    // 1. First row partial
                    const p1_s = api.coord([startX, startY]);
                    const p1_e = api.coord([gridWidth, startY + 1]);
                    if (p1_s && p1_e) {
                        children.push({
                            type: 'rect',
                            shape: { x: p1_s[0]!, y: p1_s[1]!, width: p1_e[0]! - p1_s[0]!, height: p1_e[1]! - p1_s[1]! },
                            style: { fill: color }
                        });
                    }

                    // 2. Middle rows full
                    if (endY - startY > 1) {
                        const pm_s = api.coord([0, startY + 1]);
                        const pm_e = api.coord([gridWidth, endY]);
                        if (pm_s && pm_e) {
                            children.push({
                                type: 'rect',
                                shape: { x: pm_s[0]!, y: pm_s[1]!, width: pm_e[0]! - pm_s[0]!, height: pm_e[1]! - pm_s[1]! },
                                style: { fill: color }
                            });
                        }
                    }

                    // 3. Last row partial
                    const p3_s = api.coord([0, endY]);
                    const p3_e = api.coord([endX + 1, endY + 1]);
                    if (p3_s && p3_e) {
                        children.push({
                            type: 'rect',
                            shape: { x: p3_s[0]!, y: p3_s[1]!, width: p3_e[0]! - p3_s[0]!, height: p3_e[1]! - p3_s[1]! },
                            style: { fill: color }
                        });
                    }
                }

                return {
                    type: 'group',
                    children: children
                };
            },
            data: chartData,
            animation: false
        }]
    };

    // Update Y axis max based on total units
    const totalUnits = Math.ceil(totalSize / unitSize);
    const maxRows = Math.ceil(totalUnits / gridWidth);
    (option.yAxis as any).max = maxRows;
    (option.yAxis as any).inverse = true; // Make 0 at top

    chartInstance.value.setOption(option);
};

onMounted(() => {
    if (chartDiv.value) {
        chartInstance.value = echarts.init(chartDiv.value);
        updateChart();

        resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                const size = Math.min(width, height);

                if (chartDiv.value) {
                    chartDiv.value.style.width = `${size}px`;
                    chartDiv.value.style.height = `${size}px`;
                }
                chartInstance.value?.resize();
            }
        });
        if (containerRef.value) {
            resizeObserver.observe(containerRef.value);
        }
    }
});

onUnmounted(() => {
    if (resizeObserver && containerRef.value) {
        resizeObserver.unobserve(containerRef.value);
    }
    chartInstance.value?.dispose();
});

watch(() => props.page, updateChart, { deep: true });
</script>

<style scoped>
.page-detail-overlay {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.98); /* Slightly more opaque */
    z-index: 2000; /* Higher priority */
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
    backdrop-filter: blur(8px);
    pointer-events: auto; /* Explicitly consume events */
}

.detail-card {
    background: white;
    width: 100%;
    height: 100%;
    max-width: 600px;
    max-height: 600px;
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    display: flex;
    flex-direction: column;
    padding: 20px;
    border: 1px solid #e5e7eb;
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

.close-btn {
    background: #f3f4f6;
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #4b5563;
    transition: background 0.2s;
}

.close-btn:hover {
    background: #e5e7eb;
}

.detail-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 20px;
}

.stat-box {
    background: #f9fafb;
    padding: 12px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.stat-box .label {
    font-size: 0.75rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.stat-box .value {
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
}

.chart-container {
    flex-grow: 1;
    min-height: 0;
    background: #fdfdfd;
    border: 1px solid #f3f4f6;
    border-radius: 4px;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
}



.legend {
    display: flex;
    gap: 16px;
    margin-top: 16px;
    justify-content: center;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.875rem;
    color: #4b5563;
}

.swatch {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    border: 1px solid rgba(0,0,0,0.05);
}

.swatch.used { background-color: #ef4444; }
.swatch.free { background-color: #f3f4f6; }
</style>
