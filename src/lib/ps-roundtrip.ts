/**
 * Robust multi-pass PDF compression using Ghostscript WASM.
 *
 * Core strategy:
 *   Attempt 1: 3-pass PS round-trip (normalize → ps2write → final pdfwrite)
 *   Attempt 2: 2-pass (ps2write from original → final pdfwrite)
 *   Attempt 3: Single-pass pdfwrite with target tier
 *   Attempt 4: Single-pass pdfwrite /screen (last resort)
 *
 * Each attempt is fully self-contained: MEMFS is scrubbed before and after,
 * stderr is captured for diagnostics, and every error is recorded so the
 * user sees a meaningful message instead of a generic fail.
 *
 * Stability rules:
 *   - Fonts are NEVER stripped in intermediate passes (causes ps2write corruption)
 *   - `-dQUIET` is NEVER used (crashes WASM build)
 *   - Every callMain is isolated with fresh MEMFS state
 *   - The error message tells you WHICH pass failed and WHY
 */

import type { GsTier } from "../types";
import { TIER_DPI } from "./constants";

// ── Formatting ──

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Tier selection (same ratio-based logic) ──

function selectTier(ratio: number): GsTier {
  if (ratio >= 0.8) return "prepress";
  if (ratio >= 0.5) return "printer";
  if (ratio >= 0.2) return "ebook";
  return "screen";
}

// ── Arg builders ──

/** Pass 1: normalize PDF structure, deduplicate resources */
function buildPass1Args(input: string, output: string): string[] {
  return [
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dPDFSETTINGS=/screen",
    "-dEmbedAllFonts=true",
    "-dSubsetFonts=true",
    "-dDetectDuplicateImages=true",
    "-sOutputFile=" + output,
    input,
  ];
}

/** Pass 2: PDF → PostScript (strips Quartz font bloat) */
function buildPass2Args(input: string, output: string): string[] {
  return [
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=ps2write",
    "-sOutputFile=" + output,
    input,
  ];
}

/** Pass 3: PostScript → PDF at target tier */
function buildPass3Args(input: string, output: string, tier: GsTier): string[] {
  const dpi = TIER_DPI[tier];
  return [
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    `-dPDFSETTINGS=/${tier}`,
    "-dEmbedAllFonts=true",
    "-dSubsetFonts=true",
    "-dDetectDuplicateImages=true",
    "-dDownsampleColorImages=true",
    "-dDownsampleGrayImages=true",
    "-dDownsampleMonoImages=true",
    `-dColorImageResolution=${dpi.color}`,
    `-dGrayImageResolution=${dpi.gray}`,
    `-dMonoImageResolution=${dpi.mono}`,
    "-sOutputFile=" + output,
    input,
  ];
}

/** Single-pass: pdfwrite at target tier (simpler fallback) */
function buildDirectArgs(
  input: string,
  output: string,
  tier: GsTier,
  ratio: number,
): string[] {
  const dpi = TIER_DPI[tier];
  const args = [
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=pdfwrite",
    `-dPDFSETTINGS=/${tier}`,
    "-dEmbedAllFonts=true",
    "-dSubsetFonts=true",
    "-dDetectDuplicateImages=true",
    "-dDownsampleColorImages=true",
    "-dDownsampleGrayImages=true",
    "-dDownsampleMonoImages=true",
    `-dColorImageResolution=${dpi.color}`,
    `-dGrayImageResolution=${dpi.gray}`,
    `-dMonoImageResolution=${dpi.mono}`,
    "-sOutputFile=" + output,
    input,
  ];

  // Only strip fonts for extremely aggressive targets (< 10 %)
  if (ratio < 0.1) {
    // Replace embed/subset lines
    const embedIdx = args.indexOf("-dEmbedAllFonts=true");
    if (embedIdx !== -1) args[embedIdx] = "-dEmbedAllFonts=false";
    const subIdx = args.indexOf("-dSubsetFonts=true");
    if (subIdx !== -1) args[subIdx] = "-dSubsetFonts=false";
  }

  return args;
}

// ── MEMFS management ──

/** Nuke every file in MEMFS root. Safe to call before every pass. */
function nukeMemfs(module: any): void {
  try {
    const seen = new Set<string>();
    const entries: string[] = module.FS.readdir("/");
    for (const e of entries) {
      if (e === "." || e === ".." || seen.has(e)) continue;
      seen.add(e);
      try { module.FS.unlink("/" + e); } catch { /* dir or busy */ }
    }
  } catch {
    // readdir may not exist on stripped builds — fallback to silence
  }
}

// ── Single-pass runner with stderr capture ──

interface RunResult {
  bytes: Uint8Array | null;
  /**
   * Human-readable error, null on success.
   * Contains the name of the failing pass + GS warning/error context.
   */
  error: string | null;
  /** All stderr lines (including ICC warnings) for debugging */
  warnings: string[];
}

function runPass(
  module: any,
  inputBytes: Uint8Array,
  inputName: string,
  outputName: string,
  args: string[],
  label: string,
): RunResult {
  // ── Hook stderr ──
  const stderr: string[] = [];
  const origPrintErr = module.printErr;
  module.printErr = (msg: string) => {
    stderr.push(msg);
  };

  try {
    // ── Clean MEMFS ──
    nukeMemfs(module);

    // ── Write input ──
    module.FS.writeFile("/" + inputName, inputBytes);

    // ── Run GS ──
    module.callMain(args);

    // ── Read output ──
    const bytes = module.FS.readFile("/" + outputName, { encoding: "binary" });
    if (!bytes || bytes.byteLength === 0) {
      return { bytes: null, error: `${label}: output file is empty`, warnings: stderr };
    }

    // ── Check for critical errors in stderr ──
    const critical = stderr.filter(
      (s) =>
        /[Ee]rror/i.test(s) &&
        !/Invalid ICC/.test(s) &&             // Harmless
        !/warning.*error/i.test(s) &&          // "warning: error handler..." etc
        !/No alternate space/.test(s)          // Harmless ICC
    );
    if (critical.length > 0) {
      // Non-fatal: some errors are just warnings from the PDF, not GS failure
      // Only treat "Error: /undefined" and segfaults as real failures
      const fatal = critical.filter(
        (s) => /Segmentation|Fatal|undefined in /.test(s)
      );
      if (fatal.length > 0) {
        return { bytes: null, error: `${label}: ${fatal[0].slice(0, 200)}`, warnings: stderr };
      }
    }

    return { bytes, error: null, warnings: stderr };
  } catch (err: any) {
    const msg = err?.message || String(err);
    // Emscripten exit errors are often just "exit(0)" — not real failures
    if (/exit\(0\)/.test(msg)) {
      // GS exited with code 0 but we didn't get output — try reading it again
      try {
        const bytes = module.FS.readFile("/" + outputName, { encoding: "binary" });
        if (bytes && bytes.byteLength > 0) {
          return { bytes, error: null, warnings: stderr };
        }
      } catch {}
    }
    return { bytes: null, error: `${label}: ${msg.slice(0, 300)}`, warnings: stderr };
  } finally {
    module.printErr = origPrintErr;
  }
}

// ── Main export ──

/**
 * Compress a PDF using the most aggressive method that succeeds.
 *
 * Returns { bytes, error } — error is null on success.
 * Even on error, the message is descriptive enough to show the user.
 */
export function compressWithPsRoundtrip(
  module: any,
  inputBytes: Uint8Array,
  targetBytes: number,
): { bytes: Uint8Array | null; error: string | null } {
  const originalBytes = inputBytes.byteLength;
  const ratio = targetBytes / originalBytes;
  const tier = selectTier(ratio);

  // Declare at function scope so they're visible for error collection
  let p1: RunResult, p2: RunResult | undefined, p3: RunResult | undefined;
  let a2p1: RunResult, a2p2: RunResult | undefined;
  let a3: RunResult, a4: RunResult;

  // ── Attempt 1: Full 3-pass pipeline ──
  // Pass 1: pdfwrite normalize (keeps fonts)
  p1 = runPass(module, inputBytes, "input.pdf", "step1.pdf", buildPass1Args("input.pdf", "step1.pdf"), "Normalize");

  if (p1.bytes) {
    // Pass 2: ps2write (strips Quartz bloat)
    p2 = runPass(module, p1.bytes, "step1.pdf", "step2.ps", buildPass2Args("step1.pdf", "step2.ps"), "PS round-trip");

    if (p2.bytes) {
      // Pass 3: final pdfwrite at target tier
      p3 = runPass(module, p2.bytes, "step2.ps", "final.pdf", buildPass3Args("step2.ps", "final.pdf", tier), "Final compression");

      if (p3.bytes) {
        nukeMemfs(module);
        return { bytes: p3.bytes, error: null };
      }
      // Pass 3 failed — fall through to attempt 2
    }
    // Pass 2 failed — fall through to attempt 2
  }
  // Pass 1 failed — fall through to attempt 2

  // ── Attempt 2: 2-pass (ps2write from original → pdfwrite) ──
  a2p1 = runPass(module, inputBytes, "input.pdf", "a2.ps", buildPass2Args("input.pdf", "a2.ps"), "PS convert (alt)");

  if (a2p1.bytes) {
    a2p2 = runPass(module, a2p1.bytes, "a2.ps", "final.pdf", buildPass3Args("a2.ps", "final.pdf", tier), "Final (alt)");

    if (a2p2.bytes) {
      nukeMemfs(module);
      return { bytes: a2p2.bytes, error: null };
    }
  }

  // ── Attempt 3: Single-pass pdfwrite ──
  a3 = runPass(
    module,
    inputBytes,
    "input.pdf",
    "final.pdf",
    buildDirectArgs("input.pdf", "final.pdf", tier, ratio),
    "Single-pass",
  );

  if (a3.bytes) {
    nukeMemfs(module);
    return { bytes: a3.bytes, error: null };
  }

  // ── Attempt 4: Last resort — /screen single-pass ──
  a4 = runPass(
    module,
    inputBytes,
    "input.pdf",
    "final.pdf",
    buildDirectArgs("input.pdf", "final.pdf", "screen", ratio),
    "Emergency",
  );

  if (a4.bytes) {
    nukeMemfs(module);
    return { bytes: a4.bytes, error: null };
  }

  nukeMemfs(module);

  // Build a helpful error message
  const errors: string[] = [];
  for (const e of [p1.error, p2?.error, p3?.error, a2p1?.error, a2p2?.error, a3.error, a4.error].filter(Boolean)) {
    if (typeof e === "string" && !errors.includes(e)) errors.push(e);
  }

  const detail = errors.length > 0
    ? errors.slice(0, 2).join(" | ")
    : "Unknown compression failure";

  return {
    bytes: null,
    error: `Compression failed after trying multiple methods. ${detail}. The PDF may use an unsupported format or contain corrupted data.`,
  };
}
