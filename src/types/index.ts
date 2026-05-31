/* ── App Phases ── */
export type Phase =
  | "idle"        // no file loaded
  | "ready"       // file loaded, waiting for compress
  | "loading-gs"  // first cold load — downloading WASM
  | "compressing" // GS running
  | "complete"    // result ready
  | "error";      // something went wrong

export type GsStatus = "unloaded" | "loading" | "ready" | "error";

export interface AppState {
  phase: Phase;
  file: File | null;
  fileSizeBytes: number;
  targetSizeBytes: number;
  resultBlob: Blob | null;
  resultSizeBytes: number;
  elapsedMs: number;
  errorMessage: string | null;
  gsStatus: GsStatus;
  gsProgress: number; // 0–100 WASM download %
  warning: string | null;
}

export type AppAction =
  | { type: "FILE_SELECTED"; file: File }
  | { type: "TARGET_CHANGED"; bytes: number }
  | { type: "GS_LOAD_START" }
  | { type: "GS_LOAD_PROGRESS"; pct: number }
  | { type: "GS_LOADED" }
  | { type: "GS_ERROR" }
  | { type: "COMPRESS_START" }
  | { type: "COMPRESS_PROGRESS"; elapsedMs: number }
  | { type: "COMPRESS_COMPLETE"; blob: Blob }
  | { type: "COMPRESS_ERROR"; message: string }
  | { type: "SET_WARNING"; message: string | null }
  | { type: "RESET" };

/* ── GS Tier ── */
export type GsTier = "prepress" | "printer" | "ebook" | "screen";
