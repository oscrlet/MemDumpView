import type { MemorySeries, DataPoint, PageType, Page } from '@/types';
import { v4 as uuidv4, stringify as uuidStringify } from 'uuid';

const SECTION_STRING_TABLE = 0x01;
const SECTION_DATA_SERIES = 0x02;

class BinaryReader {
    private view: DataView;
    private offset: number;
    private buffer: ArrayBuffer;
    private uint8Array: Uint8Array;

    constructor(buffer: ArrayBuffer) {
        this.buffer = buffer;
        this.view = new DataView(buffer);
        this.uint8Array = new Uint8Array(buffer);
        this.offset = 0;
    }

    public getOffset(): number {
        return this.offset;
    }

    readU8(): number {
        const len = 1;
        if (this.offset + len > this.uint8Array.length) {
            throw new Error(`Out of bounds readU8: offset ${this.offset}, length ${this.uint8Array.length}`);
        }
        const val = this.view.getUint8(this.offset);
        this.offset += len;
        return val;
    }

    readU16(): number {
        const len = 2;
        if (this.offset + len > this.uint8Array.length) {
            throw new Error(`Out of bounds readU16: offset ${this.offset}, length ${this.uint8Array.length}`);
        }
        const val = this.view.getUint16(this.offset, true);
        this.offset += len;
        return val;
    }

    readU32(): number {
        const len = 4;
        if (this.offset + len > this.uint8Array.length) {
            throw new Error(`Out of bounds readU32: offset ${this.offset}, length ${this.uint8Array.length}`);
        }
        const val = this.view.getUint32(this.offset, true);
        this.offset += len;
        return val;
    }

    readVarint(): number {
        let result = 0;
        let shift = 0;
        while (true) {
            if (this.offset >= this.uint8Array.length) {
                throw new Error('Unexpected end of stream');
            }
            const byte = this.uint8Array[this.offset++];
            if (byte === undefined) break; // Should not happen due to check above
            result += (byte & 0x7F) * Math.pow(2, shift);
            if ((byte & 0x80) === 0) break;
            shift += 7;
        }
        return result;
    }

    readFloat32(): number {
        const len = 4;
        if (this.offset + len > this.uint8Array.length) {
            throw new Error(`Out of bounds readFloat32: offset ${this.offset}, length ${this.uint8Array.length}`);
        }
        const val = this.view.getFloat32(this.offset, true);
        this.offset += len;
        return val;
    }

    readFloat64(): number {
        const len = 8;
        if (this.offset + len > this.uint8Array.length) {
            throw new Error(`Out of bounds readFloat64: offset ${this.offset}, length ${this.uint8Array.length}`);
        }
        const val = this.view.getFloat64(this.offset, true);
        this.offset += len;
        return val;
    }

    readString(): string {
        const len = this.readVarint();
        const bytes = this.uint8Array.subarray(this.offset, this.offset + len);
        this.offset += len;
        return new TextDecoder().decode(bytes);
    }

    readUuid(): string {
        const len = 16;
        if (this.offset + len > this.uint8Array.length) {
            throw new Error(`Out of bounds readUuid: offset ${this.offset}, length ${this.uint8Array.length}`);
        }
        const bytes = this.uint8Array.subarray(this.offset, this.offset + len);
        this.offset += len;
        let isZero = true;
        for (let i = 0; i < 16; i++) {
            if (bytes[i] !== 0) {
                isZero = false;
                break;
            }
        }
        if (isZero) return uuidv4();
        return uuidStringify(bytes);
    }

    // Decodes RLE buffer into FreeList ranges [Start, End]
    readBitmapFreeList(byteLength: number): [number, number][] {
        const startOffset = this.offset;
        const endOffset = startOffset + byteLength;

        const freeList: [number, number][] = [];
        let currentBitIndex = 0;
        let currentState = 0; // 0 = Occupied, 1 = Free

        while (this.offset < endOffset) {
            const runLength = this.readVarint();
            if (currentState === 1) { // Free Run
                // Start Bit -> End Bit
                const startByte = currentBitIndex * 8;
                const endByte = (currentBitIndex + runLength) * 8;
                freeList.push([startByte, endByte]);
            }
            currentBitIndex += runLength;
            currentState = 1 - currentState; // Toggle
        }

        this.offset = endOffset; // Ensure aligned
        return freeList;
    }

    hasMore(): boolean {
        return this.offset < this.buffer.byteLength;
    }
}

export async function parseBinary(buffer: ArrayBuffer): Promise<MemorySeries[]> {
    const magicView = new DataView(buffer);
    if (buffer.byteLength < 8) throw new Error('File too small to be a valid MEMD file');

    // Check for Gzip ID (1F 8B)
    const b0 = magicView.getUint8(0);
    const b1 = magicView.getUint8(1);

    // Header parsing
    let headerOffset = 0;

    let isCompressedBody = false;
    let dataBuffer = buffer;

    if (b0 === 77 && b1 === 69 && magicView.getUint8(2) === 77 && magicView.getUint8(3) === 68) {
        // MEMD Magic found.
        headerOffset = 8; // Magic(4) + Ver(2) + Flags(2)
        const version = magicView.getUint16(4, true);
        const flags = magicView.getUint16(6, true);

        if (flags & 0x01) { // FLAG_COMPRESSED_GZIP
            isCompressedBody = true;
        } else if (version >= 1) {
            isCompressedBody = false;
        } else {
            throw new Error(`Unsupported version: ${version}`);
        }
    } else {
        throw new Error('Invalid file format');
    }

    if (isCompressedBody) {
        const compressedData = buffer.slice(headerOffset);
        const ds = new DecompressionStream('gzip');
        const decompressedStream = new Response(compressedData).body?.pipeThrough(ds);
        if (!decompressedStream) throw new Error('Decompression failed');
        dataBuffer = await new Response(decompressedStream).arrayBuffer();
    } else {
        dataBuffer = buffer.slice(headerOffset);
    }

    const reader = new BinaryReader(dataBuffer);
    const strings: string[] = [];
    const seriesList: MemorySeries[] = [];

    while (reader.hasMore()) {
        const sectionId = reader.readU8();
        if (sectionId === SECTION_STRING_TABLE) {
            const count = reader.readVarint();
            for (let i = 0; i < count; i++) {
                strings.push(reader.readString());
            }
        } else if (sectionId === SECTION_DATA_SERIES) {
            const seriesData = parseSeriesSection(reader, strings);
            seriesList.push(...seriesData);
        } else {
            break;
        }
    }

    return seriesList;
}

function parseSeriesSection(reader: BinaryReader, strings: string[]): MemorySeries[] {
    const seriesCount = reader.readVarint();
    const result: MemorySeries[] = [];

    for (let s = 0; s < seriesCount; s++) {
        const id = reader.readUuid();
        const nameIdx = reader.readVarint();
        const colorIdx = reader.readVarint();
        const visible = reader.readU8() === 1;

        const pointCount = reader.readVarint();
        const data: DataPoint[] = new Array(pointCount);

        for (let p = 0; p < pointCount; p++) {
            const timestamp = reader.readFloat64();
            const value = reader.readFloat64();
            const flags = reader.readU8();

            const hasMeta = (flags & 0x01) !== 0;
            const hasName = (flags & 0x02) !== 0;
            const hasPointId = (flags & 0x04) !== 0;

            let name: string | undefined;
            if (hasName) name = strings[reader.readVarint()];

            let pointId: string | undefined;
            if (hasPointId) pointId = reader.readUuid();
            else pointId = uuidv4();

            let meta: any = undefined;

            if (hasMeta) {
                meta = {};
                const eventNameIdx = reader.readVarint();
                if (eventNameIdx > 0) {
                    meta.event = strings[eventNameIdx - 1]; // -1 because 0 is null
                }

                const hasMemory = reader.readU8() === 1;
                if (hasMemory) {
                    const pageTypes: PageType[] = [];
                    const ptCount = reader.readVarint();

                    for (let pt = 0; pt < ptCount; pt++) {
                        const ptName = strings[reader.readVarint()];
                        const uniformSize = reader.readVarint();
                        const pageCount = reader.readVarint();
                        const pages: Page[] = new Array(pageCount);

                        for (let pg = 0; pg < pageCount; pg++) {
                            let size = 0;
                            if (uniformSize === 0) size = reader.readVarint();
                            else size = uniformSize;

                            const occupancyRaw = reader.readFloat32();

                            // FreeList/Bitmap decoding (It's strictly RLE now)
                            const rleLen = reader.readVarint();
                            const freeList = reader.readBitmapFreeList(rleLen);

                            const pageObj: Page = {
                                size,
                                freeList,
                            };
                            if (occupancyRaw !== -1) pageObj.occupancy = occupancyRaw;
                            pages[pg] = pageObj;
                        }

                        pageTypes.push({
                            name: ptName || '',
                            pages,
                            uniformPageSize: uniformSize > 0 ? uniformSize : undefined
                        });
                    }
                    meta.memory = { pageTypes };
                }
            }

            data[p] = { timestamp, value, pointId, name, meta };
        }

        result.push({
            id,
            name: getString(strings, nameIdx),
            color: getString(strings, colorIdx),
            visible,
            data
        });
    }
    return result;
}


function getString(strings: string[], index: number): string {
    if (index >= 0 && index < strings.length) return strings[index] || '';
    return '';
}

export function decodeRLEBitmap(hex: string): [number, number][] {
    const match = hex.match(/.{1,2}/g);
    if (!match) return [];
    const bytes = new Uint8Array(match.length);
    for (let i = 0; i < match.length; i++) {
        bytes[i] = parseInt(match[i]!, 16);
    }
    const reader = new BinaryReader(bytes.buffer);
    return reader.readBitmapFreeList(bytes.length);
}

export function traverseRLEBitmap(hex: string, callback: (isFree: boolean, length: number) => void): void {
    const match = hex.match(/.{1,2}/g);
    if (!match) return;
    const bytes = new Uint8Array(match.length);
    for (let i = 0; i < match.length; i++) {
        bytes[i] = parseInt(match[i]!, 16);
    }
    const reader = new BinaryReader(bytes.buffer);

    // Manual iteration of RLE stream
    const endOffset = bytes.length; // Reader starts at 0
    let currentState = 0; // 0 = Occupied, 1 = Free

    while (reader.getOffset() < endOffset) {
        const runLength = reader.readVarint();
        callback(currentState === 1, runLength);
        currentState = 1 - currentState;
    }
}
