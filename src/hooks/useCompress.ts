import { useCallback, useState } from "react";
import { compressWithPsRoundtrip } from "../lib/ps-roundtrip";

/**
 * Hook that orchestrates the compression pipeline.
 *
 * Uses multi-pass PS round-trip compression with automatic
 * fallback chains. Each pass gets a FRESH WASM module instance
 * to avoid Emscripten memory corruption from repeated callMain calls.
 */
export function useCompress() {
  const [compressing, setCompressing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);

  const compress = useCallback(
    async (
      file: File,
      targetBytes: number,
      gsModule: any,
      createInstance?: () => Promise<any>,
    ): Promise<Blob> => {
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

        // Multi-pass compression with fresh-module-per-pass
        const result = await compressWithPsRoundtrip(
          gsModule,
          createInstance,
          inputBytes,
          targetBytes,
        );

        if (!result.bytes) {
          throw new Error(
            result.error ||
              "Compression did not produce output. Try a different target size or file.",
          );
        }

        const blob = new Blob([result.bytes], { type: "application/pdf" });
        setResult(blob);
        setElapsedMs(performance.now() - start);
        return blob;
      } catch (err: any) {
        throw new Error(
          err?.message || "An unexpected error occurred during compression.",
        );
      } finally {
        clearInterval(ticker);
        setCompressing(false);
      }
    },
    [],
  );

  return { compress, compressing, elapsedMs, result, setResult };
}
