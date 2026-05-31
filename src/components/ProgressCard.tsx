interface ProgressCardProps {
  elapsedMs: number;
}

export default function ProgressCard({ elapsedMs }: ProgressCardProps) {
  const secs = (elapsedMs / 1000).toFixed(1);

  return (
    <div className="space-y-4 rounded-xl bg-bg-card p-6">
      {/* Indeterminate progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-border/50">
        <div
          className="h-full w-1/3 rounded-full bg-accent"
          style={{
            animation: "indeterminate 1.5s ease-in-out infinite",
          }}
        />
      </div>

      <p className="text-center text-sm text-muted">
        ⏳ Compressing&hellip; ({secs}s)
      </p>

      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
