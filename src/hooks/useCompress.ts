import { useCallback, useState } from "react";
import { compressWithPsRoundtrip } from "../lib/ps-roundtrip";

/**
 * Hook that orchestrates the compression pipeline.
 *
 * Uses multi-pass PS round-trip compression with automatic
 * fallback chains for stability. Error messages are descriptive
 * and user-visible.
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

        // Multi-pass compression with automatic fallback
        const result = compressWithPsRoundtrip(gsModule, inputBytes, targetBytes);

        if (!result.bytes) {
          // Show the specific error GS reported
          throw new Error(result.error || "Compression did not produce output. Try a different target size or file.");
        }

        const blob = new Blob([result.bytes], { type: "application/pdf" });
        setResult(blob);
        setElapsedMs(performance.now() - start);
        return blob;
      } catch (err: any) {
        throw new Error(
          err?.message || "An unexpected error occurred during compression."
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
