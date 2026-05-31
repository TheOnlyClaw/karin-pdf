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
 * Run a single GS compression pass.
 * Writes inputFile to MEMFS, calls callMain, reads outputFile.
 * Returns the output bytes, or null if it fails.
 */
function runSinglePass(
  module: any,
  inputBytes: Uint8Array,
  tier: GsTier,
  dpi: { color: number; gray: number; mono: number },
  outputFilename: string
): Uint8Array | null {
  try {
    // Write input fresh — ensures clean state for each call
    try { module.FS.unlink(outputFilename); } catch { /* doesn't exist yet */ }
    module.FS.writeFile("input.pdf", inputBytes);
    const args = buildGsArgs("input.pdf", outputFilename, tier, dpi);
    module.callMain(args);
    return module.FS.readFile(outputFilename, { encoding: "binary" });
  } catch {
    return null;
  }
}

/**
 * Clean up MEMFS files after compression.
 */
function cleanupMemfs(module: any, extraFiles: string[] = []) {
  const files = ["input.pdf", "output.pdf", ...extraFiles];
  for (const f of files) {
    try { module.FS.unlink(f); } catch { /* ok */ }
  }
}

/**
 * Compress a PDF by stepping through tiers from least to most aggressive.
 *
 * Strategy:
 * 1. Start with the tier selected by `selectTier` (based on target/original ratio)
 * 2. Run one callMain — if result ≤ target, done
 * 3. If over target, try the next more aggressive tier at its default DPI
 * 4. Repeat until we hit target or reach "screen"
 *
 * This avoids repeated `callMain` calls that the WASM module can't handle.
 * DPI binary-search is skipped because for most PDFs (especially text-based
 * assignments), DPI downsampling has minimal effect on file size — the
 * PDFSETTINGS tier is what actually changes the output.
 */
export function compressBySteppingTiers(
  module: any,
  inputBytes: Uint8Array,
  targetBytes: number
): Uint8Array {
  const originalBytes = inputBytes.byteLength;
  const { tier: initialTier } = selectTier(originalBytes, targetBytes);

  const TIERS: GsTier[] = ["prepress", "printer", "ebook", "screen"];
  let startIdx = TIERS.indexOf(initialTier);

  // Try each tier from the selected one upward (more aggressive)
  for (let idx = startIdx; idx < TIERS.length; idx++) {
    const tier = TIERS[idx];
    const defaultDpi = TIER_DPI[tier];
    const result = runSinglePass(module, inputBytes, tier, defaultDpi, "output.pdf");

    if (result && result.byteLength <= targetBytes) {
      cleanupMemfs(module);
      return result;
    }

    // If this tier got us close (within 1.5× target), try reducing DPI within it
    if (result && result.byteLength <= targetBytes * 1.5 && tier !== "prepress") {
      // One-shot DPI adjustment: scale DPI proportionally
      const overshootRatio = result.byteLength / targetBytes;
      const adjustedDpi = Math.max(
        MIN_DPI,
        Math.round(defaultDpi.color / overshootRatio)
      );
      const adjResult = runSinglePass(
        module,
        inputBytes,
        tier,
        { color: adjustedDpi, gray: adjustedDpi, mono: 300 },
        "output.pdf"
      );
      if (adjResult && adjResult.byteLength <= targetBytes) {
        cleanupMemfs(module);
        return adjResult;
      }
    }
  }

  // Fallback: screen at minimum DPI
  const fallback = runSinglePass(
    module,
    inputBytes,
    "screen",
    { color: MIN_DPI, gray: MIN_DPI, mono: 300 },
    "output.pdf"
  );
  cleanupMemfs(module);
  return fallback || inputBytes; // last resort: return original
}
