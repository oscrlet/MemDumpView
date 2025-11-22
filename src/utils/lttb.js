/**
 * Largest-Triangle-Three-Buckets (LTTB) downsampling algorithm
 * Reduces data points while preserving visual shape
 */

export function downsampleLTTB(data, threshold) {
  if (threshold >= data.length || threshold <= 2) {
    return data;
  }

  const sampled = [];
  const bucketSize = (data.length - 2) / (threshold - 2);

  // Always add the first point
  sampled.push(data[0]);

  let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    // Calculate point average for next bucket
    let avgX = 0;
    let avgY = 0;
    const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const avgRangeEnd = Math.floor((i + 2) * bucketSize) + 1;
    const avgRangeLength = avgRangeEnd - avgRangeStart;

    for (let j = avgRangeStart; j < avgRangeEnd; j++) {
      avgX += data[j].x;
      avgY += data[j].y;
    }
    avgX /= avgRangeLength;
    avgY /= avgRangeLength;

    // Get the range for this bucket
    const rangeOffs = Math.floor(i * bucketSize) + 1;
    const rangeTo = Math.floor((i + 1) * bucketSize) + 1;

    // Point a
    const pointAX = data[a].x;
    const pointAY = data[a].y;

    let maxArea = -1;
    let maxAreaPoint = null;

    for (let j = rangeOffs; j < rangeTo; j++) {
      // Calculate triangle area
      const area = Math.abs(
        (pointAX - avgX) * (data[j].y - pointAY) -
        (pointAX - data[j].x) * (avgY - pointAY)
      ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = j;
      }
    }

    sampled.push(data[maxAreaPoint]);
    a = maxAreaPoint;
  }

  // Always add the last point
  sampled.push(data[data.length - 1]);

  return sampled;
}
