const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

const PAGE_TYPES = ['Code', 'Stack', 'Heap', 'Texture', 'Audio', 'GPU Resource'];

function generateMetadata() {
    const pageTypes = [];
    let totalPages = 0;

    PAGE_TYPES.forEach(typeName => {
        const numPages = Math.floor(Math.random() * 30) + 10; // 10-40 pages per type
        const pages = [];

        for (let i = 0; i < numPages; i++) {
            const blockSize = 1024;
            const numBlocks = Math.floor(Math.random() * 8) + 4; // 4-12 blocks
            const totalSize = numBlocks * blockSize;

            const freeList = [];
            let fullCount = 0;

            // Randomly generate free regions
            for (let j = 0; j < numBlocks; j++) {
                const isFull = Math.random() > 0.3;
                if (!isFull) {
                    const start = j * blockSize;
                    const end = (j + 1) * blockSize;
                    // Merge with previous if contiguous
                    if (freeList.length > 0 && freeList[freeList.length - 1][1] === start) {
                        freeList[freeList.length - 1][1] = end;
                    } else {
                        freeList.push([start, end]);
                    }
                } else {
                    fullCount++;
                }
            }

            const useOccupancy = Math.random() > 0.5;
            const page = {
                freeList,
                size: totalSize
            };

            if (useOccupancy) {
                page.occupancy = totalSize > 0 ? (fullCount * blockSize) / totalSize : 0;
            }

            pages.push(page);
            totalPages++;
        }

        pageTypes.push({
            name: typeName,
            pages
        });
    });

    // Ensure total pages > 100
    if (totalPages < 100) {
        // Add one big chunk if short
        const extraPages = 110 - totalPages;
        const bigPages = [];
        for (let k = 0; k < extraPages; k++) {
            bigPages.push({
                freeList: [], // Fully full
                size: 4096,
                occupancy: 1
            });
        }
        pageTypes.push({ name: 'Overflow', pages: bigPages, uniformPageSize: 4096 });
    }

    return { pageTypes };
}

function generateSeries(name, startTime, durationSeconds) {
    const data = [];
    let currentTime = new Date(startTime).getTime();
    let currentMemory = (50 + Math.random() * 50) * 1024 * 1024; // Start 50-100 MB in bytes
    const interval = 1000; // 1 second per point
    const pointsCount = durationSeconds; // 1 point per second

    let timeSinceLastGC = 0;

    for (let i = 0; i < pointsCount; i++) {
        // Time in microseconds
        const microTimestamp = currentTime * 1000;

        // Memory drift (upwards mostly)
        currentMemory += (Math.random() * 2 - 0.5) * 1024 * 1024;
        if (currentMemory < 20 * 1024 * 1024) currentMemory = 20 * 1024 * 1024;

        let meta = {};
        let pointName = undefined;

        // GC Check
        // Trigger GC every ~20-30 seconds
        if (timeSinceLastGC > 20 && Math.random() > 0.8) {
            // GC START Point (High memory, with metadata)
            const preGCMemory = currentMemory;
            meta = { memory: generateMetadata(), event: 'GC_START' };
            pointName = `GC Start`;

            data.push({
                timestamp: microTimestamp,
                value: Math.floor(preGCMemory),
                meta,
                name: pointName,
                pointId: generateUUID()
            });

            // GC Effect (Drop memory)
            const drop = (Math.random() * 30 + 10) * 1024 * 1024; // Drop 10-40 MB in bytes
            currentMemory = Math.max(20 * 1024 * 1024, currentMemory - drop);

            // Advance time slightly for "After GC" point? No, let's say it happens effectively instantly 
            // or next point. Let's make the NEXT point the post-GC point.

            timeSinceLastGC = 0;
        } else if (timeSinceLastGC === 0 && i > 0) {
            // This is the point immediately AFTER GC
            // It should also have metadata showing clean state
            meta = { memory: generateMetadata(), event: 'GC_END' };
            pointName = `GC End`;

            data.push({
                timestamp: microTimestamp,
                value: Math.floor(currentMemory),
                meta,
                name: pointName,
                pointId: generateUUID()
            });

            timeSinceLastGC++;
        } else {
            // Normal point (omit meta if empty)
            data.push({
                timestamp: microTimestamp,
                value: Math.floor(currentMemory),
                pointId: generateUUID()
            });
            timeSinceLastGC++;
        }

        currentTime += interval;
    }

    return {
        id: generateUUID(),
        name,
        visible: true,
        data
    };
}

const startTime = new Date().toISOString();
const series1 = generateSeries('Main Process', startTime, 600); // 10 mins
const series2 = generateSeries('Renderer Process', startTime, 600);
const series3 = generateSeries('Plugin Host', startTime, 600);

const result = [series1, series2, series3];

fs.writeFileSync(path.join(__dirname, 'mock_data.json'), JSON.stringify(result, null, 2));
console.log('Generated mock/mock_data.json');
