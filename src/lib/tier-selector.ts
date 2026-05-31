import { TIER_DPI, MIN_DPI, MAX_DPI, MAX_BINARY_ITERATIONS } from "./constants";
import type { GsTier } from "../types";

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
 * Binary search on DPI to find the highest DPI that undershoots the target.
 * Returns the args array for the best-found settings.
 */
export function binarySearchDPI(
  module: any,
  inputFile: string,
  outputFile: string,
  targetBytes: number
): { args: string[]; resultBytes: number } {
  let lo = MIN_DPI;
  let hi = MAX_DPI;
  let bestDPI = lo;
  let bestBytes = Infinity;

  for (let i = 0; i < MAX_BINARY_ITERATIONS; i++) {
    // Write input fresh each iteration (in-MEMFS)
    // (Caller must ensure input file is present before calling this)
    const dpi = Math.round((lo + hi) / 2);
    const args = buildGsArgs(inputFile, `_out_${i}.pdf`, "screen", {
      color: dpi,
      gray: dpi,
      mono: 300,
    });

    try {
      module.callMain(args);
      const data: Uint8Array = module.FS.readFile(`_out_${i}.pdf`, {
        encoding: "binary",
      });
      const size = data.byteLength;

      if (size <= targetBytes) {
        // Under target — this is feasible, try higher DPI
        bestDPI = dpi;
        bestBytes = size;
        lo = dpi + 1;
      } else {
        // Over target — need lower DPI
        hi = dpi - 1;
      }
    } catch {
      hi = dpi - 1; // on error, try lower DPI
    }

    if (lo > hi) break;
  }

  const finalArgs = buildGsArgs(inputFile, outputFile, "screen", {
    color: bestDPI,
    gray: bestDPI,
    mono: 300,
  });
  return { args: finalArgs, resultBytes: bestBytes };
}
