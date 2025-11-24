# MVVM Refactoring Migration Guide

This document explains the MVVM refactoring completed in this PR and provides guidance for future development.

## Architecture Overview

The application now follows the Model-View-ViewModel (MVVM) pattern:

```
┌─────────────┐
│    View     │  (Pure rendering, user interaction)
│             │  - ChartView.js
│             │  - SidebarView.js
│             │  - PinnedListView.js
└──────┬──────┘
       │ subscribes to
       │ calls commands on
┌──────▼──────┐
│  ViewModel  │  (Commands, derived state, UI logic)
│             │  - ChartViewModel.js
│             │  - SidebarViewModel.js
│             │  - PinnedListViewModel.js
└──────┬──────┘
       │ uses
       │ observes
┌──────▼──────┐
│    Model    │  (Business logic, data, algorithms)
│             │  - ChartModel.js
│             │  - Observable state
└─────────────┘
```

## Observable Pattern

The observable pattern (`src/lib/observable.js`) provides reactive state management:

```javascript
import { createObservable } from './lib/observable.js';

const state = createObservable({ count: 0 });

// Subscribe to changes
const unsubscribe = state.subscribe(newState => {
  console.log('State changed:', newState);
});

// Update state
state.set({ count: 1 });  // Triggers subscriber

// Update with function
state.set(prev => ({ count: prev.count + 1 }));

// Cleanup
unsubscribe();
```

## Key Changes

### ChartModel (src/models/ChartModel.js)

- Migrated from `ChartCore.js`
- Uses observable state instead of event emitters
- Maintains backward compatibility with legacy event API
- All data operations (loading, sampling, pinned points) update observable state

### ViewModels

**ChartViewModel**: Wraps ChartModel, provides commands like:
- `loadFiles(files)` - Load CSV/JSON files
- `togglePinAt(seriesId, relMicro, val, color, name)` - Toggle pin
- `pan(deltaX)` - Pan view
- `zoom(factor, centerRelMicro)` - Zoom view
- `jumpToPin(pin)` - Jump to pinned point

**SidebarViewModel**: Manages sidebar state and exports
**PinnedListViewModel**: Manages pin selection, rename, delete

### Views

Pure rendering components that:
1. Subscribe to ViewModel state changes
2. Re-render when state updates
3. Delegate user actions to ViewModel commands
4. Do NOT directly manipulate model data

## CSV Time Normalization Fix

**Problem**: CSV timestamps were not normalized to microseconds like JSON imports.

**Solution**: 
- Values < 1e13 → treated as milliseconds → multiply by 1000
- Values >= 1e13 → treated as microseconds → keep as-is
- Date strings → parsed with Date.parse() → multiply by 1000

**Rationale**:
- Current epoch ms: ~1.7e12 (year 2024)
- Current epoch μs: ~1.7e15 (year 2024)
- 1e13 cutoff safely distinguishes between ms and μs until year 2286

## Migration Checklist for Future Features

When adding new features, follow this pattern:

1. **Model Changes** (if data/business logic changes needed)
   - Update `ChartModel` with new methods
   - Update observable state with new fields
   - Keep backward compatibility

2. **ViewModel Changes**
   - Add commands for user actions
   - Add derived state queries
   - Subscribe to model state changes

3. **View Changes**
   - Subscribe to ViewModel state
   - Re-render on state changes
   - Call ViewModel commands for user actions
   - NO direct model access

## Backward Compatibility

For smooth transition, the following are preserved:

- `window.chart` - Global reference to ChartModel
- `chart.exportPNG()` - Delegates to ChartView
- Legacy event system - Model still emits events for compatibility
- Direct property access - Model provides getters/setters for legacy code

## Testing

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Manual Test Scenarios

1. **File Import**
   - CSV with ms timestamps
   - CSV with μs timestamps
   - CSV with date strings
   - JSON with various time formats

2. **Interactions**
   - Click to pin/unpin
   - Keyboard shortcuts (A/D/W/S/Q/ESC/Delete)
   - Drag to pan
   - Wheel to zoom
   - Box select (Shift+drag)

3. **Exports**
   - Export PNG
   - Export CSV
   - Export Pinned CSV

4. **Pin Management**
   - Select/deselect pins
   - Rename pins
   - Delete pins
   - Hide/show pins

## Files Reference

### New Files
- `src/lib/observable.js` - Observable state management
- `src/components/base/ComponentBase.js` - Shared UI utilities
- `src/models/ChartModel.js` - Data model with observable state
- `src/viewmodels/*.js` - ViewModels for commands and derived state
- `src/views/*.js` - Pure rendering components

### Modified Files
- `src/main.js` - MVVM wiring and app initialization
- `src/utils/csv.js` - Time normalization and date detection

### Legacy Files (preserved for reference)
- `src/main_legacy.js` - Original main.js backup
- `src/components/ChartCore.js` - Original model (can be removed)
- `src/components/ChartUI.js` - Original view (can be removed)
- `src/components/Sidebar.js` - Original sidebar (can be removed)
- `src/components/PinnedList.js` - Original pinned list (can be removed)

## Future Cleanup

After validating the refactoring in production:

1. Remove legacy component files
2. Remove legacy event system from ChartModel
3. Remove backward compatibility shims
4. Add unit tests for observable pattern
5. Add integration tests for ViewModels
6. Add e2e tests for critical user flows
