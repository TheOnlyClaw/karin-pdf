/** Maximum accepted file size — 200 MB */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

/** Minimum slider value in bytes */
export const MIN_TARGET_BYTES = 0.1 * 1024 * 1024;

/** Slide step in bytes */
export const TARGET_STEP_BYTES = 0.1 * 1024 * 1024;

/** DPI settings per tier */
export const TIER_DPI = {
  prepress: { color: 300, gray: 300, mono: 300 },
  printer:  { color: 300, gray: 300, mono: 300 },
  ebook:    { color: 150, gray: 150, mono: 300 },
  screen:   { color: 72,  gray: 72,  mono: 300 },
} as const;

/** Minimum DPI for binary search fallback */
export const MIN_DPI = 36;

/** Max DPI for binary search */
export const MAX_DPI = 300;

/** Max binary search iterations */
export const MAX_BINARY_ITERATIONS = 7;
