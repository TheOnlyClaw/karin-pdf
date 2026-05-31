import { useCallback, useState } from "react";
import { compressWithPsRoundtrip } from "../lib/ps-roundtrip";

/**
 * Hook that orchestrates the full compression pipeline.
 * Uses PS round-trip (PDF → PostScript → PDF) to aggressively reduce
 * Quartz/iOS-generated PDF bloat.
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

        // PS round-trip: PDF → PostScript → PDF
        // This strips Quartz bloat far more effectively than pdfwrite tiers
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
