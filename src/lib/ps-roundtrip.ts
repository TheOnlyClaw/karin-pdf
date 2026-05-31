/**
 * Compress PDFs using a 3-pass pipeline within a single GS Module instance.
 *
 * Pass 1: pdfwrite on original PDF — deduplicates fonts, recompresses (single callMain)
 * Pass 2: ps2write on pass1 result — converts to PostScript, strips Quartz bloat (2nd callMain)
 * Pass 3: pdfwrite on PS — re-encodes with max compression (3rd callMain)
 *
 * This avoids the ENOSPC issue that occurs when pdfwrite processes PostScript
 * derived directly from raw Quartz PDFs with 100+ embedded font subsets.
 *
 * IMPORTANT: NEVER use -dQUIET flag — it crashes the WASM build with
 * "null function or function signature mismatch".
 */

/**
 * Build GS args for pass 1: PDF → PDF (recompress + font dedup)
 */
function buildRecompressArgs(inputFile: string, outputFile: string): string[] {
  return [
    "-dNOPAUSE",
    "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dEmbedAllFonts=false",
    "-dSubsetFonts=false",
    "-sOutputFile=" + outputFile,
    inputFile,
  ];
}

/**
 * Build GS args for pass 2: PDF → PostScript
 */
function buildPs2WriteArgs(inputFile: string, outputFile: string): string[] {
  return [
    "-dNOPAUSE",
    "-dBATCH",
    "-sDEVICE=ps2write",
    "-sOutputFile=" + outputFile,
    inputFile,
  ];
}

/**
 * Build GS args for pass 3: PostScript → PDF (max compression)
 */
function buildPs2PdfArgs(inputFile: string, outputFile: string): string[] {
  return [
    "-dNOPAUSE",
    "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dEmbedAllFonts=false",
    "-dSubsetFonts=false",
    "-sOutputFile=" + outputFile,
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
    // Clean slate — remove stale files
    try { module.FS.unlink(inputName); } catch { /* ok */ }
    try { module.FS.unlink(outputName); } catch { /* ok */ }

    // Write input
    module.FS.writeFile(inputName, inputBytes);

    // Run Ghostscript (no -dQUIET — crashes WASM build)
    module.callMain(args);

    // Read output
    return module.FS.readFile(outputName, { encoding: "binary" });
  } catch {
    return null;
  }
}

/**
 * Clean up MEMFS files.
 */
function cleanup(module: any, files: string[]) {
  for (const f of files) {
    try { module.FS.unlink(f); } catch { /* ok */ }
  }
}

/**
 * Compress a PDF using the 3-pass pipeline:
 *
 *   1. pdfwrite (recompress + font dedup)
 *   2. ps2write (PDF → PostScript — strips Quartz bloat)
 *   3. pdfwrite (PostScript → PDF — max compression)
 *
 * Works for Quartz PDFs with 100+ embedded font subsets.
 * All within a single GS Module instance, 3 callMain calls.
 */
export function compressWithPsRoundtrip(
  module: any,
  inputBytes: Uint8Array
): Uint8Array | null {
  // Pass 1: pdfwrite on original — deduplicate fonts, recompress
  const p1Args = buildRecompressArgs("input.pdf", "pass1.pdf");
  const p1Bytes = runPass(module, inputBytes, "input.pdf", "pass1.pdf", p1Args);
  if (!p1Bytes) return null;

  // Pass 2: ps2write on pass1 result — convert to PostScript
  const p2Args = buildPs2WriteArgs("pass1.pdf", "temp.ps");
  const psBytes = runPass(module, p1Bytes, "pass1.pdf", "temp.ps", p2Args);
  if (!psBytes) return null;

  // Pass 3: pdfwrite on PostScript — max compression
  const p3Args = buildPs2PdfArgs("temp.ps", "output.pdf");
  const pdfBytes = runPass(module, psBytes, "temp.ps", "output.pdf", p3Args);
  if (!pdfBytes) return null;

  cleanup(module, ["input.pdf", "pass1.pdf", "temp.ps", "output.pdf"]);
  return pdfBytes;
}
