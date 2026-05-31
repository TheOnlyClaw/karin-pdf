interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="space-y-4 rounded-xl bg-red-500/5 border border-red-500/20 p-6">
      <div className="flex items-center gap-3">
        <span className="text-xl">❌</span>
        <div>
          <p className="font-semibold text-red-400">Something went wrong</p>
          <p className="mt-1 text-sm text-muted">{message}</p>
        </div>
      </div>
      <button
        onClick={onRetry}
        className="rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
      >
        Try again
      </button>
    </div>
  );
}
