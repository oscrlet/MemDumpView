import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import { v4 as uuidv4 } from 'uuid'; // `npm install uuid && npm install -D @types/uuid`
import type { MemorySeries, SelectedPoint, DataPoint } from '@/types';
import { stringToHue, hslToHex } from '@/utils/color';

interface MainState {
  seriesList: MemorySeries[];
  selectedPoints: SelectedPoint[];
  operationStatus: {
    active: boolean;
    type: 'import' | 'export';
    progress: number;
    filename: string;
  };
}

export const useMainStore = defineStore('main', {
  state: (): MainState => ({
    seriesList: [],
    selectedPoints: [],
    operationStatus: {
      active: false,
      type: 'export',
      progress: 0,
      filename: '',
    },
  }),

  actions: {
    // --- Helper ---
    getTimestampMs(timestamp: string | number): number {
      if (typeof timestamp === 'number') {
        // Assume microseconds if it's a number (likely relative to epoch)
        return timestamp / 1000;
      }
      return new Date(timestamp).getTime();
    },

    // --- Series Management ---
    addSeries(seriesData: Omit<MemorySeries, 'id' | 'visible' | 'data'> & { data: Omit<DataPoint, 'pointId'>[] }) {
      const newId = uuidv4();

      // Sort data by timestamp just in case it's unsorted
      const sortedData = [...seriesData.data].sort((a, b) =>
        this.getTimestampMs(a.timestamp) - this.getTimestampMs(b.timestamp)
      );

      const processedData = sortedData.map(p => ({
        ...p,
        pointId: uuidv4(),
        seriesId: newId,
        meta: p.meta ? {
          ...p.meta,
          memory: p.meta.memory ? markRaw(p.meta.memory) : undefined
        } : undefined
      }));

      const hue = stringToHue(seriesData.name);
      const color = hslToHex(hue, 65, 55);

      const newSeries: MemorySeries = {
        ...seriesData,
        id: newId,
        visible: true,
        data: markRaw(processedData),
        color,
      };
      this.seriesList.push(newSeries);
    },

    removeSeries(seriesId: string) {
      this.seriesList = this.seriesList.filter(s => s.id !== seriesId);
      // Also remove all selected points from this series
      this.selectedPoints = this.selectedPoints.filter(p => p.seriesId !== seriesId);
    },

    renameSeries(seriesId: string, newName: string) {
      const series = this.seriesList.find(s => s.id === seriesId);
      if (series) {
        series.name = newName;
        // Update series names for selected points
        this.selectedPoints.forEach(p => {
          if (p.seriesId === seriesId) {
            p.seriesName = newName;
          }
        });
      }
    },

    toggleSeriesVisibility(seriesId: string) {
      const series = this.seriesList.find(s => s.id === seriesId);
      if (series) {
        series.visible = !series.visible;
      }
    },

    // --- Selected Points Management ---
    addSelectedPoint(point: SelectedPoint) {
      // Prevent duplicate additions
      if (!this.selectedPoints.some(p => p.pointId === point.pointId)) {
        this.selectedPoints.push({ ...point, isAnnotationVisible: true });
      }
    },

    toggleAnnotationVisibility(pointId: string) {
      const point = this.selectedPoints.find(p => p.pointId === pointId);
      if (point) {
        // If property doesn't exist, default to true, then toggle to false
        point.isAnnotationVisible = !point.isAnnotationVisible;
      }
    },

    renamePoint(payload: { pointId: string; seriesId: string; newName: string }) {
      const { pointId, seriesId, newName } = payload;
      const seriesIndex = this.seriesList.findIndex(s => s.id === seriesId);
      if (seriesIndex !== -1) {
        const series = this.seriesList[seriesIndex];
        if (series) {
          const point = series.data.find(p => p.pointId === pointId);
          if (point) {
            point.name = newName;
            this.seriesList = [...this.seriesList];
          }
        }
      }
    },

    removeSelectedPoint(pointId: string) {
      this.selectedPoints = this.selectedPoints.filter(p => p.pointId !== pointId);
    },

    // --- New Actions ---
    clearSelectedPoints() {
      this.selectedPoints = [];
    },

    /**
     * Creates a simulated series with compacted memory usage.
     */
    compactSeries(seriesId: string) {
      const sourceSeries = this.seriesList.find(s => s.id === seriesId);
      if (!sourceSeries) return;

      const sourceData = sourceSeries.data;
      if (sourceData.length === 0) return;

      const compactedData: DataPoint[] = [];

      sourceData.forEach((p, index) => {
        const isFirst = index === 0;
        const isLast = index === sourceData.length - 1;
        const memory = p.meta?.memory;

        let usedSize = 0;
        if (memory?.conclusion) {
          usedSize = memory.conclusion.totalUsedSize;
        } else if (memory?.pageTypes) {
          // Manual fallback calculation
          memory.pageTypes.forEach(pt => {
            pt.pages.forEach(page => {
              if (page.occupancy != null) {
                usedSize += page.size * page.occupancy;
              }
            });
          });
        }

        if (usedSize > 0 || isFirst || isLast) {
          const newPoint: DataPoint = {
            ...p,
            pointId: uuidv4(),
            seriesId: undefined, // Will be set in addSeries
            value: usedSize > 0 ? usedSize : p.value,
            name: p.name ? `${p.name} (Simulated Compacted)` : undefined,
          };

          // Deep clone and update metadata to reflect perfect compaction
          if (p.meta) {
            newPoint.meta = { ...p.meta };
            if (p.meta.memory) {
              const newMemory = { ...p.meta.memory };

              // 1. Reconstruct PageTypes to show compacted layout and calculate true stats
              let newTotalAllocatedSize = 0;
              let newTotalUsedSize = 0;

              if (newMemory.pageTypes) {
                newMemory.pageTypes = newMemory.pageTypes.map(pt => {
                  let ptUsedBytes = 0;
                  let pageSize = pt.uniformPageSize || 0;

                  // Calculate total used bytes for this type
                  pt.pages.forEach(page => {
                    if (pageSize === 0) pageSize = page.size;
                    ptUsedBytes += page.size * (page.occupancy ?? 0);
                  });

                  if (ptUsedBytes === 0) return { ...pt, pages: [] };

                  // Redistribute into full pages
                  const fullPagesCount = Math.floor(ptUsedBytes / pageSize);
                  const remainder = ptUsedBytes % pageSize;
                  const newPages = [];

                  for (let j = 0; j < fullPagesCount; j++) {
                    newPages.push({ size: pageSize, occupancy: 1.0 });
                  }
                  if (remainder > 0) {
                    newPages.push({ size: pageSize, occupancy: remainder / pageSize });
                  }

                  const ptAllocatedBytes = newPages.length * pageSize;
                  newTotalAllocatedSize += ptAllocatedBytes;
                  newTotalUsedSize += ptUsedBytes;

                  return {
                    ...pt,
                    pages: newPages,
                    uniformPageSize: pageSize,
                    // Store calculated stats for the conclusion update below
                    _tempStats: {
                      count: newPages.length,
                      survivalRate: ptAllocatedBytes > 0 ? ptUsedBytes / ptAllocatedBytes : 1.0
                    }
                  };
                });
              }

              // 2. Adjust conclusion to reflect realistic alignment overhead
              if (newMemory.conclusion) {
                const newTotalPageCount = newMemory.pageTypes.reduce((sum, pt) => sum + pt.pages.length, 0);

                newMemory.conclusion = {
                  ...newMemory.conclusion,
                  totalPageCount: newTotalPageCount,
                  totalSize: newTotalAllocatedSize,
                  totalUsedSize: newTotalUsedSize,
                  overallSurvivalRate: newTotalAllocatedSize > 0 ? newTotalUsedSize / newTotalAllocatedSize : 1.0,
                  emptyPageCount: 0,
                  totalEmptySize: 0,
                  typeStats: newMemory.conclusion.typeStats.map(ts => {
                    const pt = (newMemory.pageTypes as any[]).find(p => p.name === ts.name);
                    return {
                      ...ts,
                      count: pt?._tempStats?.count ?? 0,
                      survivalRate: pt?._tempStats?.survivalRate ?? 1.0
                    };
                  })
                };

                // Cleanup temp properties
                newMemory.pageTypes.forEach((pt: any) => delete pt._tempStats);
              }
              newPoint.meta.memory = newMemory;
            }
          }

          compactedData.push(newPoint);
        }
      });

      if (compactedData.length > 0) {
        this.addSeries({
          name: `${sourceSeries.name} compacted`,
          color: sourceSeries.color,
          data: compactedData
        });
      }
    },

    setOperationStatus(payload: Partial<MainState['operationStatus']>) {
      this.operationStatus = { ...this.operationStatus, ...payload };
    },
  },
});
