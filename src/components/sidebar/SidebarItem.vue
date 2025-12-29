<template>
  <div
    class="sidebar-item"
    :class="{ 'is-faded': faded }"
  >
    <div class="item-content" :title="text">
      <!-- Color Badge -->
      <div
        v-if="color"
        class="color-badge"
        :style="{ backgroundColor: color }"
      >
        <span v-if="index !== undefined" class="index-badge">{{ index }}</span>
      </div>

      <span class="item-text">{{ text }}</span>
    </div>

    <div class="item-actions">
      <!-- Menu Action -->
      <button class="action-btn" @click.stop="$emit('menu', $event)">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
      </button>
      <!-- Delete Action -->
      <button class="action-btn" @click.stop="$emit('delete')">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Props
defineProps<{
  text: string;
  faded?: boolean;
  color?: string; // Color for the badge
  index?: number; // Number for the badge (optional)
}>();

const emit = defineEmits(['delete', 'menu']);
</script>

<style scoped>
.sidebar-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  user-select: none;
}

.sidebar-item:hover {
  background-color: #f3f4f6;
}

.sidebar-item.is-faded {
  opacity: 0.6;
}

.item-content {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  flex: 1;
}

.color-badge {
    width: 20px;
    height: 20px;
    border-radius: 4px; /* Square with slight radius */
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

.index-badge {
    font-size: 11px;
    color: white;
    font-weight: bold;
    line-height: 1;
}

.item-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  color: #374151;
  font-weight: 500;
}

.item-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
  opacity: 0; /* Hide actions until hover */
  transition: opacity 0.2s;
}

.sidebar-item:hover .item-actions {
  opacity: 1;
}

.action-btn {
  background: none;
  border: none;
  padding: 6px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  transition: all 0.2s;
}

.action-btn:hover {
  background-color: #e5e7eb;
  color: #111827;
}
</style>
