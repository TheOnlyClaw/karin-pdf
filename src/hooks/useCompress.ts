import { useCallback, useState } from "react";
import { compressWithPsRoundtrip } from "../lib/ps-roundtrip";

/**
 * Hook that orchestrates the compression pipeline.
 *
 * Uses 3-pass PS round-trip (pdfwrite → ps2write → pdfwrite) within
 * a single GS Module instance. Pass 3 tier is selected based on
 * the user's target size to balance quality vs compression.
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

      const ticker = setInterval(() => {
        setElapsedMs(performance.now() - start);
      }, 500);

      try {
        const buffer = await file.arrayBuffer();
        const inputBytes = new Uint8Array(buffer);

        // 3-pass PS round-trip with tier selected by target size
        const outputBytes = compressWithPsRoundtrip(gsModule, inputBytes, targetBytes);

        if (!outputBytes) {
          throw new Error("Compression failed.");
        }

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
