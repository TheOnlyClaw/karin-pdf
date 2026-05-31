import { useCallback, useState } from "react";
import { compressBySteppingTiers } from "../lib/tier-selector";

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

        // Single clean compression — step through tiers, one callMain per tier
        const outputBytes = compressBySteppingTiers(gsModule, inputBytes, targetBytes);

        const blob = new Blob([outputBytes], { type: "application/pdf" });
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
