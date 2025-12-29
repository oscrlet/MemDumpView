<template>
  <div id="app-layout">
    <Sidebar
      type="series"
      class="sidebar"
    />
    <main class="main-content">
      <ChartWrapper />
    </main>
    <Sidebar
      type="points"
      class="sidebar"
      @view-point="handleViewPoint"
      @compare-points="handleComparePoints"
    />
    <UnifiedMemoryViewer
      :visible="viewerVisible"
      :points="viewerPoints"
      @close="closeViewer"
    />
    <FileDropZone />
    <ExportProgress />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Sidebar from '@/components/sidebar/Sidebar.vue';
import ChartWrapper from '@/components/chart/ChartWrapper.vue';
import UnifiedMemoryViewer from '@/components/UnifiedMemoryViewer.vue';
import FileDropZone from '@/components/FileDropZone.vue';
import ExportProgress from '@/components/ui/ExportProgress.vue';
import type { SelectedPoint } from '@/types';

const viewerVisible = ref(false);
const viewerPoints = ref<SelectedPoint[]>([]);

const handleViewPoint = (point: SelectedPoint) => {
  viewerPoints.value = [point];
  viewerVisible.value = true;
};

const handleComparePoints = (points: SelectedPoint[]) => {
  viewerPoints.value = points;
  viewerVisible.value = true;
};

const closeViewer = () => {
  viewerVisible.value = false;
};
</script>

<style>
#app-layout {
  display: flex;
  height: 100%; /* Changed from 100vh to 100% as it will inherit height from parent */
  width: 100%;
  background-color: #f8f9fa; /* Light gray background to make the layout more visible */
}

.sidebar {
  width: 260px; /* Slightly wider */
  padding: 8px; /* Slightly reduce padding */
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex-shrink: 0; /* Prevent sidebar from being compressed when space is insufficient */
  border-right: 1px solid #e0e0e0;
  border-left: 1px solid #e0e0e0;
}

.main-content {
  flex-grow: 1; /* This property makes it occupy all remaining space */
  height: 100%;
  width: 100%;
  display: flex;
  min-width: 0; /* An important flexbox trick to prevent content overflow */
}
</style>
