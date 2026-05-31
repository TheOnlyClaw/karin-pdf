import { useCallback, useState } from "react";
import { compressWithPsRoundtrip } from "../lib/ps-roundtrip";

/**
 * Hook that orchestrates the full compression pipeline.
 *
 * Uses a 3-pass PS round-trip (pdfwrite → ps2write → pdfwrite) within
 * a single GS Module instance. Handles Quartz PDFs with 100+ font subsets.
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
        const buffer = await file.arrayBuffer();
        const inputBytes = new Uint8Array(buffer);

        // 3-pass PS round-trip within a single GS Module instance
        // Pass 1: pdfwrite (font dedup) → Pass 2: ps2write → Pass 3: pdfwrite
        const outputBytes = compressWithPsRoundtrip(gsModule, inputBytes);

        if (!outputBytes) {
          throw new Error("Compression failed — PS round-trip produced no output.");
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
