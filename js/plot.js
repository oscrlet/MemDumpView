// plot.js - plotting and highlight utilities (depends on Plotly global and uses state)

import { formatBytes } from "./utils.js";

export function renderHeapPlot(state) {
  // Check if Plotly is available
  if (typeof Plotly === 'undefined') {
    console.warn('Plotly is not loaded, skipping plot render');
    return;
  }
  
  const xLine = state.dsActive
    ? state.dsCurrentX
    : Array.from({ length: state.heapValuesOriginal.length }, (_, i) => i + 1);
  const yLine = state.dsActive ? state.dsCurrentY : state.heapValuesOriginal;

  const actualTrace = {
    x: xLine,
    y: yLine,
    type: "scatter",
    mode: "lines",
    name: state.dsActive
      ? `Heap Bytes (downsampled ${state.dsCurrentX.length})`
      : "Heap Bytes",
    line: { color: "#1976d2", width: 2 },
  };

  const markerTrace = {
    x: state.heapGcMarkers,
    y: state.heapGcMarkerValues,
    type: "scatter",
    mode: "markers",
    name: "GC events",
    marker: {
      symbol: "star-diamond",
      size: 9,
      color: "red",
      line: { color: "#000", width: 1 },
    },
    text: state.heapGcMarkers.map(
      (idx, i) =>
        `GC event #${i + 1} @ sample ${idx}<br>Heap: ${state.heapGcMarkerRawValues[i]}`,
    ),
    hoverinfo: "text",
  };

  const traces = [actualTrace, markerTrace];

  if (state.haveSimulation && state.simulatedCompactedX.length) {
    traces.push({
      x: state.simulatedCompactedX,
      y: state.simulatedCompactedY,
      type: "scatter",
      mode: "lines+markers",
      name: "Simulated Compacted Heap",
      line: { color: "#ff9800", width: 2, dash: "dot" },
      marker: {
        symbol: "circle",
        size: 7,
        color: "#ff9800",
        line: { color: "#333", width: 1 },
      },
      text: state.simulatedCompactedY.map(
        (v, i) =>
          `Simulated after GC#${i + 1} @ sample ${state.simulatedCompactedX[i]}<br>${formatBytes(v)}`,
      ),
      hoverinfo: "text",
    });
  }

  Plotly.newPlot("heap-chart", traces, {
    title: "Heap Usage Over Time",
    xaxis: { title: "Sample Index" },
    yaxis: { title: "Heap Bytes" },
    legend: { orientation: "h", x: 0, y: 1.05 },
  });
  state.plotRendered = true;
}

export function updateSimulatedLine(state) {
  renderHeapPlot(state);
}

export function highlightHeapMarker(state, gcIdx) {
  if (!state.plotRendered) return;
  const sorted = state.gcPairs.map((p) => p.idx).sort((a, b) => a - b);
  const pos = sorted.indexOf(gcIdx);
  if (pos < 0 || pos >= state.heapGcMarkers.length) return;
  highlightHeapMarkerByPosition(state, pos);
}

export function highlightHeapMarkerByPosition(state, pos) {
  if (!state.plotRendered) return;
  const sizes = state.heapGcMarkers.map((_, i) => (i === pos ? 16 : 9));
  Plotly.restyle("heap-chart", { "marker.size": [sizes] }, 1);
  const ann = {
    x: state.heapGcMarkers[pos],
    y: state.heapGcMarkerValues[pos],
    text: `GC#${pos + 1}`,
    showarrow: true,
    arrowhead: 7,
    ax: 0,
    ay: -40,
    bgcolor: "#1976d2",
    font: { color: "#fff", size: 10 },
  };
  Plotly.relayout("heap-chart", { annotations: [ann] });
}

export function focusOnHeapMarker(state, sampleIndex) {
  if (!state.plotRendered) return;
  const total = state.heapValuesOriginal.length;
  const windowSize = Math.max(50, Math.round(total * 0.05));
  let start = sampleIndex - Math.floor(windowSize / 2);
  let end = sampleIndex + Math.floor(windowSize / 2);
  if (start < 1) {
    end += 1 - start;
    start = 1;
  }
  if (end > total) {
    let diff = end - total;
    start = Math.max(1, start - diff);
    end = total;
  }
  Plotly.relayout("heap-chart", { "xaxis.range": [start, end] });
}

export function highlightAndFocusHeapMarker(state, gcIdx) {
  highlightHeapMarker(state, gcIdx);
  const sorted = state.gcPairs.map((p) => p.idx).sort((a, b) => a - b);
  const pos = sorted.indexOf(gcIdx);
  if (pos < 0 || pos >= state.heapGcMarkers.length) return;
  focusOnHeapMarker(state, state.heapGcMarkers[pos]);
}

export function highlightAndFocusHeapMarkerByPosition(state, pos) {
  highlightHeapMarkerByPosition(state, pos);
  if (pos < 0 || pos >= state.heapGcMarkers.length) return;
  focusOnHeapMarker(state, state.heapGcMarkers[pos]);
}

export function jumpToHeapTimeline() {
  const chart = document.getElementById("heap-chart");
  if (chart) chart.scrollIntoView({ behavior: "smooth", block: "center" });
}
