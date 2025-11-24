# MemDumpView - MVVM Architecture

A modular plot application for visualizing time-series memory dump data with support for CSV/JSON import, LTTB downsampling, interactive pinning, and data export.

## 🏗️ Architecture Overview

This project follows the **MVVM (Model-View-ViewModel)** design pattern for clear separation of concerns and improved maintainability.

### Architecture Layers

```
┌─────────────────────────────────────────────────┐
│                    View Layer                    │
│  (UI Rendering & User Interaction Handling)     │
│  ChartView, SidebarView, PinnedListView         │
└──────────────────┬──────────────────────────────┘
                   │ subscribes to
                   ↓
┌─────────────────────────────────────────────────┐
│                ViewModel Layer                   │
│    (State Management & Command Handling)         │
│  ChartViewModel, SidebarViewModel,              │
│  PinnedListViewModel                            │
└──────────────────┬──────────────────────────────┘
                   │ wraps & observes
                   ↓
┌─────────────────────────────────────────────────┐
│                  Model Layer                     │
│   (Data & Business Logic)                        │
│  ChartModel (with Observable State)              │
└─────────────────────────────────────────────────┘
```

### Directory Structure

```
src/
├── lib/
│   └── observable.js           # Lightweight reactive state management
├── models/
│   └── ChartModel.js           # Core data model with observable state
├── viewmodels/
│   ├── ChartViewModel.js       # Chart state and commands
│   ├── SidebarViewModel.js     # Sidebar controls and file operations
│   └── PinnedListViewModel.js  # Pinned points management
├── views/
│   ├── ChartView.js            # Chart canvas rendering
│   ├── SidebarView.js          # Sidebar UI
│   └── PinnedListView.js       # Pinned points list UI
├── components/
│   ├── base/
│   │   └── ComponentBase.js    # Reusable component utilities
│   └── shared/
│       └── Card.js             # Shared Card component
├── utils/
│   ├── csv.js                  # CSV parsing utilities
│   ├── json.js                 # JSON parsing utilities
│   ├── lttb.js                 # LTTB downsampling algorithm
│   └── format.js               # Data formatting utilities
└── main.js                     # Application wiring (dependency injection)
```

## 🚀 Getting Started

### Prerequisites

- Node.js 16+ and npm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Development

The dev server will start at `http://localhost:5173/` with hot module reloading.

## 📚 MVVM Pattern Details

### Model Layer

**`ChartModel`** - Core data model
- Manages series data, view window, pinned points
- Uses `observable` pattern for reactive state updates
- Independent of UI - can be tested in isolation
- Handles CSV/JSON parsing, LTTB downsampling

```javascript
// Example: Creating a model
const chartModel = new ChartModel();

// Subscribe to state changes
chartModel.state.subscribe((newState) => {
  console.log('State updated:', newState);
});

// Load a file
await chartModel.loadFile(file);
```

### ViewModel Layer

ViewModels wrap the Model and provide:
- Commands for user actions
- Derived/computed values
- View-specific state management

**`ChartViewModel`** - Manages chart visualization
```javascript
const viewModel = new ChartViewModel(chartModel);

// Commands
viewModel.zoom(1.2, centerMicro);
viewModel.togglePinAt(series, point);
viewModel.loadFile(file);

// Queries
const visibleSeries = viewModel.getVisibleSeries();
const metrics = viewModel.getPlotMetrics(width, height, dpr);
```

**`SidebarViewModel`** - Manages sidebar controls
```javascript
const sidebarVM = new SidebarViewModel(chartModel);

sidebarVM.exportCSV();
sidebarVM.setSampleTarget(1000);
sidebarVM.fitAll();
```

**`PinnedListViewModel`** - Manages pinned points
```javascript
const pinnedVM = new PinnedListViewModel(chartModel);

pinnedVM.selectAll();
pinnedVM.deleteSelected();
pinnedVM.renamePin(pin, 'New Label');
pinnedVM.jumpToPin(pin);
```

### View Layer

Views are pure UI components that:
- Render DOM elements
- Handle user interactions
- Subscribe to ViewModel state changes
- Call ViewModel commands on user actions

**`ChartView`** - Canvas-based chart rendering
```javascript
const chartView = new ChartView(chartViewModel, container);
// Automatically subscribes to viewModel and re-renders on state changes
```

### Observable Pattern

The lightweight `observable.js` library provides reactive state management:

```javascript
import { createObservable } from './lib/observable.js';

const state = createObservable({
  count: 0,
  items: []
});

// Subscribe to changes
const unsubscribe = state.subscribe((newState) => {
  console.log('State changed:', newState);
});

// Update state
state.set({ count: 1 });                    // Partial update
state.set(prev => ({ count: prev.count + 1 })); // Functional update

// Unsubscribe
unsubscribe();
```

## ✨ Features

### Data Import
- **CSV Import**: Supports various CSV formats with automatic delimiter detection
- **JSON Import**: Import structured JSON data with metadata
- **Drag & Drop**: Drag files directly onto the chart area
- **Multiple Files**: Load multiple files simultaneously

### Visualization
- **LTTB Downsampling**: Efficient downsampling for large datasets
- **Interactive Zoom**: Mouse wheel zoom, box zoom (drag), keyboard zoom (W/S)
- **Pan**: Drag to pan, keyboard pan (A/D)
- **Multiple Series**: Display multiple data series with color coding
- **Toggle Visibility**: Click legend items to show/hide series

### Pinned Points
- **Click to Pin**: Click any point to pin it
- **Keyboard Shortcut**: Press 'Q' to pin hovered point
- **Multi-Select**: Shift+drag for box selection, Ctrl for multi-select
- **Rename**: Right-click menu to rename pins
- **Hide/Show**: Toggle pin visibility
- **Jump**: Jump to pinned location
- **Export**: Export pinned points as CSV

### Export
- **PNG Export**: High-resolution chart export
- **CSV Export**: Export sampled data
- **Pinned CSV**: Export all pinned points with labels

### Keyboard Shortcuts
- `A/D` - Pan left/right
- `W/S` - Zoom in/out
- `Q` - Pin/unpin hovered point
- `ESC` - Deselect all pins
- `Delete/Backspace` - Delete selected pins

## 🧪 Testing

The MVVM architecture makes unit testing straightforward:

```javascript
// Test Model
const model = new ChartModel();
model.state.subscribe(state => {
  assert(state.seriesList.length === 1);
});
model.seriesList = [{ id: 'test', name: 'Test Series', ... }];

// Test ViewModel
const vm = new ChartViewModel(model);
vm.zoom(2, 1000);
const state = vm.getState();
assert(state.viewMaxX - state.viewMinX < initialSpan);
```

## 📖 Adding New Features

### 1. Add Model Logic
```javascript
// In ChartModel
addNewFeature() {
  // Update model state
  this.state.set({ newFeature: true });
}
```

### 2. Add ViewModel Command
```javascript
// In appropriate ViewModel
executeNewFeature() {
  this.model.addNewFeature();
}
```

### 3. Add View UI
```javascript
// In appropriate View
render() {
  // Subscribe to viewModel state
  this.viewModel.subscribe(state => {
    if (state.newFeature) {
      this.renderNewFeature();
    }
  });
}
```

### 4. Wire in main.js
```javascript
// In main.js
button.addEventListener('click', () => {
  viewModel.executeNewFeature();
});
```

## 🔧 Technical Decisions

### Why MVVM?
- **Testability**: Each layer can be tested independently
- **Maintainability**: Clear separation of concerns
- **Scalability**: Easy to add new features
- **Reusability**: ViewModels can be shared across views

### Why Custom Observable?
- **Lightweight**: ~100 lines, no dependencies
- **Purpose-built**: Tailored for our needs
- **Educational**: Easy to understand and modify

### Why Keep Legacy Components?
- **Backward Compatibility**: Smooth migration path
- **Risk Mitigation**: Can roll back if needed
- **Gradual Deprecation**: Will be removed in future versions

## 🐛 Known Issues

None at this time. The refactoring maintains 100% feature compatibility with the original implementation.

## 🤝 Contributing

When adding new features:
1. Start with Model changes (data/logic)
2. Add ViewModel commands
3. Update Views to use new commands
4. Wire everything in main.js
5. Test thoroughly

## 📄 License

[Add your license here]

## 👥 Authors

[Add authors here]

---

**Note**: This codebase has been refactored to MVVM architecture while maintaining 100% backward compatibility with the original implementation.
