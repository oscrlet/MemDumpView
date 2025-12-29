// Web Worker for processing file imports
import type { MemorySeries } from '../types';

import { parseBinary, traverseRLEBitmap } from '../utils/binaryParser';

const summarizeMetadata = (metadata: any) => {
    if (!metadata || !metadata.pageTypes) return undefined;

    let totalPageCount = 0;
    let grandTotalSize = 0;
    let grandTotalUsedSize = 0;
    let emptyPageCount = 0;
    let totalEmptySize = 0;
    const typeStats: any[] = [];

    metadata.pageTypes.forEach((type: any) => {
        let typeCount = 0;
        let typeTotalSize = 0;
        let typeUsedSize = 0;

        type.pages.forEach((page: any) => {
            totalPageCount++;
            typeCount++;

            const pageSize = type.uniformPageSize || page.size || 0;
            let usedSize = 0;

            if (page.occupancy !== undefined) {
                usedSize = pageSize * page.occupancy;
            } else if (page.freeList) {
                const freeSize = page.freeList.reduce((s: number, range: [number, number]) => s + (range[1] - range[0]), 0);
                usedSize = Math.max(0, pageSize - freeSize);
            } else if (page.bitmap) {
                // Decode locally just for stats
                let freeSize = 0;
                traverseRLEBitmap(page.bitmap, (isFree, len) => {
                    if (isFree) freeSize += len * 8;
                });
                usedSize = Math.max(0, pageSize - freeSize);
            }

            const survivalRate = page.occupancy !== undefined ? page.occupancy : (pageSize > 0 ? usedSize / pageSize : 0);
            // Distinguish truly empty pages ('-') from near-empty pages ('(0%)')
            if (survivalRate === 0) {
                emptyPageCount++;
                totalEmptySize += pageSize;
            }

            typeTotalSize += pageSize;
            typeUsedSize += usedSize;
            grandTotalSize += pageSize;
            grandTotalUsedSize += usedSize;
        });

        typeStats.push({
            name: type.name,
            count: typeCount,
            survivalRate: typeTotalSize > 0 ? typeUsedSize / typeTotalSize : 0
        });
    });

    return {
        totalPageCount,
        totalSize: grandTotalSize,
        totalUsedSize: grandTotalUsedSize,
        overallSurvivalRate: grandTotalSize > 0 ? grandTotalUsedSize / grandTotalSize : 0,
        emptyPageCount,
        totalEmptySize,
        typeStats
    };
};

self.onmessage = async (e: MessageEvent) => {
    const file = e.data as File;

    try {
        let seriesArray: MemorySeries[] = [];

        self.postMessage({ type: 'progress', progress: 10 });

        if (file.name.endsWith('.mb') || file.type === 'application/octet-stream') {
            const buffer = await file.arrayBuffer();
            self.postMessage({ type: 'progress', progress: 30 });
            // parseBinary is synchronous currently, so it might block worker thread
            // and prevent progress messages. But for web workers it is fine.
            seriesArray = await parseBinary(buffer);
        } else {
            const text = await file.text();
            self.postMessage({ type: 'progress', progress: 30 });
            const data = JSON.parse(text);
            self.postMessage({ type: 'progress', progress: 50 });

            if (Array.isArray(data)) {
                seriesArray = data;
            } else if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
                seriesArray = [data as MemorySeries];
            } else {
                throw new Error("Invalid format: Root must be an array or an object.");
            }
        }

        self.postMessage({ type: 'progress', progress: 60 });

        // Process pre-calculations
        const totalPoints = seriesArray.reduce((sum, s) => sum + s.data.length, 0);
        let processedPoints = 0;

        for (const series of seriesArray) {
            for (const point of series.data) {
                if (point.meta && point.meta.memory) {
                    point.meta.memory.conclusion = summarizeMetadata(point.meta.memory);
                }
                processedPoints++;

                // Report progress every 50 points to avoid message spam
                if (processedPoints % 50 === 0) {
                    const calcProgress = 60 + Math.round((processedPoints / totalPoints) * 35);
                    self.postMessage({ type: 'progress', progress: Math.min(95, calcProgress) });
                }
            }
        }

        self.postMessage({ type: 'progress', progress: 100 });

        // Post back the success result
        self.postMessage({ type: 'success', data: seriesArray });
    } catch (err: any) {
        self.postMessage({ type: 'error', error: err.message });
    }
};
