/**
 * LTTB (Largest Triangle Three Buckets) Downsampling Algorithm
 * Reduces the number of data points while preserving visual shape
 */

/**
 * Downsample data using LTTB algorithm
 * @param {number[]} xData - Array of x values
 * @param {number[]} yData - Array of y values
 * @param {number} threshold - Target number of points
 * @param {Set<number>} forceInclude - Set of indices that must be included
 * @returns {{x: number[], y: number[]}} Downsampled data
 */
export function downsampleLTTB(xData, yData, threshold, forceInclude = new Set()) {
  if (!xData || !yData || xData.length !== yData.length) {
    return { x: [], y: [] };
  }

  const dataLength = xData.length;

  // If we have fewer points than threshold, return all data
  if (dataLength <= threshold || threshold <= 2) {
    return { x: [...xData], y: [...yData] };
  }

  // Convert forceInclude to sorted array for efficient processing
  const forcedIndices = Array.from(forceInclude).sort((a, b) => a - b);
  
  // Output arrays
  const sampledX = [];
  const sampledY = [];
  const sampledIndices = new Set();

  // Always include first point
  sampledX.push(xData[0]);
  sampledY.push(yData[0]);
  sampledIndices.add(0);

  // Calculate bucket size (excluding first and last points)
  const bucketSize = (dataLength - 2) / (threshold - 2);

  let a = 0; // Initially the first point

  for (let i = 0; i < threshold - 2; i++) {
    // Calculate bucket range
    const bucketStart = Math.floor(i * bucketSize) + 1;
    const bucketEnd = Math.floor((i + 1) * bucketSize) + 1;

    // Calculate average point for next bucket (look ahead)
    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextBucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, dataLength);
    
    let avgX = 0;
    let avgY = 0;
    let avgRangeLength = nextBucketEnd - nextBucketStart;

    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgX += xData[j];
      avgY += yData[j];
    }
    avgX /= avgRangeLength;
    avgY /= avgRangeLength;

    // Check if there are any forced indices in this bucket
    const forcedInBucket = forcedIndices.filter(idx => idx >= bucketStart && idx < bucketEnd);
    
    if (forcedInBucket.length > 0) {
      // Include all forced points in this bucket
      for (const idx of forcedInBucket) {
        if (!sampledIndices.has(idx)) {
          sampledX.push(xData[idx]);
          sampledY.push(yData[idx]);
          sampledIndices.add(idx);
          a = idx; // Update reference point
        }
      }
    } else {
      // Find point in bucket with largest triangle area
      let maxArea = -1;
      let maxIdx = bucketStart;

      const pointAX = xData[a];
      const pointAY = yData[a];

      for (let j = bucketStart; j < bucketEnd; j++) {
        // Calculate triangle area
        const area = Math.abs(
          (pointAX - avgX) * (yData[j] - pointAY) -
          (pointAX - xData[j]) * (avgY - pointAY)
        );

        if (area > maxArea) {
          maxArea = area;
          maxIdx = j;
        }
      }

      // Add the point with largest area
      if (!sampledIndices.has(maxIdx)) {
        sampledX.push(xData[maxIdx]);
        sampledY.push(yData[maxIdx]);
        sampledIndices.add(maxIdx);
        a = maxIdx;
      }
    }
  }

  // Always include last point
  const lastIdx = dataLength - 1;
  if (!sampledIndices.has(lastIdx)) {
    sampledX.push(xData[lastIdx]);
    sampledY.push(yData[lastIdx]);
    sampledIndices.add(lastIdx);
  }

  return { x: sampledX, y: sampledY };
}

/**
 * Downsample data using simple bucket min/max algorithm
 * @param {number[]} xData - Array of x values
 * @param {number[]} yData - Array of y values
 * @param {number} threshold - Target number of points
 * @param {Set<number>} forceInclude - Set of indices that must be included
 * @returns {{x: number[], y: number[]}} Downsampled data
 */
export function downsampleBucket(xData, yData, threshold, forceInclude = new Set()) {
  if (!xData || !yData || xData.length !== yData.length) {
    return { x: [], y: [] };
  }

  const dataLength = xData.length;

  // If we have fewer points than threshold, return all data
  if (dataLength <= threshold || threshold <= 2) {
    return { x: [...xData], y: [...yData] };
  }

  const sampledX = [];
  const sampledY = [];
  const sampledIndices = new Set();

  // Always include first point
  sampledX.push(xData[0]);
  sampledY.push(yData[0]);
  sampledIndices.add(0);

  // Calculate bucket size
  const bucketSize = (dataLength - 2) / (threshold - 2);

  for (let i = 0; i < threshold - 2; i++) {
    const bucketStart = Math.floor(i * bucketSize) + 1;
    const bucketEnd = Math.floor((i + 1) * bucketSize) + 1;

    // Check for forced points in this bucket
    const forcedInBucket = Array.from(forceInclude)
      .filter(idx => idx >= bucketStart && idx < bucketEnd)
      .sort((a, b) => a - b);

    if (forcedInBucket.length > 0) {
      // Include all forced points
      for (const idx of forcedInBucket) {
        if (!sampledIndices.has(idx)) {
          sampledX.push(xData[idx]);
          sampledY.push(yData[idx]);
          sampledIndices.add(idx);
        }
      }
    } else {
      // Find min and max in bucket
      let minY = Infinity;
      let maxY = -Infinity;
      let minIdx = bucketStart;
      let maxIdx = bucketStart;

      for (let j = bucketStart; j < bucketEnd; j++) {
        if (yData[j] < minY) {
          minY = yData[j];
          minIdx = j;
        }
        if (yData[j] > maxY) {
          maxY = yData[j];
          maxIdx = j;
        }
      }

      // Add min and max points
      if (minIdx !== maxIdx) {
        // Add in x-order
        const first = minIdx < maxIdx ? minIdx : maxIdx;
        const second = minIdx < maxIdx ? maxIdx : minIdx;
        
        if (!sampledIndices.has(first)) {
          sampledX.push(xData[first]);
          sampledY.push(yData[first]);
          sampledIndices.add(first);
        }
        if (!sampledIndices.has(second)) {
          sampledX.push(xData[second]);
          sampledY.push(yData[second]);
          sampledIndices.add(second);
        }
      } else {
        // Min and max are the same point
        if (!sampledIndices.has(minIdx)) {
          sampledX.push(xData[minIdx]);
          sampledY.push(yData[minIdx]);
          sampledIndices.add(minIdx);
        }
      }
    }
  }

  // Always include last point
  const lastIdx = dataLength - 1;
  if (!sampledIndices.has(lastIdx)) {
    sampledX.push(xData[lastIdx]);
    sampledY.push(yData[lastIdx]);
    sampledIndices.add(lastIdx);
  }

  return { x: sampledX, y: sampledY };
}
