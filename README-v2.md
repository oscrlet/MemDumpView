# MemDumpView v2.0

Modern, modularized CSV data visualization tool with interactive charting capabilities.

## 🚀 Quick Start

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Then open your browser to the URL shown in the terminal (usually `http://localhost:5173`).

### Build for Production

```bash
npm run build
```

The production-ready files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## 📋 What's New in v2.0

This version represents a complete refactor of the plotting application with modern ES modules and improved architecture.

### Key Improvements

#### ✨ New Features
- **Drag & Drop Upload**: Drop CSV files directly onto the chart area
- **Selection Rectangle**: Visible rectangle when selecting data points on the chart
- **Button Hover Highlights**: All buttons now have proper hover effects for better UX
- **Tooltip Hover Detection**: Improved hover detection and tooltip positioning
- **Pin Toggle**: Double-click or use keyboard shortcut (P) to pin tooltips
- **Keyboard Shortcuts**: Full keyboard support for navigation and interaction
  - `P`: Pin current tooltip
  - `Esc`: Close all pinned tooltips
  - `+/-`: Zoom in/out
  - `Delete`: Remove selected pin
  - `Arrow Keys`: Navigate between pins
- **Touch Handling**: Full touch support for mobile devices
- **Pinned Tooltips**: Keep multiple data points visible simultaneously
- **Export Functions**: Export chart as PNG and pinned points as CSV

#### 🏗️ Architecture Improvements
- **Modular Components**: Clean separation between Sidebar, Chart, and PinnedList
- **ES Modules**: Modern JavaScript module system
- **Vite Build System**: Fast development and optimized production builds
- **Utility Functions**: Reusable formatting and parsing utilities
- **Event-Driven**: Component communication through clean event interfaces

### File Structure

```
/
├── index.html              # Main HTML entry point
├── package.json            # Project configuration and scripts
├── src/
│   ├── main.js            # Application orchestrator
│   ├── styles.css         # Global styles with hover effects
│   ├── components/
│   │   ├── Sidebar.js     # Control panel component
│   │   ├── Chart.js       # Main chart visualization component
│   │   └── PinnedList.js  # Pinned items display component
│   └── utils/
│       ├── format.js      # Formatting utilities
│       ├── lttb.js        # LTTB downsampling algorithm
│       └── csv.js         # CSV parsing with streaming support
└── README-v2.md           # This file
```

## 🎯 Features

### Data Loading
- Load CSV files via file input or drag & drop
- Automatic CSV parsing with header detection
- Support for large files with streaming parser
- Progress indicators during load

### Visualization
- Interactive canvas-based chart rendering
- Real-time data point highlighting
- Smooth zooming and panning
- Selection rectangle for multi-point selection
- Responsive design that works on all screen sizes

### Data Sampling
- **LTTB (Largest Triangle Three Buckets)**: Intelligent downsampling that preserves visual shape
- **Bucket Min/Max**: Fast downsampling showing extremes
- Configurable target point count
- Toggle between sampled and original data

### Tooltips & Pinning
- Hover tooltips showing point details
- Pin tooltips to keep them visible
- Multiple pinned tooltips supported
- Jump to pinned points
- Export pinned points as CSV

### Export
- Export chart as PNG image
- Export pinned data points as CSV
- Preserve data fidelity in exports

## 🖥️ Component API

### Chart Component

The Chart component exposes the following events:

- `status`: Chart loading/error status updates
- `seriesChanged`: Fired when data series are loaded/changed
- `pinnedChanged`: Fired when pins are added/removed
- `resampled`: Fired after data resampling
- `rendered`: Fired after chart render
- `hover`: Fired when hovering over a data point

Public methods:
- `loadFile(file)`: Load data from a File object
- `resampleInViewAndRender(algorithm, targetPoints)`: Resample and render
- `exportPNG()`: Export chart as PNG
- `exportPinnedCSV(pinnedPoints)`: Export pinned points as CSV
- `clearPinned()`: Clear all pinned points
- `computeGlobalExtents()`: Compute data bounds
- `jumpToPin(pin)`: Center view on a pin
- `handleKeyEvent(event)`: Handle keyboard events

### Sidebar Component

DOM-only component with event hooks:
- `fileSelected`: User selected a file
- `algorithmChanged`: Sampling algorithm changed
- `targetPointsChanged`: Target points changed
- `applySampling`: Apply sampling button clicked
- `toggleOriginal`: Toggle between original/sampled data
- `exportPNG`: Export PNG button clicked
- `exportCSV`: Export CSV button clicked
- `clearPinned`: Clear pinned button clicked

### PinnedList Component

DOM-only component with event hooks:
- `pinAdded`: Pin was added
- `pinRemoved`: Pin was removed
- `allPinsCleared`: All pins were cleared
- `jumpToPin`: User clicked to jump to a pin
- `pinHover`: Mouse entered a pin item

## 🎨 Styling

The application uses a modern, minimal design with:
- CSS custom properties for easy theming
- Responsive layout with flexbox/grid
- Smooth transitions and hover effects
- Mobile-first design approach
- Touch-friendly button sizes

## 🐛 Bug Fixes from v1.x

1. ✅ Drag-and-drop upload now works correctly
2. ✅ Selection rectangle is now visible during selection
3. ✅ Button hover styles properly highlight interactive elements
4. ✅ Tooltip hover detection is more precise
5. ✅ Pin toggle functionality works reliably
6. ✅ Keyboard shortcuts function correctly
7. ✅ Touch handling for mobile devices
8. ✅ Pinned tooltips remain visible and interactive

## 📝 Sample Files

The application will attempt to load `sample1.csv` or `sample2.csv` if present in the root directory. These are optional and only used to provide sample data.

## 🔧 Development Notes

### Modular Architecture

Components are designed to be:
- **Independent**: Each component manages its own state
- **Composable**: Components communicate via events
- **Testable**: Pure utility functions can be unit tested
- **Maintainable**: Clear separation of concerns

### Event Flow

```
User Action → Sidebar Event → main.js → Chart Method → Chart Event → Update UI
```

Example: File upload
1. User drops file on chart area
2. Drop handler in main.js receives file
3. main.js calls `chart.loadFile(file)`
4. Chart parses and renders data
5. Chart emits `seriesChanged` event
6. main.js updates sidebar info

### Adding New Features

To add a new feature:
1. Determine which component owns the functionality
2. Add the feature to that component
3. Expose events if other components need to react
4. Wire events in main.js
5. Update styles.css if needed

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
