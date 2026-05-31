/**
 * Robust multi-pass PDF compression using Ghostscript WASM.
 *
 * Core strategy — FRESH MODULE PER PASS:
 *
 *   Emscripten's `callMain` corrupts WASM memory on repeat calls.
 *   So instead of calling callMain 3× on one Module, we spawn 3
 *   independent Module instances — each gets exactly 1 callMain.
 *
 * Pipeline:
 *   Attempt 1: normalize (fresh mod A) → ps2write (fresh mod B) → final (fresh mod C)
 *   Attempt 2: ps2write from original (fresh mod D) → final (fresh mod E)
 *   Attempt 3: single-pass pdfwrite (cached module — 1 call only)
 *   Attempt 4: single-pass /screen (cached module)
 *
 * Stability rules:
 *   - NEVER call callMain more than once per Module instance
 *   - Fonts are kept embedded for readability
 *   - stderr is captured per pass for diagnostics
 */

import type { GsTier } from "../types";
import { TIER_DPI } from "./constants";

// ── Formatting ──

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Tier selection ──

/**
 * Estimated compression ratios after the full PS round-trip
 * (normalize + ps2write + pdfwrite at each tier).
 * Empirically derived from iOS Quartz PDFs with embedded fonts.
 * These represent the output size as a fraction of the ORIGINAL PDF.
 */
const TIER_ESTIMATED_RATIO: Record<GsTier, number> = {
  prepress: 0.21,
  printer: 0.14,
  ebook: 0.046,
  screen: 0.025,
};

/**
 * Select the BEST tier for the user's target size.
 *
 * Instead of selecting by ratio (which ignores that the PS
 * round-trip already compresses fonts enormously), we estimate
 * how big each tier's output will be and pick the HIGHEST
 * quality tier whose estimated size is still ≤ target.
 *
 * This way: target 8MB on 16MB → prepress (~3.4MB) ✓
 *           target 2MB on 16MB → ebook (~740KB) — close
 */
function selectTier(originalBytes: number, targetBytes: number): GsTier {
  // Target at or above ~80% of original → max quality
  if (targetBytes >= originalBytes * 0.8) return "prepress";

  const tiers: GsTier[] = ["prepress", "printer", "ebook", "screen"];

  // Pick highest quality tier whose estimated output is ≤ target
  for (const tier of tiers) {
    const estimated = originalBytes * TIER_ESTIMATED_RATIO[tier];
    if (estimated <= targetBytes) {
      return tier;
    }
  }

  return "screen";
}

// ── Arg builders ──

function buildNormalizeArgs(input: string, output: string): string[] {
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

function buildPs2WriteArgs(input: string, output: string): string[] {
  return [
    "-dNOPAUSE", "-dBATCH",
    "-sDEVICE=ps2write",
    "-sOutputFile=" + output,
    input,
  ];
}

function buildFinalArgs(input: string, output: string, tier: GsTier): string[] {
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
    const embedIdx = args.indexOf("-dEmbedAllFonts=true");
    if (embedIdx !== -1) args[embedIdx] = "-dEmbedAllFonts=false";
    const subIdx = args.indexOf("-dSubsetFonts=true");
    if (subIdx !== -1) args[subIdx] = "-dSubsetFonts=false";
  }

  return args;
}

// ── MEMFS cleanup ──

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
    // Silently skip if readdir unavailable
  }
}

// ── Single-pass runner (fresh module, 1 callMain only) ──

interface RunResult {
  bytes: Uint8Array | null;
  error: string | null;
}

/**
 * Execute ONE callMain on a FRESH module instance.
 * Returns the output bytes or an error message.
 */
async function runPassFresh(
  createInstance: () => Promise<any>,
  inputBytes: Uint8Array,
  inputName: string,
  outputName: string,
  args: string[],
  label: string,
): Promise<RunResult> {
  try {
    const module = await createInstance();

    // Hook stderr
    const stderr: string[] = [];
    module.printErr = (msg: string) => { stderr.push(msg); };

    // Write input
    nukeMemfs(module);
    module.FS.writeFile("/" + inputName, inputBytes);

    // Run GS — this is the ONLY callMain on this module
    try {
      module.callMain(args);
    } catch (callErr: any) {
      // "exit(0)" is not a real error — GS clean exit
      const msg = callErr?.message || String(callErr);
      if (!/exit\(0\)/.test(msg)) {
        return { bytes: null, error: `${label}: ${msg.slice(0, 300)}` };
      }
    }

    // Read output
    try {
      const bytes = module.FS.readFile("/" + outputName, { encoding: "binary" });
      if (!bytes || bytes.byteLength === 0) {
        return { bytes: null, error: `${label}: output file is empty` };
      }

      // Check for real fatal errors in stderr
      const fatal = stderr.filter(
        (s) => /Segmentation|Fatal|undefined in /.test(s)
      );
      if (fatal.length > 0) {
        return { bytes: null, error: `${label}: ${fatal[0].slice(0, 200)}` };
      }

      return { bytes, error: null };
    } catch (readErr: any) {
      return { bytes: null, error: `${label}: cannot read output — ${(readErr?.message || String(readErr)).slice(0, 200)}` };
    }
  } catch (err: any) {
    return { bytes: null, error: `${label}: init failed — ${(err?.message || String(err)).slice(0, 200)}` };
  }
}

/**
 * Execute ONE callMain on an EXISTING cached module.
 * Only for fallback single-pass (1 callMain, no corruption risk).
 */
function runPassCached(
  module: any,
  inputBytes: Uint8Array,
  inputName: string,
  outputName: string,
  args: string[],
  label: string,
): RunResult {
  const stderr: string[] = [];
  const origPrintErr = module.printErr;
  module.printErr = (msg: string) => { stderr.push(msg); };

  try {
    nukeMemfs(module);
    module.FS.writeFile("/" + inputName, inputBytes);

    try {
      module.callMain(args);
    } catch (callErr: any) {
      const msg = callErr?.message || String(callErr);
      if (!/exit\(0\)/.test(msg)) {
        return { bytes: null, error: `${label}: ${msg.slice(0, 300)}` };
      }
    }

    const bytes = module.FS.readFile("/" + outputName, { encoding: "binary" });
    if (!bytes || bytes.byteLength === 0) {
      return { bytes: null, error: `${label}: output file is empty` };
    }

    return { bytes, error: null };
  } catch (err: any) {
    return { bytes: null, error: `${label}: ${(err?.message || String(err)).slice(0, 300)}` };
  } finally {
    module.printErr = origPrintErr;
  }
}

// ── Main export ──

/**
 * Compress a PDF using fresh WASM instances for each pass.
 *
 * @param cachedModule — single cached instance (for fallback single-pass)
 * @param createInstance — factory function for fresh instances
 * @param inputBytes — original PDF bytes
 * @param targetBytes — user's target size
 */
export async function compressWithPsRoundtrip(
  cachedModule: any,
  createInstance: (() => Promise<any>) | null | undefined,
  inputBytes: Uint8Array,
  targetBytes: number,
): Promise<{ bytes: Uint8Array | null; error: string | null }> {
  const originalBytes = inputBytes.byteLength;
  const ratio = targetBytes / originalBytes;
  const tier = selectTier(originalBytes, targetBytes);

  // Need createInstance for multi-pass
  const factory = createInstance;

  // ── Attempt 1: 3-pass (fresh instances) ──
  if (factory) {
    const p1 = await runPassFresh(
      factory, inputBytes, "input.pdf", "step1.pdf",
      buildNormalizeArgs("input.pdf", "step1.pdf"), "Normalize",
    );

    if (p1.bytes) {
      const p2 = await runPassFresh(
        factory, p1.bytes, "step1.pdf", "step2.ps",
        buildPs2WriteArgs("step1.pdf", "step2.ps"), "PS round-trip",
      );

      if (p2.bytes) {
        const p3 = await runPassFresh(
          factory, p2.bytes, "step2.ps", "final.pdf",
          buildFinalArgs("step2.ps", "final.pdf", tier), "Final compression",
        );

        if (p3.bytes) {
          return { bytes: p3.bytes, error: null };
        }
      }
    }

    // ── Attempt 2: 2-pass (fresh instances, skip normalize) ──
    const a2p1 = await runPassFresh(
      factory, inputBytes, "input.pdf", "a2.ps",
      buildPs2WriteArgs("input.pdf", "a2.ps"), "PS convert (alt)",
    );

    if (a2p1.bytes) {
      const a2p2 = await runPassFresh(
        factory, a2p1.bytes, "a2.ps", "final.pdf",
        buildFinalArgs("a2.ps", "final.pdf", tier), "Final (alt)",
      );

      if (a2p2.bytes) {
        return { bytes: a2p2.bytes, error: null };
      }
    }
  }

  // ── Attempt 3: Single-pass pdfwrite (cached module — 1 call only) ──
  if (cachedModule) {
    const a3 = runPassCached(
      cachedModule, inputBytes, "input.pdf", "final.pdf",
      buildDirectArgs("input.pdf", "final.pdf", tier, ratio), "Single-pass",
    );

    if (a3.bytes) {
      return { bytes: a3.bytes, error: null };
    }

    // ── Attempt 4: Emergency — /screen single-pass ──
    const a4 = runPassCached(
      cachedModule, inputBytes, "input.pdf", "final.pdf",
      buildDirectArgs("input.pdf", "final.pdf", "screen", ratio), "Emergency",
    );

    if (a4.bytes) {
      return { bytes: a4.bytes, error: null };
    }
  }

  return {
    bytes: null,
    error:
      "Compression failed after trying multiple methods. " +
      "The PDF may use an unsupported format or contain corrupted data.",
  };
}
