import { useReducer, useCallback, useRef, useEffect } from "react";
import type { AppState, AppAction } from "./types";
import { MIN_TARGET_BYTES } from "./lib/constants";
import { formatBytes } from "./lib/utils";
import { useGhostscript } from "./hooks/useGhostscript";
import { useCompress } from "./hooks/useCompress";

import Dropzone from "./components/Dropzone";
import FileInfo from "./components/FileInfo";
import SizeSlider from "./components/SizeSlider";
import CompressButton from "./components/CompressButton";
import ProgressCard from "./components/ProgressCard";
import ResultCard from "./components/ResultCard";
import ErrorBanner from "./components/ErrorBanner";
import Toast from "./components/Toast";

/* ── Reducer ── */
function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "FILE_SELECTED": {
      const f = action.file;
      return {
        ...state,
        phase: "ready",
        file: f,
        fileSizeBytes: f.size,
        targetSizeBytes: Math.min(f.size, Math.max(MIN_TARGET_BYTES, f.size * 0.5)),
        resultBlob: null,
        resultSizeBytes: 0,
        elapsedMs: 0,
        errorMessage: null,
        warning: null,
      };
    }
    case "TARGET_CHANGED":
      return { ...state, targetSizeBytes: action.bytes };
    case "GS_LOAD_START":
      return { ...state, phase: "loading-gs", gsStatus: "loading" };
    case "GS_LOAD_PROGRESS":
      return { ...state, gsProgress: action.pct };
    case "GS_LOADED":
      return { ...state, gsStatus: "ready", phase: "ready" };
    case "GS_ERROR":
      return { ...state, gsStatus: "error", phase: "error", errorMessage: "Failed to load compression engine. Please refresh." };
    case "COMPRESS_START":
      return { ...state, phase: "compressing", errorMessage: null, warning: null };
    case "COMPRESS_PROGRESS":
      return { ...state, elapsedMs: action.elapsedMs };
    case "COMPRESS_COMPLETE":
      return {
        ...state,
        phase: "complete",
        resultBlob: action.blob,
        resultSizeBytes: action.blob.size,
      };
    case "COMPRESS_ERROR":
      return { ...state, phase: "error", errorMessage: action.message };
    case "SET_WARNING":
      return { ...state, warning: action.message };
    case "RESET":
      return {
        phase: "idle",
        file: null,
        fileSizeBytes: 0,
        targetSizeBytes: MIN_TARGET_BYTES,
        resultBlob: null,
        resultSizeBytes: 0,
        elapsedMs: 0,
        errorMessage: null,
        gsStatus: state.gsStatus,
        gsProgress: state.gsProgress,
        warning: null,
      };
    default:
      return state;
  }
}

const initialState: AppState = {
  phase: "idle",
  file: null,
  fileSizeBytes: 0,
  targetSizeBytes: MIN_TARGET_BYTES,
  resultBlob: null,
  resultSizeBytes: 0,
  elapsedMs: 0,
  errorMessage: null,
  gsStatus: "unloaded",
  gsProgress: 0,
  warning: null,
};

/* ── App Component ── */
export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const gs = useGhostscript();
  const { compress, compressing, elapsedMs, result } = useCompress();
  const toastRef = useRef<{ msg: string; type: "error" | "warning" | "info" } | null>(null);

  // Sync GS status changes to reducer
  useEffect(() => {
    if (gs.status === "loading") dispatch({ type: "GS_LOAD_START" });
    if (gs.status === "ready") dispatch({ type: "GS_LOADED" });
    if (gs.status === "error") dispatch({ type: "GS_ERROR" });
  }, [gs.status]);

  // Sync compress hook progress
  useEffect(() => {
    if (compressing && state.phase !== "compressing") {
      dispatch({ type: "COMPRESS_START" });
    }
    if (!compressing && state.phase === "compressing" && result) {
      dispatch({ type: "COMPRESS_COMPLETE", blob: result });
    }
  }, [compressing, result, state.phase]);

  // Elapsed tick sync
  useEffect(() => {
    if (compressing) {
      dispatch({ type: "COMPRESS_PROGRESS", elapsedMs });
    }
  }, [elapsedMs, compressing]);

  /* ── Handlers ── */
  const handleFileSelected = useCallback((file: File) => {
    dispatch({ type: "FILE_SELECTED", file });
  }, []);

  const handleTargetChange = useCallback((bytes: number) => {
    dispatch({ type: "TARGET_CHANGED", bytes });
  }, []);

  const handleCompress = useCallback(async () => {
    if (!state.file) return;

    // Warn if target is very aggressive
    if (state.targetSizeBytes < state.fileSizeBytes * 0.1) {
      toastRef.current = {
        msg: "Target size may be too small — result may be low quality.",
        type: "warning",
      };
    }

    try {
      dispatch({ type: "COMPRESS_START" });

      // Ensure GS is loaded — get both cached module and factory
      let gsModule: any;
      let gsFactory: (() => Promise<any>) | undefined;

      if (gs.module && gs.createInstance) {
        gsModule = gs.module;
        gsFactory = gs.createInstance;
      } else {
        const loaded = await gs.load();
        gsModule = loaded.module;
        gsFactory = loaded.createInstance;
      }

      if (!gsModule) throw new Error("Compression engine not available.");

      const blob = await compress(state.file, state.targetSizeBytes, gsModule, gsFactory);
      dispatch({ type: "COMPRESS_COMPLETE", blob });
    } catch (err: any) {
      dispatch({
        type: "COMPRESS_ERROR",
        message: err?.message || "Compression failed. Try a different target size.",
      });
    }
  }, [state.file, state.targetSizeBytes, gs, compress]);

  const handleDownload = useCallback(() => {
    if (!state.resultBlob || !state.file) return;
    const url = URL.createObjectURL(state.resultBlob);
    const a = document.createElement("a");
    a.href = url;
    const ext = state.file.name.replace(/\.pdf$/i, "") + "_compressed.pdf";
    a.download = ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [state.resultBlob, state.file]);

  const handleReset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  /* ── Compute button state ── */
  let buttonLabel = "⚡ Compress";
  let buttonDisabled = false;

  if (!state.file) {
    buttonLabel = "Select a file first";
    buttonDisabled = true;
  } else if (gs.status === "unloaded" || gs.status === "loading") {
    buttonLabel = gs.status === "loading" ? "Loading engine…" : "⚡ Compress";
    if (gs.status === "loading") buttonDisabled = true;
  } else if (state.phase === "compressing") {
    buttonLabel = "⏳ Compressing…";
    buttonDisabled = true;
  } else if (state.phase === "error") {
    buttonLabel = "Fix error and retry";
    buttonDisabled = true;
  }

  /* ── Determine if file is already smaller than target ── */
  const alreadySmallEnough = !!(
    state.file &&
    state.phase === "ready" &&
    state.fileSizeBytes <= state.targetSizeBytes
  );

  /* ── Toast handler ── */
  const dismissToast = useCallback(() => {
    toastRef.current = null;
    // Clear the warning too (if set)
    if (state.warning) dispatch({ type: "SET_WARNING", message: null });
  }, [state.warning]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-primary transition-colors duration-300">
      {/* Header */}
      <header className="mx-auto w-full max-w-lg px-4 pt-8 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-lg">
            🗜
          </span>
          <div>
            <h1 className="text-lg font-bold">PDF Compressor</h1>
            <p className="text-xs text-muted">
              100% private &bull; no server &bull; offline-ready
            </p>
          </div>
        </div>
      </header>

      {/* Main card */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-8">
        <div className="rounded-2xl border border-border bg-bg-card p-6 shadow-xl shadow-black/10">
          <div className="space-y-5">
            {/* ── Dropzone / File Info ── */}
            {!state.file ? (
              <Dropzone onFileSelected={handleFileSelected} />
            ) : (
              <FileInfo name={state.file.name} sizeBytes={state.fileSizeBytes} />
            )}

            {/* ── Slider (only when file loaded, not complete) ── */}
            {state.file && state.phase !== "complete" && state.phase !== "error" && (
              <SizeSlider
                minBytes={MIN_TARGET_BYTES}
                maxBytes={state.fileSizeBytes}
                valueBytes={state.targetSizeBytes}
                onChange={handleTargetChange}
                disabled={state.phase === "compressing"}
              />
            )}

            {/* ── Status: GS Loading Banner ── */}
            {gs.status === "loading" && (
              <div className="flex items-center gap-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-400">
                <span>⚙️</span>
                <p>Loading compression engine&hellip; (≈5 MB download on first visit)</p>
              </div>
            )}

            {/* ── Warning: Already small enough ── */}
            {alreadySmallEnough && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-amber-400">
                ℹ️ File is already smaller than your target. Try a lower target size.
              </div>
            )}

            {/* ── Compress Button (not during complete/error) ── */}
            {state.file && state.phase !== "complete" && state.phase !== "error" && (
              <CompressButton
                disabled={buttonDisabled || alreadySmallEnough}
                label={buttonLabel}
                onClick={handleCompress}
              />
            )}

            {/* ── Progress ── */}
            {state.phase === "compressing" && (
              <ProgressCard elapsedMs={elapsedMs} />
            )}

        {/* ── Result ── */}
            {state.phase === "complete" && state.resultBlob && (
            <ResultCard
                originalBytes={state.fileSizeBytes}
                compressedBytes={state.resultSizeBytes}
                elapsedMs={elapsedMs}
                onDownload={handleDownload}
                onCompressAgain={handleReset}
              />
            )}

            {/* ── Error ── */}
            {state.phase === "error" && state.errorMessage && (
              <ErrorBanner
                message={state.errorMessage}
                onRetry={handleReset}
              />
            )}
          </div>
        </div>

        {/* Footer info */}
        <p className="mt-6 text-center text-xs text-muted/60">
          🔒 All processing happens locally in your browser. No data is ever uploaded.
        </p>
      </main>

      {/* Toast */}
      {toastRef.current && (
        <Toast
          message={toastRef.current.msg}
          type={toastRef.current.type}
          onDismiss={dismissToast}
        />
      )}
    </div>
  );
}
