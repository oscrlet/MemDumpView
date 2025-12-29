/**
 * Memory page, consisting of multiple blocks (optimized using freeList)
 */
export interface Page {
  freeList?: [number, number][]; // [start, end] pair indicating empty regions
  bitmap?: string; // Hex RLE encoded bitmap (1 bit = 8 bytes). Replaces freeList if present.
  size: number; // Page size in bytes
  occupancy?: number; // Optional pre-calculated occupancy rate (0-1)
}

/**
 * Page type, a collection of pages
 */
export interface PageType {
  name: string;
  pages: Page[];
  uniformPageSize?: number; // Define here if sizes are consistent
}

/**
 * Pre-calculated memory statistics conclusion
 */
export interface MemoryConclusion {
  totalPageCount: number;
  totalSize: number;
  totalUsedSize: number;
  overallSurvivalRate: number;
  emptyPageCount: number; // New
  totalEmptySize: number; // New
  typeStats: {
    name: string;
    count: number;
    survivalRate: number;
  }[];
}

/**
 * Complete memory metadata structure
 */
export interface MemoryMetadata {
  pageTypes: PageType[];
  occupancy?: number; // Optional pre-calculated occupancy rate (0-1)
  conclusion?: MemoryConclusion; // New: pre-calculated statistical conclusion
}

/**
 * Single data point
 */
export interface DataPoint {
  timestamp: string | number; // ISO string or microseconds since epoch
  value: number;     // Memory value
  meta?: {
    memory?: MemoryMetadata; // MemoryMetadata is optional
    [key: string]: any; // Allows any other metadata
  };
  // For easy reverse lookup, series info can be added dynamically during processing
  seriesId?: string;
  pointId?: string; // Unique ID for each point
  name?: string; // <--- New: Add optional custom name for data points
}

/**
 * Single data series
 */
export interface MemorySeries {
  id: string;        // Unique identifier for the series (e.g. UUID)
  name: string;      // Series name
  data: DataPoint[]; // Array of data points
  visible: boolean;  // Controls visibility on the chart
  color: string;     // Persistent color for the series
}

/**
 * Selected point
 * Contains enough info to be displayed in UI and linked with chart
 */
export interface SelectedPoint extends DataPoint {
  seriesId: string;
  seriesName: string;
  isAnnotationVisible?: boolean; // New: Controls chart annotation visibility
}
