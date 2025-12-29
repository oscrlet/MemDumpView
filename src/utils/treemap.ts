interface Node {
  size: number;
  [key: string]: any;
}

interface LayoutNode extends Node {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Helper function: calculate the worst aspect ratio of a row of rectangles
function worstAspectRatio(row: Node[], length: number) {
  const rowSum = row.reduce((sum, node) => sum + node.size, 0);
  if (rowSum === 0) return Infinity;

  const rowMax = Math.max(...row.map(n => n.size));
  const rowMin = Math.min(...row.map(n => n.size));
  const lengthSq = length * length;
  const rowSumSq = rowSum * rowSum;

  return Math.max((lengthSq * rowMax) / rowSumSq, rowSumSq / (lengthSq * rowMin));
}

// Core function: layout for child nodes
function layoutRow(row: Node[], x: number, y: number, width: number, height: number): LayoutNode[] {
  const rowSum = row.reduce((sum, node) => sum + node.size, 0);
  if (rowSum === 0) return [];

  let currentX = x;
  let currentY = y;

  if (width > height) { // Horizontal arrangement
    // Row height calculation (intermediate, not used directly in map)
    (height * rowSum) / (width * height) * height;

    return row.map(node => {
      const nodeWidth = (node.size / rowSum) * width;
      const result = { ...node, x: currentX, y, width: nodeWidth, height };
      currentX += nodeWidth;
      return result;
    });
  } else { // Vertical arrangement
    // Row width calculation (intermediate, not used directly in map)
    (width * rowSum) / (width * height) * width;

    return row.map(node => {
      const nodeHeight = (node.size / rowSum) * height;
      const result = { ...node, x, y: currentY, width, height: nodeHeight };
      currentY += nodeHeight;
      return result;
    });
  }
}

// Main function: Squarify algorithm
export function squarify(nodes: Node[], x: number, y: number, width: number, height: number): LayoutNode[] {
  if (nodes.length === 0) return [];

  let currentRow: Node[] = [];
  let remainingNodes = [...nodes];
  const results: LayoutNode[] = [];

  let currentX = x;
  let currentY = y;
  let remainingWidth = width;
  let remainingHeight = height;

  while (remainingNodes.length > 0) {
    const node = remainingNodes[0];
    const potentialRow = [...currentRow, node];
    const shorterEdge = Math.min(remainingWidth, remainingHeight);

    if (
      currentRow.length === 0 ||
      worstAspectRatio(currentRow, shorterEdge) >= worstAspectRatio(potentialRow as Node[], shorterEdge)
    ) {
      currentRow.push(remainingNodes.shift()!);
    } else {
      const rowLayout = layoutRow(currentRow, currentX, currentY, remainingWidth, remainingHeight);
      results.push(...rowLayout);

      const rowSum = currentRow.reduce((sum, n) => sum + n.size, 0);
      // totalArea removed (unused)
      const rowArea = (rowSum / (nodes.reduce((s, n) => s + n.size, 0) || 1)) * (width * height);


      if (remainingWidth > remainingHeight) {
        const rowHeight = rowArea / remainingWidth;
        currentY += rowHeight;
        remainingHeight -= rowHeight;
      } else {
        const rowWidth = rowArea / remainingHeight;
        currentX += rowWidth;
        remainingWidth -= rowWidth;
      }
      currentRow = [];
    }
  }

  if (currentRow.length > 0) {
    results.push(...layoutRow(currentRow, currentX, currentY, remainingWidth, remainingHeight));
  }

  return results;
}
