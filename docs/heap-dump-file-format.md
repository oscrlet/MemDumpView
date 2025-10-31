# Heap Dump File Data Structure & Template Sample

This document describes the expected format of the heap dump file the viewer accepts. It shows the high-level structure, field meanings and provides a copy-pasteable sample template you can use to generate or validate input files.

Important notes
- The loader looks for two phase markers (case-insensitive):
  - `phase1: heap use`
  - `phase2: page dump`
  - Both must exist and `phase2` must come after `phase1`.
- Lines in the heap phase and page dump phase are parsed with simple, tolerant regexes — see examples below.
- Sample indices in the heap timeline start at 1 (the first data line after `phase1` is sample 1).
- Heap bytes are parsed with parseFloat (integers or decimal numbers allowed).
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
  - <sample>,<heap-bytes>,<marker-flag>
- Examples:
  - `1,12345678,true`
  - `2,9876543,false`
  - `3,12345.67,false` (floats allowed)
- Interpretation:
  - sample — numeric sample index (integer, starting from 1)
  - heap-bytes — numeric value representing heap size in bytes at that sample
  - marker-flag — `true` or `false` (case-insensitive). A `true` value marks this sample as a GC marker and will be correlated with GC before/after blocks.

3) Phase 2 — page dump (GC blocks)
- GC blocks are parsed by searching for header lines matching:
  - one or more dashes, then `before` or `after` then `GC <N>`, then one or more dashes
  - For example: `-------before GC 1 -------` or `---after GC 42--`
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
- After parsing the GC pairs list, the loader sorts GC indices and correlates the Nth sorted GC index with the Nth heap marker sample encountered in the heap timeline (if available).
- This is why preserving `true` markers in the heap timeline where the GC dump is taken is important.

6) Minimal valid template example
- Copy and paste the following sample and use it to test the viewer:

```text
phase1: heap use
1,10000000,false
2,10120000,false
3,10250000,true
4,10300000,false
5,10200000,false
6,10100000,true
7,10050000,false

phase2: page dump
-------before GC 1 -------
nextFitPages: + (40%) - + (30%)
singleObjectPages: + + - (20%) +
16: + (60%) - + (40%)
-------after GC 1 -------
nextFitPages: + (35%) - +
singleObjectPages: + - - +
16: + + + (10%)

-------before GC 2 -------
nextFitPages: (90%) - + + +
singleObjectPages: + + + + +
16: (50%) - -
-------after GC 2 -------
nextFitPages: + + + +
singleObjectPages: + + + +
16: + + +
```

- Explanation for the template:
  - Phase1 contains seven samples (sample indices 1..7). Samples 3 and 6 have `true` markers.
  - Phase2 contains two GC pairs (GC 1 and GC 2) with `before` and `after` sections.
  - Each page-type line lists page tokens that will be parsed into arrays of usage objects.

7) Tips for generating input files
- Ensure `phase1` and `phase2` markers are present and spelled similarly (parser uses case-insensitive matching).
- Place a `true` marker in phase1 close to the time the page dump for its corresponding GC was recorded; this improves the correlation in the "GC Correlation" panel.
- Keep page usage tokens simple: only `+`, `-`, and `(NN%)` are parsed.
- Avoid embedding non-standard characters in block headers — the parser expects the `before`/`after` + `GC <number>` pattern.

8) Error cases
- Missing `phase1` or `phase2` or wrong order → the loader rejects the file with an "Invalid merged file format" message.
- Malformed heap lines (not two comma-separated values or non-numeric heap bytes) → those lines are skipped silently.
- GC blocks without matching `before`/`after` pair with the same index → they won't appear as a paired GC in the UI.
