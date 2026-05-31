import { useCallback, useState } from "react";
import { selectTier, buildGsArgs, binarySearchDPI } from "../lib/tier-selector";
import type { GsTier } from "../types";

/**
 * Hook that orchestrates the full compression pipeline.
 * Returns a `compress(file, targetBytes)` function and result state.
 */
export function useCompress() {
  const [compressing, setCompressing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);

  const compress = useCallback(
    async (file: File, targetBytes: number, gsModule: any): Promise<Blob> => {
      setCompressing(true);
      setElapsedMs(0);
      setResult(null);

      const start = performance.now();

      // Tick elapsed time every 500ms
      const ticker = setInterval(() => {
        setElapsedMs(performance.now() - start);
      }, 500);

      try {
        // Read file into Uint8Array
        const buffer = await file.arrayBuffer();
        const inputBytes = new Uint8Array(buffer);

        // ---- 1. Write input into MEMFS ----
        gsModule.FS.writeFile("input.pdf", inputBytes);

        // ---- 2. Select tier ----
        const { tier, dpi } = selectTier(inputBytes.byteLength, targetBytes);
        const args = buildGsArgs("input.pdf", "output.pdf", tier, dpi);

        // ---- 3. Run GS ----
        gsModule.callMain(args);

        // ---- 4. Read output ----
        let outputData: Uint8Array;
        let usedTier: GsTier = tier;
        try {
          outputData = gsModule.FS.readFile("output.pdf", {
            encoding: "binary",
          });
        } catch {
          // Single pass failed — try binary search starting from this tier
          const { args: bsArgs } = binarySearchDPI(
            gsModule,
            "input.pdf",
            "output.pdf",
            targetBytes,
            tier
          );
          gsModule.callMain(bsArgs);
          outputData = gsModule.FS.readFile("output.pdf", {
            encoding: "binary",
          });
          usedTier = "screen"; // binarySearchDPI may have fallen through tiers
        }

        // ---- 5. If still over target, binary search ----
        let finalData = outputData;
        if (outputData.byteLength > targetBytes) {
          try {
            const { args: bsArgs, resultBytes } = binarySearchDPI(
              gsModule,
              "input.pdf",
              "output.pdf",
              targetBytes,
              usedTier
            );
            gsModule.callMain(bsArgs);
            finalData = gsModule.FS.readFile("output.pdf", {
              encoding: "binary",
            });
          } catch {
            // Binary search failed — use original output anyway
          }
        }

        // ---- 6. Cleanup MEMFS ----
        try {
          gsModule.FS.unlink("input.pdf");
          gsModule.FS.unlink("output.pdf");
        } catch { /* ok */ }

        const blob = new Blob([finalData], { type: "application/pdf" });
        setResult(blob);
        setElapsedMs(performance.now() - start);
        return blob;
      } catch (err: any) {
        throw new Error(
          err?.message || "Ghostscript encountered an error during compression."
        );
      } finally {
        clearInterval(ticker);
        setCompressing(false);
      }
    },
    []
  );

  return { compress, compressing, elapsedMs, result, setResult };
}
