import { v4 as uuidv4, parse as parseUuid } from 'uuid';
import type { MemorySeries, Page } from '@/types';

const MAGIC = new Uint8Array([77, 69, 77, 68]); // MEMD
const VERSION = 2;
const SECTION_STRING_TABLE = 0x01;
const SECTION_DATA_SERIES = 0x02;

class BinaryWriter {
    buffer: Uint8Array;
    offset: number;

    constructor(initialSize = 1024 * 1024) {
        this.buffer = new Uint8Array(initialSize);
        this.offset = 0;
    }

    ensureSize(needed: number) {
        if (this.offset + needed > this.buffer.length) {
            const newSize = Math.max(this.buffer.length * 2, this.offset + needed);
            const newBuf = new Uint8Array(newSize);
            newBuf.set(this.buffer);
            this.buffer = newBuf;
        }
    }

    writeU8(val: number) {
        this.ensureSize(1);
        new DataView(this.buffer.buffer).setUint8(this.offset, val);
        this.offset += 1;
    }

    writeU16(val: number) {
        this.ensureSize(2);
        new DataView(this.buffer.buffer).setUint16(this.offset, val, true);
        this.offset += 2;
    }

    writeU32(val: number) {
        this.ensureSize(4);
        new DataView(this.buffer.buffer).setUint32(this.offset, val, true);
        this.offset += 4;
    }

    writeFloat32(val: number) {
        this.ensureSize(4);
        new DataView(this.buffer.buffer).setFloat32(this.offset, val, true);
        this.offset += 4;
    }

    writeFloat64(val: number) {
        this.ensureSize(8);
        new DataView(this.buffer.buffer).setFloat64(this.offset, val, true);
        this.offset += 8;
    }

    writeVarint(value: number) {
        const bytes: number[] = [];
        while (value >= 0x80) {
            bytes.push((value & 0x7F) | 0x80);
            value >>>= 7;
        }
        bytes.push(value);
        this.ensureSize(bytes.length);
        this.buffer.set(bytes, this.offset);
        this.offset += bytes.length;
    }

    writeString(str: string) {
        const encoder = new TextEncoder();
        const encoded = encoder.encode(str);
        this.writeVarint(encoded.length);
        this.ensureSize(encoded.length);
        this.buffer.set(encoded, this.offset);
        this.offset += encoded.length;
    }

    writeBytes(bytes: Uint8Array) {
        this.ensureSize(bytes.length);
        this.buffer.set(bytes, this.offset);
        this.offset += bytes.length;
    }

    getBuffer(): Uint8Array {
        return this.buffer.slice(0, this.offset);
    }
}

class StringTable {
    strings = new Map<string, number>();
    list: string[] = [];

    getIndex(str: string | undefined): number {
        const s = str || '';
        if (this.strings.has(s)) {
            return this.strings.get(s)!;
        }
        const index = this.list.length;
        this.strings.set(s, index);
        this.list.push(s);
        return index;
    }
}

function encodeVarintToBytes(value: number): number[] {
    const bytes: number[] = [];
    while (value >= 0x80) {
        bytes.push((value & 0x7F) | 0x80);
        value >>>= 7;
    }
    bytes.push(value);
    return bytes;
}

function getBitmapRLEBuffer(size: number, freeList: [number, number][] | undefined, bitmapHex: string | undefined, occupancy: number | undefined): Uint8Array {
    if (bitmapHex) {
        // Hex string to Uint8Array
        const match = bitmapHex.match(/.{1,2}/g);
        if (match) {
            return new Uint8Array(match.map(byte => parseInt(byte, 16)));
        }
    }

    if (freeList) {
        const sorted = freeList.map(p => [...p]).sort((a, b) => a[0] - b[0]);
        const runs = [0];
        let currentByteIndex = 0;

        for (const range of sorted) {
            const start = range[0];
            const end = range[1];
            if (typeof start !== 'number' || typeof end !== 'number') continue;

            // Gap (Occupied)
            const occBytes = start - currentByteIndex;
            if (occBytes > 0) {
                const occBits = Math.floor(occBytes / 8);
                if (runs.length % 2 === 1) {
                    const lastIdx = runs.length - 1;
                    runs[lastIdx] = (runs[lastIdx] ?? 0) + occBits;
                } else {
                    runs.push(occBits);
                }
            }
            // Range (Free)
            const freeBytes = end - start;
            if (freeBytes > 0) {
                const freeBits = Math.floor(freeBytes / 8);
                if (runs.length % 2 === 0) {
                    const lastIdx = runs.length - 1;
                    runs[lastIdx] = (runs[lastIdx] ?? 0) + freeBits;
                } else {
                    runs.push(freeBits);
                }
            }
            currentByteIndex = end;
        }

        if (currentByteIndex < size) {
            const trailingBytes = size - currentByteIndex;
            const trailingBits = Math.ceil(trailingBytes / 8);
            if (runs.length % 2 === 1) {
                const lastIdx = runs.length - 1;
                runs[lastIdx] = (runs[lastIdx] ?? 0) + trailingBits;
            } else {
                runs.push(trailingBits);
            }
        }

        // Convert runs to bytes
        const result: number[] = [];
        runs.forEach(r => result.push(...encodeVarintToBytes(r)));
        return new Uint8Array(result);
    }

    // Synthetic fallback
    if (occupancy !== undefined && occupancy >= 0 && occupancy < 1.0) {
        const totalBits = Math.ceil(size / 8);
        const usedBits = Math.floor(totalBits * occupancy);
        const freeBits = totalBits - usedBits;

        const result: number[] = [];
        result.push(...encodeVarintToBytes(usedBits));
        result.push(...encodeVarintToBytes(freeBits));
        return new Uint8Array(result);
    }

    // Default Full
    const bits = Math.ceil(size / 8);
    const result: number[] = [];
    result.push(...encodeVarintToBytes(bits));
    return new Uint8Array(result);
}

export async function encodeBinary(seriesList: MemorySeries[]): Promise<Blob> {
    const stringTable = new StringTable();
    const dataWriter = new BinaryWriter();

    // 1. Write Data Section (Pass 1 - populate string table)
    dataWriter.writeVarint(seriesList.length);

    for (const series of seriesList) {
        // UUID
        const uuidBytes = new Uint8Array(16);
        try {
            const parsed = parseUuid(series.id);
            if (parsed.length === 16) uuidBytes.set(parsed);
            else uuidBytes.set(parseUuid(uuidv4())); // Fallback
        } catch {
            uuidBytes.set(parseUuid(uuidv4()));
        }
        dataWriter.writeBytes(uuidBytes);

        dataWriter.writeVarint(stringTable.getIndex(series.name));
        dataWriter.writeVarint(stringTable.getIndex(series.color || '#000000'));
        dataWriter.writeU8(series.visible ? 1 : 0);

        dataWriter.writeVarint(series.data.length);

        for (const point of series.data) {
            dataWriter.writeFloat64(Number(point.timestamp));
            dataWriter.writeFloat64(Number(point.value));

            let flags = 0;
            const hasMeta = !!point.meta;
            const hasName = !!point.name;
            const hasPointId = !!point.pointId;

            if (hasMeta) flags |= 0x01;
            if (hasName) flags |= 0x02;
            if (hasPointId) flags |= 0x04;

            dataWriter.writeU8(flags);

            if (hasName) dataWriter.writeVarint(stringTable.getIndex(point.name));

            if (hasPointId) {
                const pidBytes = new Uint8Array(16);
                try {
                    const parsed = parseUuid(point.pointId!);
                    if (parsed.length === 16) pidBytes.set(parsed);
                } catch { /* empty */ }
                dataWriter.writeBytes(pidBytes);
            }

            if (hasMeta) {
                const eventName = point.meta!.event;
                if (eventName) {
                    dataWriter.writeVarint(stringTable.getIndex(eventName) + 1);
                } else {
                    dataWriter.writeVarint(0);
                }

                const memory = point.meta!.memory;
                dataWriter.writeU8(memory ? 1 : 0);

                if (memory) {
                    const pageTypes = memory.pageTypes || [];
                    dataWriter.writeVarint(pageTypes.length);

                    for (const pt of pageTypes) {
                        dataWriter.writeVarint(stringTable.getIndex(pt.name));
                        const uniformSize = pt.uniformPageSize || 0;
                        dataWriter.writeVarint(uniformSize);

                        const pages = pt.pages || [];
                        dataWriter.writeVarint(pages.length);

                        for (const page of pages) {
                            const p = page as Page;
                            if (uniformSize === 0) dataWriter.writeVarint(p.size);

                            const occ = p.occupancy !== undefined ? p.occupancy : -1;
                            dataWriter.writeFloat32(occ);

                            const rleBuffer = getBitmapRLEBuffer(p.size || uniformSize, p.freeList, p.bitmap, p.occupancy);
                            dataWriter.writeVarint(rleBuffer.length);
                            dataWriter.writeBytes(rleBuffer);
                        }
                    }
                }
            }
        }
    }

    // 2. Build Body (String Table + Data)
    const bodyWriter = new BinaryWriter();
    bodyWriter.writeU8(SECTION_STRING_TABLE);
    bodyWriter.writeVarint(stringTable.list.length);
    for (const str of stringTable.list) {
        bodyWriter.writeString(str);
    }
    bodyWriter.writeU8(SECTION_DATA_SERIES);
    bodyWriter.writeBytes(dataWriter.getBuffer());

    const uncompressedBody = bodyWriter.getBuffer();

    // 3. Compress using browser native CompressionStream
    // Wrap in Blob to satisfy BodyInit if strict types complain about Uint8Array
    const stream = new Response(new Blob([uncompressedBody as unknown as BlobPart])).body?.pipeThrough(new CompressionStream('gzip'));
    if (!stream) throw new Error("Gzip not supported");
    const compressedBody = await new Response(stream).arrayBuffer();

    // 4. Final File
    const finalWriter = new BinaryWriter();
    finalWriter.writeBytes(MAGIC);
    finalWriter.writeU16(VERSION);
    finalWriter.writeU16(1); // Flags: 0x0001 = FLAG_COMPRESSED_GZIP
    finalWriter.writeBytes(new Uint8Array(compressedBody));

    return new Blob([finalWriter.getBuffer() as unknown as BlobPart], { type: 'application/octet-stream' });
}
