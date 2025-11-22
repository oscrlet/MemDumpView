# Memory Dump Viewer v2.0

A modern, modular visualization tool for analyzing memory dump and CSV data with interactive charts.

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation & Running

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm build

# Preview production build
npm run preview
```

The app will be available at `http://localhost:5173` (dev) or `http://localhost:5174` (preview).

## 📋 Features

- **Interactive Canvas Chart**: Pan, zoom, and select data with mouse and touch
- **Drag & Drop**: Drop CSV files anywhere to load them instantly
- **Data Resampling**: LTTB algorithm for efficient visualization of large datasets
- **Pinned Points**: Click to pin important data points for reference
- **Keyboard Navigation**: Fast navigation with keyboard shortcuts
- **Export**: Save charts as PNG or export pinned points as CSV
- **Responsive**: Works on desktop, tablet, and mobile devices
- **Touch Support**: Full touch interaction support (pan, pinch-zoom, long-press to pin)

## 🎮 Usage

### Loading Data

1. **Drag & Drop**: Simply drag a CSV file onto the browser window
2. **File Picker**: Click "Load CSV File" button in the sidebar
3. **Sample Data**: Click "Load Sample Data" to load demo data (if available)

### CSV Format

The app expects CSV files with at least two numeric columns (x, y):

```csv
x,y
0.0,10.5
1.0,12.3
2.0,11.8
...
```

### Navigation & Interaction

#### Mouse Controls
- **Click**: Pin/unpin a data point
- **Shift + Drag**: Select an area to zoom in
- **Drag**: Pan the view
- **Scroll**: Zoom in/out at cursor position

#### Touch Controls
- **Tap**: Pin/unpin a data point
- **Long Press**: Pin a data point
- **Drag**: Pan the view
- **Pinch**: Zoom in/out

#### Keyboard Shortcuts
- **A**: Jump to previous pinned point
- **D**: Jump to next pinned point
- **W**: Pan view up
- **S**: Pan view down
- **Q**: Zoom out
- **Escape**: Cancel selection
- **Delete**: Remove last pinned point

### View Controls

- **Resample**: Downsample data to 1000 points using LTTB algorithm (preserves visual shape)
- **Reset View**: Return to original view showing all data
- **Export PNG**: Save current chart view as PNG image
- **Export Pinned CSV**: Download pinned points as CSV file

## 🏗️ Architecture

### Project Structure

```
/
├── index.html              # Entry point
├── package.json            # NPM configuration with ES modules
├── README.md              # This file
└── src/
    ├── main.js            # Application orchestrator
    ├── styles.css         # Global styles
    ├── components/
    │   ├── Chart.js       # Canvas chart component with event API
    │   ├── Sidebar.js     # Control panel component
    │   └── PinnedList.js  # Pinned points list component
    └── utils/
        ├── csv.js         # CSV parsing utilities
        ├── format.js      # Number/byte formatting
        └── lttb.js        # LTTB downsampling algorithm
```

### Module Architecture

The application follows a modern, event-driven component architecture:

- **main.js**: Orchestrates components and wires up event handlers
- **Chart.js**: Canvas-based chart with EventEmitter API
- **Sidebar.js**: DOM-only component for controls
- **PinnedList.js**: DOM-only component for pinned points display

All components communicate through events, ensuring loose coupling and maintainability.

### Chart Component API

The Chart component exposes the following event emitter interface:

#### Events
- `status`: File loading status and progress
- `seriesChanged`: Data series updated
- `pinnedChanged`: Pinned points changed
- `resampled`: Data resampled
- `rendered`: Chart rendered
- `hover`: Mouse hover over data point

#### Public Methods
- `loadFile(file)`: Load CSV data from file
- `resampleInViewAndRender(threshold)`: Downsample and render
- `exportPNG()`: Export chart as PNG
- `exportPinnedCSV()`: Export pinned points as CSV
- `clearPinned()`: Clear all pinned points
- `computeGlobalExtents()`: Calculate data bounds
- `jumpToPin(index)`: Navigate to pinned point
- `handleKeyEvent(event)`: Handle keyboard input

## ✨ What's New in v2.0

Version 2.0 is a complete modular refactor with the following key improvements:

### Bug Fixes & Enhancements

1. **✅ Drag & Drop Upload**: Fixed file drag-and-drop functionality
   - Drop overlay now displays correctly when dragging files
   - Files are properly loaded when dropped onto the window

2. **✅ Selection Rectangle**: Fixed selection box visibility
   - Selection rectangle (`select-rect`) is now visible during Shift+Drag selection
   - Rectangle persists during the entire selection operation
   - Properly styled with border and semi-transparent fill

3. **✅ Button Hover Styles**: Fixed interactive button feedback
   - `.card-btn:hover` effects work correctly in sidebar
   - `.legend-item:hover` effects work in pinned list
   - Visual feedback on all interactive elements

4. **✅ Canvas Hover Detection**: Fixed tooltip behavior
   - Hover detection works correctly over data points
   - Tooltip shows accurate x,y coordinates
   - Tooltip is properly positioned and clamped within chart area

5. **✅ Click to Pin**: Fixed pinning interaction
   - Click on data points correctly toggles pinned state
   - Pinned points are highlighted with distinct styling
   - Pinned list updates immediately

6. **✅ Keyboard Shortcuts**: All keyboard commands working
   - **a/d**: Navigate between pinned points
   - **w/s**: Pan view vertically
   - **q**: Zoom out
   - **Escape**: Cancel selection
   - **Delete**: Remove last pinned point

7. **✅ Touch Interactions**: Full touch support restored
   - Pan: Single finger drag
   - Pinch zoom: Two finger pinch/spread
   - Long-press pin: Touch and hold to pin a point
   - All gestures work smoothly on mobile devices

8. **✅ Pinned Tooltip Positioning**: Fixed tooltip placement
   - Pinned point tooltips render at correct positions
   - Tooltips are clamped within chart boundaries
   - No overflow outside visible area

### Code Quality Improvements

- **Modular Architecture**: Clean separation of concerns with ES6 modules
- **Event-Driven Design**: Components communicate via events, not direct coupling
- **Type Safety**: Proper parameter validation and error handling
- **Performance**: Efficient LTTB downsampling for large datasets
- **Streaming Parser**: Chunked CSV parsing with progress reporting
- **Canvas Rendering**: Hardware-accelerated 2D canvas rendering
- **Responsive Design**: Mobile-first CSS with proper viewport handling

## 🔧 Development

### Project Scripts

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
npm run format   # Format code with Prettier
```

### Adding New Features

1. **New Utility**: Add to `src/utils/`
2. **New Component**: Add to `src/components/` with event-driven API
3. **Wire Events**: Connect in `src/main.js`
4. **Update Styles**: Add styles to `src/styles.css`

### Testing

Manual testing checklist:
- [ ] Load CSV file via button
- [ ] Drag & drop CSV file
- [ ] Click to pin points
- [ ] Shift+drag to select area
- [ ] Mouse wheel to zoom
- [ ] Drag to pan
- [ ] All keyboard shortcuts
- [ ] Touch pan and pinch zoom
- [ ] Long-press to pin on touch
- [ ] Export PNG
- [ ] Export pinned CSV
- [ ] Resample large dataset

## 📝 License

See [LICENSE](LICENSE) file for details.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

---

**Memory Dump Viewer v2.0** - Built with modern web technologies for fast, interactive data visualization.
