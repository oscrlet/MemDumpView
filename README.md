# Heap Dump Viewer — Usage & Development Guide

## Quick links

- Where the app entry lives: src/js/main.js
- Utility modules: src/js/utils.js, src/js/parser.js, src/js/downsample.js, src/js/plot.js

---

## User manual — how to run and use the app

1. Serve the files

- The app is a static, client-side page that uses ES modules. Serve the repository root (or the folder containing the HTML that imports src/js/main.js) using any static server.
- Examples:
  - If the repository includes a modern dev setup (Vite), run:
    - npm install
    - npm run dev
    - Open the development URL printed by Vite (usually http://localhost:5173)

2. Load a heap dump file

- Check [heap dump file format](./docs/heap-dump-file-format.md) for input file rules
- Click the "Load heap dump file" button in the page UI and select your heap dump file (.txt/.log/.csv).
- The loader expects two phases in the file:
  - phase1: heap use — lines are "sample,heapBytes,marker" e.g. "1,12345678,true"
  - phase2: page dump — contains before/after GC blocks marked like "-------before GC 1 -------" and "-------after GC 1 -------"
- After loading, the timeline (Plotly) and GC pair panels will populate automatically.

3. Interact with the UI

- Heap timeline:
  - Hover markers to see details.
  - Use the GC Correlation panel to jump to and highlight GC events.
- Downsampling:
  - Choose an algorithm (bucket or lttb), set a target, and click Apply.
  - Toggle between downsampled and original data.
- GC pair view:
  - Inspect summary panels, open charts popups, highlight corresponding heap points, zoom/rescale grid cells, and click grid cells to open page info popups.

---

## Module map — what each file does

- src/js/main.js
  - App entry and orchestrator. Manages shared application state, wires DOM events, composes UI pieces, and calls the other modules.
  - Exported (or global) state object contains arrays such as gcPairs, heapValuesOriginal, heapGcMarkers, dsCurrentX/Y, simulatedCompactedX/Y, and flags.

- src/js/utils.js
  - Small, general-purpose helpers used across modules:
    - escapeHtml(text)
    - makeMovable(popup, header)
    - formatBytes(bytes)
  - These functions are DOM-agnostic (except makeMovable which manipulates DOM), pure and safe to unit-test.

- src/js/parser.js
  - Parsing logic for the GC dump portion and page-usage strings.
  - Exports:
    - parseGCDumpBlocks(text)
    - pairBlocks(blocks)
    - parsePageDistribution(lines)
    - parsePageUsages(data, kind, name)
    - kindOrder(k)
    - countTotalPages(dist)
    - computeSummary(before, after)
    - simulateCompaction(dist)
  - No DOM access — keep parsing logic here so it can be unit-tested or reused in node-based tooling.

- src/js/downsample.js
  - Downsampling implementations that operate on numeric arrays only:
    - downsampleBucket(x, y, target, forceSet)
    - downsampleLTTB(x, y, target, forceSet)
  - They accept full x/y arrays and a set of sample indices to preserve (forceSet). They return reduced x/y arrays.
  - Pure functions — easy to test in isolation.

- src/js/plot.js
  - Builds Plotly traces and provides highlight/zoom utilities:
    - renderHeapPlot(state)
    - updateSimulatedLine(state)
    - highlightHeapMarker(state, gcIdx)
    - highlightHeapMarkerByPosition(state, pos)
    - focusOnHeapMarker(state, sampleIndex)
    - highlightAndFocusHeapMarker(state, gcIdx)
    - jumpToHeapTimeline()
  - Accepts the shared state object (from main.js) to get arrays and flags. Avoid DOM mutation other than Plotly API calls.

---

## State design (single source of truth)

- main.js keeps a central state object that other modules receive as an argument when needed.
- Key fields:
  - gcPairs: array of matched before/after GC pairs
  - heapValuesOriginal: full array of heap bytes
  - heapGcMarkers: sample indices of GC markers
  - heapGcMarkerRawValues: raw heap bytes at marker positions
  - heapGcMarkerValues: small-offset values used for marker plotting
  - dsCurrentX / dsCurrentY: downsampled series
  - dsActive: whether the plot currently shows downsampled data
  - simulatedCompactedX / simulatedCompactedY: series for simulated compacted points
  - haveSimulation: boolean flag to show/hide simulated series
- When writing code that modifies state, update only the state object owned by main.js. Pass state into helpers and pure functions rather than letting them mutate globals.

---

## Development guide — how to change and extend modules

### Design rules

- Separation of concerns:
  - Parsing: parser.js only parses text → data structures.
  - Computation: downsample.js, computeSummary, simulateCompaction return data; do not touch DOM.
  - Presentation: plot.js and main.js manage DOM and Plotly interactions.
  - Utilities: utils.js for small helpers.
- Pure functions where possible. Makes unit testing straightforward.
- Module imports: use relative imports (ES modules). Example:
  import _ as P from './parser.js';
  import _ as DS from './downsample.js';
  import _ as U from './utils.js';
  import _ as Plot from './plot.js';

### Common tasks & where to change

- Change parsing rules
  - Edit src/js/parser.js (add new regexes or support for additional block formats).
  - Add unit tests that feed example dump strings into parser functions and assert structured output.

- Change plot appearance or interactivity
  - Edit src/js/plot.js. Keep Plotly-specific code here and avoid touching parsing logic.

- Change downsampling behavior
  - Edit src/js/downsample.js. These functions must accept x/y arrays and a Set of forced indices; return reduced arrays.

- Add new UI controls
  - Add button/controls in the HTML and wire them in src/js/main.js (event handlers). Call into parser/downsample/plot as needed.

- Split main.js further
  - If main.js grows, split UI composition into smaller modules (ui.js, gcView.js) and import them from main.js. Keep state ownership in main.js or pass a controlled API for state changes.

### Example small change workflow

1. Identify the module (e.g., parser.js) and open it.
2. Add the function or modify the logic (preserve public function signatures where possible).
3. Run the app locally and load a test dump to verify no regressions.
4. Add unit tests for pure logic where applicable (parsing / downsampling).
5. Create a small PR describing the change and the manual verification steps.

---

## Testing and debugging

- Browser DevTools:
  - Use console.log liberally in main.js and the module you're working on.
  - Use debugger breakpoints to inspect state at runtime.

- Unit tests for pure modules:
  - parser.js and downsample.js are pure and ideal for unit testing.
  - Use a test runner (Vitest / Jest / Mocha) if the repository includes one. Example quick setup with Vitest:
    - npm install --save-dev vitest
    - Create tests under /test/ that import the modules and assert outputs.

- Manual verification checklist (after changes)
  - Load a sample heap dump file and confirm no parsing errors.
  - Heap timeline renders and markers match parsed marker positions.
  - GC Correlation panel lists GC indices and highlights correctly.
  - Clicking grid cells opens Page Info popups with correct values.
  - Downsampling preserves GC marker positions.

---

## Coding conventions & best practices

- Prefer named exports for utilities and helpers (makes testing easier).
- Avoid direct DOM manipulation inside parser.js and downsample.js.
- Keep side-effects inside main.js or presentation modules (plot.js).
- Document exported functions using short JSDoc comments (helps future contributors).
- Keep functions small and focused: parse → compute → render.

---

## Adding new modules

- Create a new file under src/js/, export the functions you need, and import them from main.js or other modules.
- Ensure the module does not leak globals. Use the central state object when reading application data.
- Add unit tests for pure functions and manual QA steps for UI-affecting code.

---

## Performance tips

- For very large heap timelines, prefer downsampling before plotting.
- Keep data structures as typed arrays only if needed for performance-critical operations; otherwise plain arrays are fine.
- Avoid re-rendering the entire GC pair view if only a small part changed — consider incremental updates when you refactor.

---

## Helpers & utilities to create (recommended)

- tests/parser.test.js — tests for parseGCDumpBlocks, parsePageDistribution, parsePageUsages.
- tests/downsample.test.js — tests for downsampleBucket and downsampleLTTB (validate marker preservation).
- docs/code-structure.md — visual overview of modules and where to start.

---

## Contact & contribution notes

- When contributing, keep PRs small and include manual verification steps.
- If you refactor behaviorally sensitive code (parsing or plotting), add regression tests or sample files used to validate the change.
