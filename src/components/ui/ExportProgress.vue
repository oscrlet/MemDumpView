<script setup lang="ts">
import { useMainStore } from '@/store/main';
import { computed } from 'vue';

const store = useMainStore();
const status = computed(() => store.operationStatus);

const operationLabel = computed(() => 
  status.value.type === 'import' ? 'Importing...' : 'Exporting...'
);

const progressStyle = computed(() => ({
  width: `${status.value.progress}%`
}));
</script>

<template>
  <Transition name="slide-up">
    <div v-if="status.active" class="export-progress-container">
      <div class="export-card">
        <div class="export-header">
          <div class="export-info">
            <span class="export-label">{{ operationLabel }}</span>
            <span class="export-filename">{{ status.filename }}</span>
          </div>
          <span class="export-percentage">{{ status.progress }}%</span>
        </div>
        
        <div class="progress-track">
          <div class="progress-bar" :style="progressStyle"></div>
        </div>
        
        <div class="export-footer">
          <span class="export-hint">Preparing files, please stay on this page.</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.export-progress-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 10000;
  pointer-events: none;
}

.export-card {
  pointer-events: auto;
  width: 320px;
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  border: 1px solid #eee;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.export-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.export-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.export-label {
  font-size: 12px;
  font-weight: 600;
  color: #1a73e8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.export-filename {
  font-size: 14px;
  color: #333;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.export-percentage {
  font-size: 18px;
  font-weight: 700;
  color: #1a1a1b;
  font-variant-numeric: tabular-nums;
}

.progress-track {
  height: 6px;
  background: #f1f3f4;
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #1a73e8, #4285f4);
  transition: width 0.3s ease-out;
}

.export-footer {
  font-size: 11px;
  color: #70757a;
}

/* Transitions */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(20px);
  opacity: 0;
}
</style>
