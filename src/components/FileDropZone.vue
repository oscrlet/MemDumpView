<template>
  <div
    class="file-drop-zone"
    :class="{ 'is-active': isActive }"
    @dragover.prevent="handleDragOver"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <div v-if="isActive" class="drop-overlay">
      <div class="drop-content">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drop-icon">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <p>Memory series data will be added to your current view</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useMainStore } from '@/store/main';
import { processFile } from '@/services/fileHandler';

const store = useMainStore();
const isActive = ref(false);
let dragCounter = 0; // To handle nested dragenter/dragleave correctly

const handleDragOver = (e: DragEvent) => {
  // Check if dragged item is a file
  if (e.dataTransfer?.types.includes('Files')) {
    isActive.value = true;
  }
};

const handleDragEnterGlobal = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) {
        dragCounter++;
        isActive.value = true;
    }
};

const handleDragLeaveGlobal = () => {
    dragCounter--;
    if (dragCounter <= 0) {
        isActive.value = false;
        dragCounter = 0;
    }
};

const handleDragLeave = () => {
    // Local leave is handled by global counter but we can reset if needed
};

const handleDrop = async (e: DragEvent) => {
  isActive.value = false;
  dragCounter = 0;

  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file) continue;

        if (file.type === 'application/json' || file.name.endsWith('.json') || file.name.endsWith('.mb')) {
            try {
                const seriesArray = await processFile(file);
                seriesArray.forEach(s => store.addSeries(s));
            } catch (error) {
                console.error("Failed to process dropped file:", error);
                alert(`Failed to import "${file.name}": ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
            alert(`File "${file.name}" is not a valid JSON or binary file.`);
        }
    }
  }
};

onMounted(() => {
    window.addEventListener('dragenter', handleDragEnterGlobal);
    window.addEventListener('dragleave', handleDragLeaveGlobal);
    // Prevent default window behavior for files
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
});

onUnmounted(() => {
    window.removeEventListener('dragenter', handleDragEnterGlobal);
    window.removeEventListener('dragleave', handleDragLeaveGlobal);
});
</script>

<style scoped>
.file-drop-zone {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  transition: all 0.3s ease;
}

.file-drop-zone.is-active {
  pointer-events: auto;
  background-color: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
}

.drop-overlay {
  position: absolute;
  inset: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 4px dashed #3b82f6;
  box-sizing: border-box;
  border-radius: 20px;
  background: rgba(59, 130, 246, 0.05);
}

.drop-content {
  text-align: center;
  color: #1e40af;
}

.drop-icon {
  margin-bottom: 20px;
  color: #3b82f6;
  animation: bounce 1s infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

h3 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 8px;
}

p {
  font-size: 1rem;
  opacity: 0.8;
}
</style>
