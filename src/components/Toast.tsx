import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  type?: "error" | "warning" | "info";
  duration?: number;
  onDismiss: () => void;
}

export default function Toast({
  message,
  type = "info",
  duration = 4000,
  onDismiss,
}: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  if (!visible) return null;

  const colors = {
    error:
      "border-red-500/30 bg-red-500/10 text-red-400",
    warning:
      "border-amber-500/30 bg-amber-500/10 text-amber-400",
    info:
      "border-accent/30 bg-accent/10 text-accent",
  };

  const icons = {
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
  };

  return (
    <div
      role="alert"
      className={`
        fixed right-4 top-4 z-50 flex max-w-sm items-start gap-3 rounded-lg
        border px-4 py-3 text-sm shadow-xl backdrop-blur-sm
        animate-in slide-in-from-right-2
        ${colors[type]}
      `}
    >
      <span>{icons[type]}</span>
      <p className="flex-1">{message}</p>
      <button
        onClick={() => {
          setVisible(false);
          onDismiss();
        }}
        className="ml-2 text-current opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
