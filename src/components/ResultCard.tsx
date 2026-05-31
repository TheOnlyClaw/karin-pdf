import { formatBytes } from "../lib/utils";

interface ResultCardProps {
  originalBytes: number;
  compressedBytes: number;
  elapsedMs: number;
  onDownload: () => void;
  onCompressAgain: () => void;
}

export default function ResultCard({
  originalBytes,
  compressedBytes,
  elapsedMs,
  onDownload,
  onCompressAgain,
}: ResultCardProps) {
  const ratio =
    originalBytes > 0
      ? ((compressedBytes / originalBytes) * 100).toFixed(1)
      : "0";
  const saved = originalBytes - compressedBytes;
  const secs = (elapsedMs / 1000).toFixed(1);

  return (
    <div className="space-y-5 rounded-xl bg-bg-card p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-lg">
          ✅
        </span>
        <div>
          <p className="font-semibold text-primary">Compression complete!</p>
          <p className="text-xs text-muted">Took {secs}s</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-bg-dropzone p-3 text-center">
          <p className="text-xs text-muted">Original</p>
          <p className="text-sm font-semibold text-primary">
            {formatBytes(originalBytes)}
          </p>
        </div>
        <div className="rounded-lg bg-bg-dropzone p-3 text-center">
          <p className="text-xs text-muted">Compressed</p>
          <p className="text-sm font-semibold text-success">
            {formatBytes(compressedBytes)}
          </p>
        </div>
        <div className="rounded-lg bg-bg-dropzone p-3 text-center">
          <p className="text-xs text-muted">Saved</p>
          <p className="text-sm font-semibold text-accent">
            {formatBytes(saved)}
          </p>
        </div>
      </div>

      {/* Ratio bar */}
      <div>
        <div className="flex justify-between text-xs text-muted">
          <span>Original</span>
          <span>{ratio}% of original</span>
        </div>
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-border/50">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-success transition-all duration-500"
            style={{ width: `${Math.min(100, +ratio)}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onDownload}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-all duration-200 hover:bg-accent/90 active:scale-[0.98]"
          autoFocus
        >
          ⬇ Download
        </button>
        <button
          onClick={onCompressAgain}
          className="flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-primary transition-all duration-200 hover:bg-bg-dropzone active:scale-[0.98]"
        >
          ↻ Compress again
        </button>
      </div>
    </div>
  );
}
