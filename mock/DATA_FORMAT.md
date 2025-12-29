# Memory Dump Data Format Guide

This document defines the data formats supported by the Memory Dump application. It covers logic data models, the flexible JSON interchange format, and the highly optimized binary format (`.mb`).

## 1. Logical Data Model

The core data model consists of **Series** of **Data Points**, where each point represents a snapshot in time.

### 1.1 Root Structure
The input is an array of `MemorySeries` objects.

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | Unique identifier for the series. |
| `name` | `string` | Display name (e.g., "Main Process"). |
| `color` | `hex` | (Optional) Visualization color (e.g., "#FF5733"). |
| `visible` | `bool` | Initial visibility state. |
| `data` | `DataPoint[]` | List of time-series data points. |

### 1.2 Data Point
Represents a single timestamped event or snapshot.

| Field | Type | Description |
| :--- | :--- | :--- |
| `timestamp` | `number` | Microseconds or ISO string. |
| `value` | `number` | Memory usage in **Bytes**. |
| `meta` | `Object` | (Optional) Extended metadata (Events, Memory Layout). |

### 1.3 Memory Layout (Bitmaps/Pages)
Detailed memory page usage is stored in `meta.memory`.

```json
"memory": {
  "pageTypes": [
    {
      "name": "Heap",
      "uniformPageSize": 4096,
      "pages": [
        {
          "size": 4096,
          "bitmap": "8000..." // RLE Hex String
        }
      ]
    }
  ]
}
```

---

## 2. JSON Format (`.json`)

The application supports standard JSON files adhering to the logical model.

### 2.1 Standard RLE Hex Format (Primary)
The standard way to represent page usage is the `bitmap` field. This is an **RLE-compressed Hex String** representing the occupied/free state of the page (1 bit = 8 bytes).

```json
{
  "size": 4096,
  "bitmap": "0080" // Hex string encoding the RLE stream
}
```
- **Encoding**: The string decodes to an RLE Varint Stream.
- **Efficiency**: Reduces file size by ~90% compared to legacy arrays.
- **Performance**: Loaded directly into memory without conversion.

### 2.2 Legacy FreeList Format (Deprecated)
*Note: This format is supported for backward compatibility but is inefficient and converted internally.*

```json
{
  "size": 4096,
  "freeList": [[0, 1024], [2048, 3072]]
}
```
- **Encoding**: The string decodes to an RLE Varint Stream (see Binary section below).
- **Compression**: Reduces file size by ~90% compared to raw arrays.

---

## 3. Binary Format (`.mb`)

The `.mb` format is a custom binary container designed for maximum efficiency. It achieves ~99% compression compared to raw JSON.

**Endianness**: Little Endian (LE)
**Strings**: Deduplicated via a String Table.
**Integers**: [Varint (LEB128)](https://en.wikipedia.org/wiki/LEB128) encoding for variable length.

### 3.1 File Structure (Version 2)

#### Header (8 bytes)
- **Magic**: `MEMD` (0x4D, 0x45, 0x4D, 0x44)
- **Version**: `0x0002` (uint16)
- **Flags**: `0x0000` (uint16)

#### Body (Gzip Compressed)
The entire body following the header is **Gzip compressed**.

1.  **String Table Section** (`ID=0x01`)
    - `Count` (Varint)
    - `Strings` (Length-Prefixed UTF-8)

2.  **Data Series Section** (`ID=0x02`)
    - `Series Count` (Varint)
    - **Per Series**:
        - `ID` (16 bytes UUID)
        - `Name Index`, `Color Index` (Varint)
        - `Point Count` (Varint)
        - **Per Point**:
            - `Timestamp`, `Value` (Float64)
            - `Flags` (uint8): HasName, HasMeta...
            - **Memory Snapshot** (if present):
                - `Page Types` (List)
                - **Per Page**:
                    - `Bitmaps`: Encoded as **RLE Varint Stream**.

### 3.2 RLE Bitmap Stream
Bitmaps (used in both Binary and JSON-Hex) are streams of alternating Run Lengths (in bits), always starting with **Occupied**.

`[OccupiedRun, FreeRun, OccupiedRun, ...]`

- **Example**: A 4096-byte page. First 1024 bytes (128 bits) occupied, next 2048 bytes (256 bits) free.
    - Stream: `[128, 256, 128]` (Occupied, Free, Occupied remainder)
    - Varints: `...`
