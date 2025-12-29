<template>
  <div class="chart-wrapper">
    <div class="chart-container">
      <KeepAlive>
        <component :is="chartComponent" />
      </KeepAlive>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import EChartsChart from './EChartsChart.vue';

const currentEngine = ref<'plotly' | 'echarts'>('plotly');

const chartComponent = computed(() => {
  return EChartsChart;
});

</script>

<style scoped>
.chart-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chart-container {
  flex-grow: 1;
  width: 100%;
  height: 100%;
  padding-top: 10px; /* Slight offset if needed, or let switcher overlay */
}
</style>
