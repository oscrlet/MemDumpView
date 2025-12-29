// Web Worker for processing data exports
import type { MemorySeries, DataPoint } from '../types';
import { encodeBinary } from '../utils/binaryEncoder';

/**
 * Helper to generate JSON parts for a series of MemorySeries objects in a chunked manner.
 */
async function* generateJsonChunks(seriesList: MemorySeries[]) {
    yield '[';
    for (let i = 0; i < seriesList.length; i++) {
        const s = seriesList[i];
        if (!s) continue;
        yield `{"id":${JSON.stringify(s.id)},"name":${JSON.stringify(s.name)},"visible":${s.visible},"color":${JSON.stringify(s.color)},"data":[`;

        for (let p = 0; p < s.data.length; p++) {
            yield JSON.stringify(s.data[p]);
            if (p < s.data.length - 1) yield ',';
        }

        yield ']}';
        if (i < seriesList.length - 1) yield ',';
    }
    yield ']';
}

let sessionSeries: MemorySeries[] = [];
let sessionExportType: 'binary' | 'json' = 'json';
let sessionFileHandle: any = null;

self.onmessage = async (e: MessageEvent) => {
    const { type, data } = e.data;

    try {
        if (type === 'INIT') {
            const { seriesMetadata, exportType, fileHandle } = data;
            sessionExportType = exportType;
            sessionFileHandle = fileHandle;
            sessionSeries = seriesMetadata.map((meta: any) => ({
                ...meta,
                data: []
            }));
        }
        else if (type === 'BATCH') {
            const { seriesIndex, points } = data as { seriesIndex: number, points: DataPoint[] };
            if (sessionSeries[seriesIndex]) {
                sessionSeries[seriesIndex].data.push(...points);
            }
        }
        else if (type === 'PROCESS') {
            const totalPoints = sessionSeries.reduce((sum, s) => sum + s.data.length, 0);
            let processedPoints = 0;

            const sendProgress = (points: number) => {
                processedPoints += points;
                const progress = Math.min(99, Math.round((processedPoints / totalPoints) * 100));
                self.postMessage({ type: 'progress', progress });
            };

            let writable: any = null;
            if (sessionFileHandle) {
                writable = await sessionFileHandle.createWritable();
            }

            const writeChunk = async (chunk: BlobPart) => {
                if (writable) {
                    await writable.write(chunk);
                } else {
                    self.postMessage({ type: 'chunk', data: chunk });
                }
            };

            if (sessionExportType === 'binary') {
                // For binary, progress is harder to track inside encodeBinary, 
                // so we do a simple jump for now or simulate.
                self.postMessage({ type: 'progress', progress: 50 });
                const blob = await encodeBinary(sessionSeries);
                sendProgress(totalPoints); // Done
                await writeChunk(blob);
            } else {
                let buffer = "";
                const CHUNK_SIZE_THRESHOLD = 512 * 1024; // 512KB chunks

                // Re-calculating progress based on series-point iteration for accuracy
                let currentSeriesIndex = 0;

                for await (const chunk of generateJsonChunks(sessionSeries)) {
                    buffer += chunk;
                    if (buffer.length > CHUNK_SIZE_THRESHOLD) {
                        await writeChunk(buffer);
                        buffer = "";

                        // Approximate progress (coarse because we are iterating chunks)
                        const currentTotal = sessionSeries.slice(0, currentSeriesIndex).reduce((s, ser) => s + ser.data.length, 0);
                        self.postMessage({ type: 'progress', progress: Math.min(95, Math.round((currentTotal / totalPoints) * 100)) });
                    }
                }
                if (buffer.length > 0) {
                    await writeChunk(buffer);
                }
            }

            if (writable) {
                await writable.close();
            }

            self.postMessage({ type: 'progress', progress: 100 });
            self.postMessage({ type: 'success' });

            // Clear session
            sessionSeries = [];
            sessionFileHandle = null;
        }
    } catch (err: any) {
        self.postMessage({ type: 'error', error: err.message });
    }
};
