/**
 * Simple hash function for strings (DJB2)
 */
export const stringHash = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
};

/**
 * Generate a consistent hue from a string using the golden ratio to spread
 * values evenly across the 360-degree color wheel.
 */
export const stringToHue = (str: string): number => {
    const hash = stringHash(str);
    const goldenRatioConjugate = 0.618033988749895;
    return Math.floor((hash * goldenRatioConjugate % 1) * 360);
};

/**
 * Generate a consistent HSL color from a string
 * Dual mapping: Occupancy affects both Saturation and Lightness for better distinction.
 */
export const stringToHsl = (str: string, baseSaturation = 75, baseLightness = 50, occupancy = 1): string => {
    if (str === 'Overflow') {
        const l = 70 + (1 - occupancy) * 25;
        return `hsl(0, 0%, ${l}%)`;
    }

    const hue = stringToHue(str);

    // Map occupancy (0-1) to Saturation and Lightness
    // 1.0 ->  Base Lightness (e.g. 50%)
    // 0.0 ->  High Lightness (e.g. 95% - nearly white)
    const saturation = baseSaturation;
    const lightness = baseLightness + (1 - occupancy) * (98 - baseLightness);

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

/**
 * Convert Hex to RGBA
 */
export const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * Convert HSL to Hex (simplified for basic use cases)
 * Note: For production use, consider a more complete color manipulation library
 */
export const hslToHex = (h: number, s: number, l: number): string => {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
};
