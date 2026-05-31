/**
 * Compress PDFs using a 3-pass pipeline within a single GS Module instance.
 *
 * Pass 1: pdfwrite with /screen — deduplicates fonts (needed for ps2write compatibility)
 * Pass 2: ps2write — converts to PostScript, strips Quartz font bloat
 * Pass 3: pdfwrite with target-appropriate tier — produces size close to user's target
 *
 * IMPORTANT: Never use -dQUIET flag — crashes WASM build.
 * Never exceed 3 callMain calls — memory corruption after that.
 */

import type { GsTier } from "../types";
import { TIER_DPI } from "./constants";

/**
 * Select the tier for pass 3 based on the user's target size.
 * Same logic as the original selectTier (ratio-based).
 */
function selectPass3Tier(originalBytes: number, targetBytes: number): GsTier {
  const ratio = targetBytes / originalBytes;
  if (ratio >= 0.8) return "prepress";
  if (ratio >= 0.5) return "printer";
  if (ratio >= 0.2) return "ebook";
  return "screen";
}

/**
 * Build GS args for pass 1: PDF → PDF (font deduplication).
 * Must use /screen to produce output ps2write can handle.
 */
function buildRecompressArgs(inputFile: string, outputFile: string): string[] {
  return [
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dEmbedAllFonts=false", "-dSubsetFonts=false",
    "-sOutputFile=" + outputFile,
    inputFile,
  ];
}

/**
 * Build GS args for pass 2: PDF → PostScript.
 */
function buildPs2WriteArgs(inputFile: string, outputFile: string): string[] {
  return [
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=ps2write",
    "-sOutputFile=" + outputFile,
    inputFile,
  ];
}

/**
 * Build GS args for pass 3: PostScript → PDF with user's tier.
 * Keeps fonts embedded for readability unless target requires aggressive compression.
 */
function buildFinalArgs(
  inputFile: string,
  outputFile: string,
  tier: GsTier,
  targetBytes: number,
  originalBytes: number
): string[] {
  const args = [
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    `-dPDFSETTINGS=/${tier}`,
  ];

  // Only strip fonts for very aggressive targets (< 10% of original)
  const ratio = targetBytes / originalBytes;
  if (ratio < 0.1) {
    args.push("-dEmbedAllFonts=false", "-dSubsetFonts=false");
  }

  // Use DPI from tier settings
  const dpi = TIER_DPI[tier];
  args.push(
    "-dDownsampleColorImages=true",
    "-dDownsampleGrayImages=true",
    `-dColorImageResolution=${dpi.color}`,
    `-dGrayImageResolution=${dpi.gray}`,
    `-dMonoImageResolution=${dpi.mono}`,
  );

  args.push("-sOutputFile=" + outputFile, inputFile);
  return args;
}

/**
 * Run a single GS callMain pass with clean MEMFS state.
 */
function runPass(
  module: any,
  inputBytes: Uint8Array,
  inputName: string,
  outputName: string,
  args: string[]
): Uint8Array | null {
  try {
    try { module.FS.unlink(inputName); } catch {}
    try { module.FS.unlink(outputName); } catch {}
    module.FS.writeFile(inputName, inputBytes);
    module.callMain(args);
    return module.FS.readFile(outputName, { encoding: "binary" });
  } catch {
    return null;
  }
}

/**
 * Cleanup MEMFS files.
 */
function cleanup(module: any, files: string[]) {
  for (const f of files) {
    try { module.FS.unlink(f); } catch {}
  }
}

/**
 * Compress a PDF using the 3-pass pipeline.
 *
 * Pass 1: pdfwrite (font dedup) — always /screen
 * Pass 2: ps2write — converts to PostScript
 * Pass 3: pdfwrite with tier selected by target/original ratio
 *
 * Respects the user's target: picks a tier that produces output
 * close to their desired size while preserving quality.
 */
export function compressWithPsRoundtrip(
  module: any,
  inputBytes: Uint8Array,
  targetBytes: number
): Uint8Array | null {
  const originalBytes = inputBytes.byteLength;
  const pass3Tier = selectPass3Tier(originalBytes, targetBytes);

  // Pass 1: pdfwrite font dedup (always /screen for compatibility)
  const p1Args = buildRecompressArgs("input.pdf", "pass1.pdf");
  const p1Bytes = runPass(module, inputBytes, "input.pdf", "pass1.pdf", p1Args);
  if (!p1Bytes) return null;

  // Pass 2: ps2write
  const p2Args = buildPs2WriteArgs("pass1.pdf", "temp.ps");
  const psBytes = runPass(module, p1Bytes, "pass1.pdf", "temp.ps", p2Args);
  if (!psBytes) return null;

  // Pass 3: pdfwrite with target-appropriate tier
  const p3Args = buildFinalArgs("temp.ps", "output.pdf", pass3Tier, targetBytes, originalBytes);
  const pdfBytes = runPass(module, psBytes, "temp.ps", "output.pdf", p3Args);
  if (!pdfBytes) return null;

  cleanup(module, ["input.pdf", "pass1.pdf", "temp.ps", "output.pdf"]);
  return pdfBytes;
}
