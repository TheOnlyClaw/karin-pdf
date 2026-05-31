/**
 * Compress a PDF using the PS round-trip approach:
 *   PDF → PostScript → PDF
 *
 * This strips Quartz/iOS bloat (duplicate font subsets, verbose structure)
 * much more effectively than pdfwrite alone.
 *
 * The round-trip requires exactly 2 callMain calls, each with clean MEMFS.
 * No DPI binary search needed — the PS→PDF step uses /screen for max compression.
 */

/**
 * Build GS args for the first pass: PDF → PostScript
 */
function buildPsWriteArgs(inputFile: string, outputFile: string): string[] {
  return [
    "-dNOPAUSE",
    "-dBATCH",
    "-dQUIET",
    "-sDEVICE=ps2write",
    "-dCompressFonts=true",
    `-sOutputFile=${outputFile}`,
    inputFile,
  ];
}

/**
 * Build GS args for the second pass: PostScript → PDF
 */
function buildPdfWriteArgs(inputFile: string, outputFile: string): string[] {
  return [
    "-dNOPAUSE",
    "-dBATCH",
    "-dQUIET",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dCompressFonts=true",
    "-dOptimize=true",
    "-dEmbedAllFonts=false",
    "-dSubsetFonts=false",
    `-sOutputFile=${outputFile}`,
    inputFile,
  ];
}

/**
 * Run a single GS callMain pass with clean MEMFS state.
 * Writes input to MEMFS, calls callMain, reads and returns output.
 * Returns null on failure.
 */
function runPass(
  module: any,
  inputBytes: Uint8Array,
  inputName: string,
  outputName: string,
  args: string[]
): Uint8Array | null {
  try {
    // Clean slate — remove any stale files
    try { module.FS.unlink(inputName); } catch { /* ok */ }
    try { module.FS.unlink(outputName); } catch { /* ok */ }

    // Write input
    module.FS.writeFile(inputName, inputBytes);

    // Run Ghostscript
    module.callMain(args);

    // Read output
    return module.FS.readFile(outputName, { encoding: "binary" });
  } catch {
    return null;
  }
}

/**
 * Clean up MEMFS after compression.
 */
function cleanup(module: any, files: string[]) {
  for (const f of files) {
    try { module.FS.unlink(f); } catch { /* ok */ }
  }
}

/**
 * Compress a PDF using the PS round-trip technique.
 *
 * Step 1: PDF → PostScript (strips Quartz bloat, deduplicates fonts)
 * Step 2: PostScript → PDF (re-encodes efficiently with max compression)
 *
 * Each step uses exactly 1 callMain. Total: 2 callMain calls.
 */
export function compressWithPsRoundtrip(
  module: any,
  inputBytes: Uint8Array
): Uint8Array | null {
  // Step 1: PDF → PostScript
  const psArgs = buildPsWriteArgs("input.pdf", "temp.ps");
  const psBytes = runPass(module, inputBytes, "input.pdf", "temp.ps", psArgs);
  if (!psBytes) return null;

  // Step 2: PostScript → PDF
  const pdfArgs = buildPdfWriteArgs("temp.ps", "output.pdf");
  const pdfBytes = runPass(module, psBytes, "temp.ps", "output.pdf", pdfArgs);
  if (!pdfBytes) return null;

  cleanup(module, ["input.pdf", "temp.ps", "output.pdf"]);
  return pdfBytes;
}
