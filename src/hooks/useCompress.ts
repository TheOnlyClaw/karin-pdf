import { useCallback, useState } from "react";
import { compressWithPsRoundtrip } from "../lib/ps-roundtrip";
import { compressViaServer, checkServer } from "../lib/server-compress";

/**
 * Hook that orchestrates the compression pipeline.
 *
 * Strategy:
 * 1. Try PS round-trip (WASM) — works for most PDFs, some fail with ENOSPC
 * 2. If WASM fails, try server-side GS (native — works for everything)
 */
export function useCompress() {
  const [compressing, setCompressing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);
  const [usedServer, setUsedServer] = useState(false);

  const compress = useCallback(
    async (file: File, targetBytes: number, gsModule: any): Promise<Blob> => {
      setCompressing(true);
      setElapsedMs(0);
      setResult(null);
      setUsedServer(false);

      const start = performance.now();

      // Tick elapsed time every 500ms
      const ticker = setInterval(() => {
        setElapsedMs(performance.now() - start);
      }, 500);

      try {
        const buffer = await file.arrayBuffer();
        const inputBytes = new Uint8Array(buffer);

        // ---- Attempt 1: WASM PS round-trip ----
        const wasmResult = compressWithPsRoundtrip(gsModule, inputBytes);

        if (wasmResult && wasmResult.byteLength <= targetBytes) {
          const blob = new Blob([wasmResult], { type: "application/pdf" });
          setResult(blob);
          setElapsedMs(performance.now() - start);
          return blob;
        }

        // ---- Attempt 2: Server-side (native GS) ----
        const serverAvailable = await checkServer();
        if (serverAvailable) {
          const serverBlob = await compressViaServer(file);
          setUsedServer(true);
          setResult(serverBlob);
          setElapsedMs(performance.now() - start);
          return serverBlob;
        }

        // ---- Fallback: return WASM result even if over target ----
        if (wasmResult) {
          const blob = new Blob([wasmResult], { type: "application/pdf" });
          setResult(blob);
          setElapsedMs(performance.now() - start);
          return blob;
        }

        throw new Error("Compression failed with all available methods.");
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

  return { compress, compressing, elapsedMs, result, setResult, usedServer };
}
