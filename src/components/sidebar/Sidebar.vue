<template>
  <div class="sidebar-container">
    <!-- Header -->
    <div class="sidebar-header">
      <h2>{{ title }}</h2>
      <div class="header-actions">
        <!-- Series Mode Actions -->
        <template v-if="type === 'series'">
          <button
            @click="handleExportAll"
            class="icon-button"
            title="Export"
            :disabled="store.seriesList.length === 0"
          >
            <ActionIcons icon="export" />
          </button>
          <button
            @click="handleImportSeries"
            class="icon-button"
            title="Import JSON"
          >
            <ActionIcons icon="plus" />
          </button>
        </template>

        <!-- Points Mode Actions -->
        <template v-else>
          <button
            @click="handleComparePoints"
            class="icon-button"
            title="Compare selected points"
            :disabled="store.selectedPoints.length === 0"
          >
            <ActionIcons icon="compare" />
          </button>
          <button
            @click="handleClearPoints"
            class="icon-button"
            title="Clear all selected points"
            :disabled="store.selectedPoints.length === 0"
          >
            <ActionIcons icon="clear" />
          </button>
        </template>
      </div>
    </div>

    <!-- List -->
    <ul class="item-list">
      <li v-for="item in items" :key="item.id">
        <SidebarItem
          :text="item.text"
          :faded="item.faded"
          :color="item.color"
          :index="item.index"
          @delete="handleItemDelete(item)"
          @menu="showMenu($event, item)"
          @click="handleItemClick(item)"
        />
      </li>
    </ul>

    <!-- Empty State for Points -->
    <div v-if="type === 'points' && items.length === 0" class="empty-state">
      Click on a point in the chart to select it.
    </div>

    <!-- Context Menu -->
    <div
      ref="menuRef"
      v-if="menu.visible"
      class="context-menu"
      :style="{ top: menu.y + 'px', left: menu.x + 'px' }"
      @click.stop
    >
      <div class="menu-item" @click="handleRename">Rename</div>
      <div v-if="type === 'series'" class="menu-item" @click="handleCompact">Compact</div>
      <div v-if="type === 'series'" class="menu-item" @click="handleExportSingle">Export</div>
      <div v-if="type === 'points'" class="menu-item" @click="handleShowMetadata">Metadata</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useMainStore } from '@/store/main';
import { importSeriesFromFile, exportSeries } from '@/services/fileHandler';
import ActionIcons from '@/components/ActionIcons.vue';
import SidebarItem from './SidebarItem.vue';
import type { SelectedPoint, MemorySeries } from '@/types';

// Props definition
const props = defineProps<{
  type: 'series' | 'points';
}>();

// Emits for points mode
const emit = defineEmits<{
  (e: 'view-point', point: SelectedPoint): void;
  (e: 'compare-points', points: SelectedPoint[]): void;
}>();

const store = useMainStore();
const menuRef = ref<HTMLElement | null>(null);

// --- Computed Data ---
const title = computed(() => props.type === 'series' ? 'Memory Series' : 'Selected Points');

// Unified Item Interface for rendering
interface DisplayItem {
  id: string;
  text: string;
  faded: boolean;
  original: MemorySeries | SelectedPoint;
  type: 'series' | 'point';
  color?: string;
  index?: number;
}

const items = computed<DisplayItem[]>(() => {
  if (props.type === 'series') {
    return store.seriesList.map(s => ({
      id: s.id,
      text: s.name,
      faded: !s.visible,
      original: s,
      type: 'series',
      color: s.color
    }));
  } else {
    return store.selectedPoints.map((p, index) => {
      const series = store.seriesList.find(s => s.id === p.seriesId);
      return {
        id: p.pointId ?? '',
        text: getPointDisplayText(p),
        faded: !p.isAnnotationVisible,
        original: p,
        type: 'point',
        color: series?.color,
        index: index + 1
      };
    });
  }
});

const getPointDisplayText = (point: SelectedPoint): string => {
  const originalPoint = store.seriesList
    .find(s => s.id === point.seriesId)?.data
    .find(p => p.pointId === point.pointId);
  return originalPoint?.name || `${point.seriesName || 'Series'}: ${point.value.toFixed(2)}`;
};

// --- Actions Handler ---
// 1. Header Actions
const handleImportSeries = async () => {
  try {
    const seriesArray = await importSeriesFromFile();
    seriesArray.forEach(s => store.addSeries(s));
  } catch (error) {
    if (error instanceof Error && error.message !== 'No file selected.') {
        console.error("Failed to import:", error);
        alert(`Import failed: ${error.message}`);
    }
  }
};

const handleExportAll = () => {
  if (store.seriesList.length > 0) {
    exportSeries(store.seriesList, 'memory-series-export');
  }
};

const handleComparePoints = () => {
  emit('compare-points', [...store.selectedPoints]);
};

const handleClearPoints = () => {
  store.clearSelectedPoints();
};

// 2. Item Actions
const handleItemClick = (item: DisplayItem) => {
  if (item.type === 'series') {
    store.toggleSeriesVisibility(item.id);
  } else {
    store.toggleAnnotationVisibility(item.id);
  }
};

const handleItemDelete = (item: DisplayItem) => {
  if (item.type === 'series') {
    store.removeSeries(item.id);
  } else {
    store.removeSelectedPoint(item.id);
  }
};

// --- Context Menu Logic ---
const menu = reactive({
  visible: false,
  x: 0,
  y: 0,
  currentItem: null as DisplayItem | null,
});

const showMenu = (event: MouseEvent, item: DisplayItem) => {
  event.stopPropagation();
  const targetButton = event.currentTarget as HTMLElement;
  const rect = targetButton.getBoundingClientRect();
  menu.currentItem = item;
  menu.visible = true;

  nextTick(() => {
    const menuElement = menuRef.value;
    if (!menuElement) return;
    const { offsetWidth: menuWidth, offsetHeight: menuHeight } = menuElement;
    let newX = rect.left;
    let newY = rect.bottom + 4;

    // Boundary checks
    if (newX + menuWidth > window.innerWidth) newX = window.innerWidth - menuWidth - 8;
    if (newY + menuHeight > window.innerHeight) newY = rect.top - menuHeight - 4;
    menu.x = Math.max(8, newX);
    menu.y = Math.max(8, newY);
  });
};

const closeMenu = () => {
  menu.visible = false;
  menu.currentItem = null;
};

// Menu Actions
const handleRename = () => {
  if (!menu.currentItem) return;
  const item = menu.currentItem;
  closeMenu();

  const currentName = item.text;
  const newName = prompt(`Enter new name:`, currentName);

  if (newName && newName.trim() !== '') {
    if (item.type === 'series') {
      store.renameSeries(item.id, newName.trim());
    } else {
      const point = item.original as SelectedPoint;
      if (point.pointId) {
        store.renamePoint({
          pointId: point.pointId,
          seriesId: point.seriesId,
          newName: newName.trim()
        });
      }
    }
  }
};

const handleCompact = () => {
  if (!menu.currentItem || menu.currentItem.type !== 'series') return;
  store.compactSeries(menu.currentItem.id);
  closeMenu();
};

const handleExportSingle = () => {
  if (!menu.currentItem || menu.currentItem.type !== 'series') return;
  const series = menu.currentItem.original as MemorySeries;
  exportSeries([series], series.name);
  closeMenu();
};

const handleShowMetadata = () => {
  if (!menu.currentItem || menu.currentItem.type !== 'point') return;
  emit('view-point', menu.currentItem.original as SelectedPoint);
  closeMenu();
};

onMounted(() => {
  window.addEventListener('click', closeMenu);
});
onUnmounted(() => {
  window.removeEventListener('click', closeMenu);
});
</script>

<style scoped>
.sidebar-container {
  background: #ffffff;
  padding: 1rem;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding: 0 8px;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
}

.header-action-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.export-submenu {
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 160px;
  z-index: 1001;
}

.icon-button {
  background: none;
  border: none;
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  transition: background-color 0.2s, color 0.2s;
}

.icon-button:hover:not(:disabled) {
  background-color: #e9ecef;
  color: #000;
}

.icon-button:disabled {
  color: #ccc;
  cursor: not-allowed;
}

.icon-button svg {
  width: 16px;
  height: 16px;
}

.item-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.empty-state {
  color: #888;
  font-size: 14px;
  text-align: center;
  padding: 20px;
}

.context-menu {
  position: fixed;
  z-index: 1000;
  background-color: white;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 150px;
}

.menu-item {
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  color: #333;
}

.menu-item:hover {
  background-color: #f0f0f0;
}
</style>
