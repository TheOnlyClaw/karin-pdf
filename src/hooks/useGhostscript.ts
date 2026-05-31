import { useState, useCallback, useRef } from "react";
import type { GsStatus } from "../types";

let cachedModule: any = null;

/**
 * Hook to load Ghostscript WASM (cached after first load).
 * Returns the module once loaded, plus loading progress.
 */
export function useGhostscript() {
  const [status, setStatus] = useState<GsStatus>(
    cachedModule ? "ready" : "unloaded"
  );
  const moduleRef = useRef<any>(cachedModule);

  const load = useCallback(async (): Promise<any> => {
    if (moduleRef.current) return moduleRef.current;

    setStatus("loading");

    try {
      const loadWASM = (await import("@okathira/ghostpdl-wasm")).default;

      // Use the ESM-compatible loader
      const Module = await (loadWASM as any)();

      moduleRef.current = Module;
      cachedModule = Module;
      setStatus("ready");
      return Module;
    } catch (err) {
      console.error("Ghostscript WASM load failed:", err);
      setStatus("error");
      throw err;
    }
  }, []);

  return { status, progress: status === "ready" ? 100 : 0, load, module: moduleRef.current };
}
