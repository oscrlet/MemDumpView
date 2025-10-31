# Heap Dump File Data Structure & Template Sample

This document describes the expected format of the heap dump file the viewer accepts. It shows the high-level structure, field meanings and provides a copy-pasteable sample template you can use to generate or validate input files.

Important notes
- The loader looks for two phase markers (case-insensitive):
  - `phase1: heap use`
  - `phase2: page dump`
  - Both must exist and `phase2` must come after `phase1`.
- Lines in the heap phase and page dump phase are parsed with simple, tolerant regexes — see examples below.
- Timestamps and heap bytes are parsed with parseFloat (integers or decimal numbers allowed).
- GC dumps are correlated with heap markers by matching timestamps, not by position.
- Page usage tokens are simple characters or parenthesized percentages: `+`, `-`, and `(NN%)`.

1) File high-level layout
- A merged file contains two sections in order:

  1. Phase 1 — heap timeline
     - Begins after a line containing: `phase1: heap use`
     - Contains one heap sample per line (see format below)
     - Continues until the `phase2` marker

  2. Phase 2 — page dump (GC dumps)
     - Begins after a line containing: `phase2: page dump`
     - Contains multiple GC blocks (before/after) with headers and page usage lines

2) Phase 1 — heap timeline line format
- Each valid line in this section must be three comma-separated values:
  - <timestamp>,<heap-bytes>,<marker-flag>
- Examples:
  - `1000,12345678,true`
  - `2000,9876543,false`
  - `3000,12345.67,false` (floats allowed for both timestamp and heap-bytes)
- Interpretation:
  - timestamp — numeric value representing the time when this sample was taken (can be milliseconds, seconds, or any time unit)
  - heap-bytes — numeric value representing heap size in bytes at that sample
  - marker-flag — `true` or `false` (case-insensitive). A `true` value marks this sample as a GC marker and will be correlated with GC before/after blocks by timestamp.

3) Phase 2 — page dump (GC blocks)
- GC blocks are parsed by searching for header lines matching:
  - one or more dashes, then `before` or `after` then `GC <N> @ <timestamp>`, then one or more dashes
  - For example: `-------before GC 1 @ 1000 -------` or `---after GC 42 @ 5000--`
  - The timestamp should match the timestamp from phase1 where the GC marker occurred
- The parser collects non-empty lines after a header into that block's `content` until the next header.
- After headers and their content are collected, the loader pairs adjacent blocks if they are `before` followed immediately by `after` and have the same GC index number.

4) Page distribution lines inside a GC block
- Each non-empty line in a before/after block represents one page-type entry and has one of two forms:

  a) FixedBlock pages: lines that start with a numeric prefix:
     - Format: `<number>: <usage-string>`
     - Example: `16: + (40%) - +`
     - These are mapped to keys like `FixedBlockPage_16` internally.

  b) Named page groups: lines that start with an identifier:
     - Format: `<identifier>: <usage-string>`
     - Example: `nextFitPages: + - (30%) +`
     - Common identifiers in practice:
       - `nextFitPages`, `singleObjectPages`, `extraObjectPages`, or other custom names

- The usage-string contains tokens recognized by the parser:
  - `+` — full page (treated as 100%)
  - `-` — empty page (treated as 0%)
  - `(NN%)` — partial occupancy, where NN is an integer percentage (e.g., `(40%)` means 40%)
- The parser scans each usage-string and produces an array of usage objects for that page-type, preserving order.

5) How GC pairs are correlated with heap markers
- After parsing the GC pairs list, the loader correlates GC dumps with heap markers by matching their timestamps.
- Each GC dump header contains a timestamp (e.g., `before GC 1 @ 1000`) that should match a timestamp in the heap timeline where a marker was set to `true`.
- This timestamp-based correlation ensures accurate alignment between GC dumps and heap measurements.

6) Minimal valid template example
- Copy and paste the following sample and use it to test the viewer:

```text
phase1: heap use
1000,10000000,false
2000,10120000,false
3000,10250000,true
4000,10300000,false
5000,10200000,false
6000,10100000,true
7000,10050000,false

phase2: page dump
-------before GC 1 @ 3000 -------
nextFitPages: + (40%) - + (30%)
singleObjectPages: + + - (20%) +
16: + (60%) - + (40%)
-------after GC 1 @ 3000 -------
nextFitPages: + (35%) - +
singleObjectPages: + - - +
16: + + + (10%)

-------before GC 2 @ 6000 -------
nextFitPages: (90%) - + + +
singleObjectPages: + + + + +
16: (50%) - -
-------after GC 2 @ 6000 -------
nextFitPages: + + + +
singleObjectPages: + + + +
16: + + +
```

- Explanation for the template:
  - Phase1 contains seven samples at timestamps 1000-7000. Samples at timestamps 3000 and 6000 have `true` markers.
  - Phase2 contains two GC pairs (GC 1 @ 3000 and GC 2 @ 6000) with `before` and `after` sections.
  - The GC timestamps (3000 and 6000) match the timestamps in phase1 where markers were set to `true`.
  - Each page-type line lists page tokens that will be parsed into arrays of usage objects.

7) Tips for generating input files
- Ensure `phase1` and `phase2` markers are present and spelled similarly (parser uses case-insensitive matching).
- Place a `true` marker in phase1 at the same timestamp as the GC dump for proper correlation.
- Include timestamps in GC dump headers that match the corresponding heap timeline marker timestamps.
- Keep page usage tokens simple: only `+`, `-`, and `(NN%)` are parsed.
- Avoid embedding non-standard characters in block headers — the parser expects the `before`/`after` + `GC <number> @ <timestamp>` pattern.

8) Error cases
- Missing `phase1` or `phase2` or wrong order → the loader rejects the file with an "Invalid merged file format" message.
- Malformed heap lines (not three comma-separated values or non-numeric timestamp/heap bytes) → those lines are skipped silently.
- GC blocks without matching `before`/`after` pair with the same index → they won't appear as a paired GC in the UI.
- GC dumps with timestamps that don't match any heap marker → they won't be correlated with the heap timeline.
