import { useState, useCallback, useRef } from "react";
import type { GsStatus } from "../types";

let cachedModule: any = null;
let factoryFn: any = null;

/**
 * Hook to load Ghostscript WASM (cached after first load).
 *
 * Returns:
 *   - `module` — a single cached instance (for quick single-pass use)
 *   - `createInstance` — factory to spawn FRESH module instances
 *     (required for multi-pass compression where callMain corrupts memory)
 *   - `load()` — ensure GS is loaded
 */
export function useGhostscript() {
  const [status, setStatus] = useState<GsStatus>(
    cachedModule ? "ready" : "unloaded"
  );
  const moduleRef = useRef<any>(cachedModule);
  const factoryRef = useRef<any>(factoryFn);

  const load = useCallback(async (): Promise<{
    module: any;
    createInstance: () => Promise<any>;
  }> => {
    if (moduleRef.current && factoryRef.current) {
      return { module: moduleRef.current, createInstance: factoryRef.current };
    }

    setStatus("loading");

    try {
      const loadWASM = (await import("@okathira/ghostpdl-wasm")).default;

      // Store factory for creating fresh instances
      factoryRef.current = loadWASM;
      factoryFn = loadWASM;

      // Create the first cached instance
      const Module = await (loadWASM as any)();

      moduleRef.current = Module;
      cachedModule = Module;
      setStatus("ready");
      return { module: Module, createInstance: loadWASM };
    } catch (err) {
      console.error("Ghostscript WASM load failed:", err);
      setStatus("error");
      throw err;
    }
  }, []);

  return {
    status,
    progress: status === "ready" ? 100 : 0,
    load,
    module: moduleRef.current,
    get createInstance() {
      return factoryRef.current;
    },
  };
}
