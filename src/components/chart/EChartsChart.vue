<template>
  <div ref="chartDiv" style="width: 100%; height: 100%"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, shallowRef } from 'vue';
import * as echarts from 'echarts';
import { useMainStore } from '@/store/main';
import type { SelectedPoint } from '@/types';
import { hexToRgba } from '@/utils/color';

const chartDiv = ref<HTMLDivElement | null>(null);
const chartInstance = shallowRef<echarts.ECharts | null>(null);
const store = useMainStore();
let resizeObserver: ResizeObserver | null = null;



const initChart = () => {
  if (chartDiv.value) {
    chartInstance.value = echarts.init(chartDiv.value);

    chartInstance.value.on('click', (params) => {
      // Check for click on 'series' component
      if (params.componentType === 'series') {
        let seriesId = params.seriesId as string;
        let dataIndex = params.dataIndex;

        // Handle clicks on the "Highlight" scatter series (names suffixed with -meta)
        // We use the ID to trace back to the original series
        if (seriesId && seriesId.endsWith('-meta')) {
            seriesId = seriesId.replace('-meta', '');
            // For metadata scatter, we store the original index in the data item if needed,
            // but here we can just rely on data matching or finding the point in the original series

            // params.data might be [timestamp, value] or Object.
            // Let's rely on finding the series first.
        }

        const originalSeries = store.seriesList.find(s => s.id === seriesId);

        if (originalSeries) {
          // If clicked on metadata point, we might need to find the specific point
          // because dataIndex in the scatter series != dataIndex in original series.
          // ECharts keeps the original data value.

          let originalPoint;
          const dataItem = params.data as { pointId?: string; value: any[] }; // Cast to our expected shape

          if (dataItem && dataItem.pointId) {
             // Precise lookup using ID
             originalPoint = originalSeries.data.find(p => p.pointId === dataItem.pointId);
          } else {
             // Fallback: try dataIndex (only works for main series if index alignment is preserved, which it IS for 'relativeData')
             // For scatter series, dataIndex does not match, but we provided pointId there too.
             if (params.seriesType === 'line') {
                 originalPoint = originalSeries.data[dataIndex];
             }
          }

          if (originalPoint) {
            const pointToAdd: SelectedPoint = {
              pointId: originalPoint.pointId || '',
              seriesId: seriesId,
              seriesName: originalSeries.name,
              timestamp: originalPoint.timestamp,
              value: originalPoint.value,
              meta: originalPoint.meta,
              isAnnotationVisible: true
            };
            store.addSelectedPoint(pointToAdd);
          }
        }
      }
    });

    updateChart();
  }
};

const updateChart = () => {
  if (!chartInstance.value) return;

  // Capture current zoom state
  let currentZoomStart: number | null = null;
  let currentZoomEnd: number | null = null;
  try {
      const currentOption = chartInstance.value.getOption() as any;
      if (currentOption && currentOption.dataZoom) {
          // Prefer 'inside' or 'slider' that has valid start/end
          const zoomComponent = currentOption.dataZoom.find((dz: any) => dz.start !== undefined && dz.end !== undefined);
          if (zoomComponent) {
               currentZoomStart = zoomComponent.start;
               currentZoomEnd = zoomComponent.end;
          }
      }
  } catch (e) {
      // Ignore error if getOption fails initially
  }

  const visibleSeries = store.seriesList.filter(s => s.visible);
  const seriesOptions: echarts.SeriesOption[] = [];

  // Base timestamp for relative time (e.g. 1970-01-01 00:00:00 UTC)
  // We use this so ECharts can format "Duration" as time (mm:ss, HH:mm:ss) easily if we want,
  // or just to align them all.
  const BASE_TIMESTAMP = new Date('1970-01-01T00:00:00Z').getTime();

  visibleSeries.forEach((s) => {
    const color = s.color || '#5470c6'; // Fallback to default

    // Calculate Start Time for this series to normalize
    let seriesStartTime = 0;
    const firstPoint = s.data[0];
    if (firstPoint) {
        seriesStartTime = typeof firstPoint.timestamp === 'number'
            ? firstPoint.timestamp / 1000
            : new Date(firstPoint.timestamp).getTime();
    }

    const relativeData = s.data.map(p => {
        const t = typeof p.timestamp === 'number'
            ? p.timestamp / 1000
            : new Date(p.timestamp).getTime();
        const diff = t - seriesStartTime;
        return {
          value: [BASE_TIMESTAMP + diff, p.value / (1024 * 1024)],
          pointId: p.pointId,
          pointName: p.name,
          conclusion: p.meta?.memory?.conclusion
        };
    });

    // 1. Base Line Series
    seriesOptions.push({
      name: s.name,
      type: 'line',
      id: s.id,
      smooth: true,
      showSymbol: false,
      symbol: 'circle',
      symbolSize: 6,
      itemStyle: { color: color },
      lineStyle: {
        width: 2,
        shadowColor: 'rgba(0,0,0,0.1)',
        shadowBlur: 5,
        shadowOffsetY: 2
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: hexToRgba(color, 0.3) },
          { offset: 1, color: hexToRgba(color, 0.0) }
        ])
      },
      emphasis: { focus: 'series' },
      sampling: 'lttb', // Optimize for large datasets
      data: relativeData
    });

    // 2. Metadata Points (Magnetic/Highlight)
    // Points with meta or a custom name are considered "important"
    const metaPoints = s.data.filter(p => p.name || (p.meta && Object.keys(p.meta).length > 0));

    if (metaPoints.length > 0) {
      seriesOptions.push({
        name: s.name + ' (Meta)',
        type: 'scatter',
        id: s.id + '-meta', // Link back to series
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
            color: color,
            borderColor: '#fff',
            borderWidth: 1
        },
        emphasis: {
            scale: true,
            itemStyle: {
                shadowBlur: 10,
                shadowColor: color
            }
        },
        z: 3,
        data: metaPoints.map(p => {
            const t = typeof p.timestamp === 'number'
                ? p.timestamp / 1000
                : new Date(p.timestamp).getTime();
            const diff = t - seriesStartTime;
            return {
              value: [BASE_TIMESTAMP + diff, p.value / (1024 * 1024)],
              pointId: p.pointId,
              pointName: p.name,
              conclusion: p.meta?.memory?.conclusion
            };
        })
      });
    }
  });

  // 3. Highlight Selected Points
  const visibleSelectedPoints = store.selectedPoints.filter(point =>
    visibleSeries.some(s => s.id === point.seriesId)
  );

  if (visibleSelectedPoints.length > 0) {
    const BASE_TIMESTAMP = new Date('1970-01-01T00:00:00Z').getTime();

    seriesOptions.push({
      type: 'effectScatter',
      name: 'Selected Points',
      symbolSize: 12,
      rippleEffect: {
        brushType: 'stroke',
        scale: 2
      },
      z: 10, // Top layer
      tooltip: { show: false },

      data: visibleSelectedPoints.map((p, index) => {
        // Find series color & start time
        const series = store.seriesList.find(s => s.id === p.seriesId);
        const color = series?.color || '#000';

        // Calculate relative time
        let timestamp = typeof p.timestamp === 'number'
            ? p.timestamp / 1000
            : new Date(p.timestamp).getTime();
        if (series && series.data && series.data[0]) {
            const startTime = typeof series.data[0].timestamp === 'number'
                ? series.data[0].timestamp / 1000
                : new Date(series.data[0].timestamp).getTime();
            timestamp = BASE_TIMESTAMP + (timestamp - startTime);
        }

        return {
           value: [timestamp, p.value / (1024 * 1024)],
           itemStyle: {
               color: color,
               shadowBlur: 5,
               shadowColor: color
           },
           // Custom Label (Annotation)
           label: {
              show: p.isAnnotationVisible,
              position: 'top',
              distance: 10,
              // Use rich text to create a colored box/text
              formatter: `{box|${index + 1}}`,
              rich: {
                  box: {
                      backgroundColor: color,
                      color: '#fff',
                      borderRadius: 4,
                      padding: [4, 6],
                      align: 'center',
                      fontWeight: 'bold',
                      fontSize: 12,
                      shadowBlur: 3,
                      shadowColor: 'rgba(0,0,0,0.3)',
                      shadowOffsetY: 1
                  }
              }
           }
        };
      })
    });
  }

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    title: { show: false }, // Clean look
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: { color: '#374151' },
      extraCssText: 'box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border-radius: 6px;',
      axisPointer: { type: 'line', lineStyle: { color: '#d1d5db', type: 'dashed' } },
      formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const firstParam = params[0];
          const timestamp = firstParam.value[0];
          const date = new Date(timestamp);
          const h = date.getUTCHours().toString().padStart(2, '0');
          const m = date.getUTCMinutes().toString().padStart(2, '0');
          const s = date.getUTCSeconds().toString().padStart(2, '0');
          const ms = date.getUTCMilliseconds().toString().padStart(3, '0');

          let durationStr = '';
          if (h === '00' && m === '00') {
              durationStr = `${s}.${ms}s`;
          } else if (h === '00') {
              durationStr = `${m}:${s}.${ms}`;
          } else {
              durationStr = `${h}:${m}:${s}.${ms}`;
          }

          let res = `<div style="margin-bottom: 5px; font-weight: 700; color: #6b7280; font-size: 11px;">REL TIME: ${durationStr}</div>`;
          params.forEach((p: any) => {
             if (p.seriesName.includes('(Meta)') || p.seriesName === 'Selected Points') return;

             const dataItem = p.data;
             const pointName = dataItem?.pointName;
             const conclusion = dataItem?.conclusion;

             res += `
               <div style="margin-top: 8px;">
                 <div style="display: flex; align-items: center; justify-content: space-between; gap: 20px;">
                   <span style="display: flex; align-items: center; gap: 6px;">
                      <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${p.color}"></span>
                      <span style="font-size: 12px; color: #374151">${p.seriesName}</span>
                      ${pointName ? `<span style="font-size: 11px; background: ${p.color}22; color: ${p.color}; padding: 1px 4px; border-radius: 3px; font-weight: 600;">${pointName}</span>` : ''}
                   </span>
                   <span style="font-weight: 700; font-size: 12px; color: #111827">${p.value[1].toFixed(2)} MB</span>
                 </div>
             `;

             if (conclusion) {
                 res += `
                   <div style="margin-top: 4px; padding-left: 14px; font-size: 11px; color: #6b7280; line-height: 1.4; border-left: 2px solid ${p.color}44;">
                     <b>${conclusion.totalPageCount}</b> pgs / <b>${(conclusion.overallSurvivalRate * 100).toFixed(1)}%</b> survival
                   </div>
                 `;
             }

             res += `</div>`;
          });
          return res;
      }
    },
    legend: {
       show: false // Hide default legend to keep it clean, relying on Sidebar
    },
    grid: {
      left: 10,
      right: 20,
      bottom: 20,
      top: visibleSeries.length > 0 ? 70 : 10, // Dynamic top margin
      containLabel: true
    },
    // Data Zoom hidden if no series
    dataZoom: visibleSeries.length > 0 ? [
      {
        type: 'inside',
        xAxisIndex: [0],
        filterMode: 'filter',
        start: currentZoomStart ?? 0,
        end: currentZoomEnd ?? 100
      },
      {
        type: 'slider',
        xAxisIndex: [0],
        top: 10,
        height: 50,
        backgroundColor: '#f9fafb',
        borderColor: 'transparent',
        fillerColor: 'rgba(99, 102, 241, 0.1)', // Light Indigo
        handleIcon: 'path://M10.7,11.9v-1.3H9.3v1.3c-4.9,0.3-8.8,4.4-8.8,9.4c0,5,3.9,9.1,8.8,9.4v1.3h1.3v-1.3c4.9-0.3,8.8-4.4,8.8-9.4C19.5,16.3,15.6,12.2,10.7,11.9z M13.3,24.4H6.7V23h6.6V24.4z M13.3,19.6H6.7v-1.4h6.6V19.6z',
        handleSize: '30%',
        handleStyle: {
          color: '#fff',
          borderColor: '#d1d5db',
          borderWidth: 1
        },
        brushSelect: true, // Enable drag to select range
        start: currentZoomStart ?? 0,
        end: currentZoomEnd ?? 100
      }
    ] : [],
    xAxis: {
      type: 'time',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: '#f3f4f6' } },
      axisLabel: {
        color: '#9ca3af',
        fontSize: 11,
        formatter: (value: number) => {
            const date = new Date(value);
            const h = date.getUTCHours().toString().padStart(2, '0');
            const m = date.getUTCMinutes().toString().padStart(2, '0');
            const s = date.getUTCSeconds().toString().padStart(2, '0');
            const ms = date.getUTCMilliseconds().toString().padStart(3, '0');

            if (h === '00' && m === '00') {
                return `${s}.${ms}s`;
            }
            if (h === '00') {
               return `${m}:${s}`;
            }
            return `${h}:${m}:${s}`;
        }
      }
    },
    yAxis: {
      type: 'value',
      name: 'MB',
      nameTextStyle: { color: '#d1d5db', align: 'right' },
      splitLine: { show: true, lineStyle: { type: 'dashed', color: '#e5e7eb' } },
      axisLabel: { color: '#9ca3af', fontSize: 11 }
    },
    series: seriesOptions,
    animationEasing: 'elasticOut',
  };

  chartInstance.value.setOption(option, { notMerge: true });
};

onMounted(() => {
  initChart();

  resizeObserver = new ResizeObserver(() => {
    chartInstance.value?.resize();
  });
  if (chartDiv.value) {
    resizeObserver.observe(chartDiv.value);
  }

  watch(
    () => store.selectedPoints,
    () => updateChart(),
    { deep: true }
  );

  watch(
    () => store.seriesList.map(s => s.visible),
    () => updateChart(),
    { deep: false }
  );

  watch(
    () => store.seriesList.length,
    () => updateChart(),
    { deep: false }
  );
});

onUnmounted(() => {
  if (resizeObserver && chartDiv.value) {
    resizeObserver.unobserve(chartDiv.value);
  }
  chartInstance.value?.dispose();
});
</script>
