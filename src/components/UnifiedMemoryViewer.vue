<template>
  <Teleport to="body">
    <div v-if="visible" class="overlay-container" @click.self="emit('close')">
      <button class="close-button" @click="emit('close')">&times;</button>

      <div class="content-wrapper" :class="{ 'single-view': isSingleView, 'comparison-view': !isSingleView }">

        <!-- Metadata View (Single) -->
        <div v-if="isSingleView" class="single-layout">
          <EChartsMemLayout
            v-if="singlePoint"
            :data="singlePoint.meta?.memory || null"
          />
        </div>

        <!-- Comparison View (Grid) -->
        <div v-else class="comparison-grid">
          <div v-for="point in points" :key="point.pointId" class="grid-item">
            <div class="item-header">
              {{ getPointDisplayText(point) }}
            </div>
            <div class="item-content">
              <EChartsMemLayout
                :data="point.meta?.memory || null"
                :target-total-pages="maxTotalPages"
                :clickable="store.selectedPoints.length > 1"
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch, onUnmounted } from 'vue';
import { useMainStore } from '@/store/main';
import EChartsMemLayout from '@/components/memLayout/EChartsMemLayout.vue';
import type { SelectedPoint } from '@/types';

const props = defineProps<{
  visible: boolean;
  points: SelectedPoint[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const store = useMainStore();

const isSingleView = computed(() => props.points.length === 1);
const singlePoint = computed(() => props.points[0]);

const maxTotalPages = computed(() => {
  if (isSingleView.value) return 0;
  let max = 0;
  props.points.forEach(point => {
      const memory = point.meta?.memory;
      if (memory) {
          // Use pre-calculated count if available
          const count = memory.conclusion?.totalPageCount ??
                       memory.pageTypes.reduce((sum, type) => sum + type.pages.length, 0);
          if (count > max) max = count;
      }
  });
  return max;
});

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close');
};

watch(() => props.visible, (visible) => {
  if (visible) {
    window.addEventListener('keydown', handleKeydown);
  } else {
    window.removeEventListener('keydown', handleKeydown);
  }
});

onUnmounted(() => window.removeEventListener('keydown', handleKeydown));

const getPointDisplayText = (point: SelectedPoint): string => {
  const originalPoint = store.seriesList
    .find(s => s.id === point.seriesId)?.data
    .find(p => p.pointId === point.pointId);
  return originalPoint?.name || `${point.seriesName || 'Series'}: ${point.value.toFixed(2)}`;
};
</script>

<style scoped>
.overlay-container {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.6);
  z-index: 1800;
  display: flex;
  justify-content: center;
  align-items: flex-start; /* Align to top to support scrolling */
  padding: 40px;
  overflow-y: auto; /* Enable scrolling for the whole overlay if needed */
}

.close-button {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  border-radius: 50%;
  font-size: 28px;
  line-height: 40px;
  text-align: center;
  cursor: pointer;
  z-index: 1801;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

.close-button:hover {
  background: white;
  transform: scale(1.1);
}

.content-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
}

/* Single View Styles */
.content-wrapper.single-view {
  max-width: 1200px;
  max-height: 900px;
}

.single-layout {
  width: 100%;
  height: 100%;
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}

/* Comparison View Styles */
.content-wrapper.comparison-view {
  width: 100%;
  height: 100%;
}

.comparison-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(550px, 1fr));
  gap: 32px;
  width: 100%;
  padding: 10px;
}

.grid-item {
  background-color: #fff;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  height: 800px; /* Increased height to maximize heatmap space */
  border: 1px solid #e5e7eb;
  transition: transform 0.2s ease;
}

.item-header {
  padding: 12px 20px;
  font-weight: 700;
  font-size: 14px;
  border-bottom: 1px solid #f3f4f6;
  background-color: #f9fafb;
  color: #374151;
  flex-shrink: 0;
}

.item-content {
  flex-grow: 1;
  min-height: 0;
  padding: 10px;
}
</style>
