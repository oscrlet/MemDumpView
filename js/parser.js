// parser.js - parsing helpers for GC dumps, page usages and small utilities

export function parseGCDumpBlocks(text) {
  const lines = text.split(/\r?\n/);
  let blocks = [],
    current = null;
  for (const line of lines) {
    const header = line.match(/-+(before|after) GC (\d+) @ ([\d.]+) -+/);
    if (header) {
      if (current) blocks.push(current);
      current = { 
        type: header[1], 
        idx: parseInt(header[2], 10), 
        timestamp: parseFloat(header[3]),
        content: [] 
      };
    } else if (current && line.trim().length) {
      current.content.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

export function pairBlocks(blocks) {
  let pairs = [];
  let i = 0;
  while (i < blocks.length) {
    if (
      blocks[i].type === "before" &&
      blocks[i + 1] &&
      blocks[i + 1].type === "after" &&
      blocks[i].idx === blocks[i + 1].idx
    ) {
      pairs.push({
        idx: blocks[i].idx,
        timestamp: blocks[i].timestamp,
        before: blocks[i],
        after: blocks[i + 1],
      });
      i += 2;
    } else i++;
  }
  return pairs;
}

export function parsePageDistribution(contentLines) {
  let dist = {};
  for (const line of contentLines) {
    let fb = line.match(/^(\d+):\s*(.*)$/);
    let pf = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (fb) {
      dist[`FixedBlockPage_${fb[1]}`] = parsePageUsages(
        fb[2],
        "FixedBlockPage",
        fb[1],
      );
    } else if (pf) {
      let name = pf[1];
      let kind = "Other";
      if (name === "nextFitPages") kind = "NextFitPage";
      else if (name === "singleObjectPages") kind = "SingleObjectPage";
      else if (name === "extraObjectPages") kind = "ExtraObjectPage";
      dist[name] = parsePageUsages(pf[2], kind, name);
    }
  }
  return dist;
}

export function parsePageUsages(data, kind, name) {
  const re = /\((\d+)%\)|\+|\-/g;
  let m;
  let out = [];
  while ((m = re.exec(data))) {
    if (m[1] !== undefined)
      out.push({ type: "partial", value: parseInt(m[1], 10), kind, name });
    else if (m[0] === "+") out.push({ type: "full", value: 100, kind, name });
    else if (m[0] === "-") out.push({ type: "empty", value: 0, kind, name });
  }
  return out;
}

export function kindOrder(k) {
  if (k.startsWith("FixedBlockPage_")) return 1 + parseInt(k.split("_")[1], 10);
  if (k === "nextFitPages") return 100000;
  if (k === "singleObjectPages") return 200000;
  if (k === "extraObjectPages") return 300000;
  return 9999999;
}

export function countTotalPages(dist) {
  let t = 0;
  for (const k in dist) t += dist[k].length;
  return t;
}

export function computeSummary(bef, aft) {
  function agg(d) {
    let pages = 0,
      sum = 0;
    for (const k in d) {
      for (const u of d[k]) {
        pages++;
        sum += u.value;
      }
    }
    return { pages, mean: pages ? sum / pages : 0 };
  }
  const b = agg(bef),
    a = agg(aft);
  let released = 0;
  const keys = new Set([...Object.keys(bef), ...Object.keys(aft)]);
  for (const k of keys) {
    const bc = bef[k] ? bef[k].length : 0;
    const ac = aft[k] ? aft[k].length : 0;
    if (ac < bc) released += bc - ac;
  }
  return {
    pagesBefore: b.pages,
    pagesAfter: a.pages,
    pagesReleased: released,
    occupancyBefore: b.mean,
    occupancyAfter: a.mean,
    deltaOccupancy: a.mean - b.mean,
  };
}

export function simulateCompaction(dist) {
  let totalPercent = 0;
  for (const k in dist) {
    for (const u of dist[k]) totalPercent += u.value;
  }
  if (totalPercent === 0) return { Compacted: [] };
  const fullPages = Math.floor(totalPercent / 100);
  const remainder = totalPercent - fullPages * 100;
  let arr = [];
  for (let i = 0; i < fullPages; i++)
    arr.push({
      type: "full",
      value: 100,
      kind: "CompactedPage",
      name: "compact",
    });
  if (remainder > 0)
    arr.push({
      type: "partial",
      value: Math.round(remainder * 100) / 100,
      kind: "CompactedPage",
      name: "compact",
    });
  return { Compacted: arr };
}
