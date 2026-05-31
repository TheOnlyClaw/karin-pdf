import { TIER_DPI, MIN_DPI, MAX_DPI, MAX_BINARY_ITERATIONS } from "./constants";
import type { GsTier } from "../types";

const TIERS: GsTier[] = ["prepress", "printer", "ebook", "screen"];

/**
 * Get the next more aggressive tier, or null if already at "screen".
 */
function nextTier(tier: GsTier): GsTier | null {
  const idx = TIERS.indexOf(tier);
  if (idx >= TIERS.length - 1) return null;
  return TIERS[idx + 1];
}

/**
 * Select a PDFSETTINGS tier and DPI based on the target / original ratio.
 */
export function selectTier(originalBytes: number, targetBytes: number): {
  tier: GsTier;
  dpi: { color: number; gray: number; mono: number };
} {
  const ratio = targetBytes / originalBytes;
  let tier: GsTier;
  if (ratio >= 0.8) tier = "prepress";
  else if (ratio >= 0.5) tier = "printer";
  else if (ratio >= 0.2) tier = "ebook";
  else tier = "screen";
  return { tier, dpi: { ...TIER_DPI[tier] } };
}

/**
 * Build GS command-line args for a given tier and DPI.
 */
export function buildGsArgs(
  inputFile: string,
  outputFile: string,
  tier: GsTier,
  dpi: { color: number; gray: number; mono: number }
): string[] {
  return [
    "-dNOPAUSE",
    "-dBATCH",
    "-dQUIET",
    "-sDEVICE=pdfwrite",
    "-dCompatibilityLevel=1.7",
    `-sOutputFile=${outputFile}`,
    `-dPDFSETTINGS=/${tier}`,
    "-dDownsampleColorImages=true",
    "-dDownsampleGrayImages=true",
    "-dDownsampleMonoImages=true",
    `-dColorImageResolution=${dpi.color}`,
    `-dGrayImageResolution=${dpi.gray}`,
    `-dMonoImageResolution=${dpi.mono}`,
    "-dAutoRotatePages=/None",
    "-dPrinted=false",
    "-dUseCIEColor",
    inputFile,
  ];
}

/**
 * Run a single GS compression pass and return the output size.
 * Returns null if it fails.
 */
function runGsPass(
  module: any,
  inputFile: string,
  outputFile: string,
  tier: GsTier,
  dpi: number
): number | null {
  const args = buildGsArgs(inputFile, outputFile, tier, {
    color: dpi,
    gray: dpi,
    mono: 300,
  });
  try {
    module.callMain(args);
    const data: Uint8Array = module.FS.readFile(outputFile, {
      encoding: "binary",
    });
    return data.byteLength;
  } catch {
    return null;
  }
}

/**
 * Binary search on DPI within a specific tier to find the highest DPI
 * that produces output under the target size.
 * Returns { dpi, size } or null if even at MIN_DPI the output is over target.
 */
function searchDIpInTier(
  module: any,
  inputFile: string,
  targetBytes: number,
  tier: GsTier
): { dpi: number; size: number } | null {
  let lo = MIN_DPI;
  let hi = MAX_DPI;
  let bestDPI = lo;
  let bestSize = Infinity;

  for (let i = 0; i < MAX_BINARY_ITERATIONS; i++) {
    const dpi = Math.round((lo + hi) / 2);
    const size = runGsPass(module, inputFile, `_out_${tier}_${i}.pdf`, tier, dpi);

    if (size === null) {
      hi = dpi - 1;
    } else if (size <= targetBytes) {
      bestDPI = dpi;
      bestSize = size;
      lo = dpi + 1;
    } else {
      hi = dpi - 1;
    }

    if (lo > hi) break;
  }

  if (bestSize <= targetBytes) {
    return { dpi: bestDPI, size: bestSize };
  }
  return null;
}

/**
 * Binary search on tier and DPI to find the highest-quality settings
 * that produce output under the target size.
 *
 * Starts with the given tier and binary searches on DPI.
 * If all DPIs in that tier overshoot, tries the next more aggressive tier.
 * Falls through tiers until "screen" (most aggressive).
 *
 * Returns args for the best-found settings.
 */
export function binarySearchDPI(
  module: any,
  inputFile: string,
  outputFile: string,
  targetBytes: number,
  startTier: GsTier = "screen"
): { args: string[]; resultBytes: number } {
  let currentTier: GsTier | null = startTier;

  while (currentTier) {
    const result = searchDIpInTier(module, inputFile, targetBytes, currentTier);
    if (result !== null) {
      const finalArgs = buildGsArgs(inputFile, outputFile, currentTier, {
        color: result.dpi,
        gray: result.dpi,
        mono: 300,
      });
      return { args: finalArgs, resultBytes: result.size };
    }
    // Not achievable at this tier — try the next more aggressive one
    currentTier = nextTier(currentTier);
  }

  // Absolute fallback: screen at minimum DPI
  const finalArgs = buildGsArgs(inputFile, outputFile, "screen", {
    color: MIN_DPI,
    gray: MIN_DPI,
    mono: 300,
  });
  return { args: finalArgs, resultBytes: Infinity };
}
