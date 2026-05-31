interface CompressButtonProps {
  disabled: boolean;
  label: string;
  onClick: () => void;
}

export default function CompressButton({
  disabled,
  label,
  onClick,
}: CompressButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex w-full items-center justify-center gap-2 rounded-lg px-6 py-3
        text-sm font-semibold transition-all duration-200
        ${
          disabled
            ? "cursor-not-allowed bg-muted/20 text-muted/50"
            : "cursor-pointer bg-accent text-white shadow-lg shadow-accent/25 hover:bg-accent/90 active:scale-[0.98]"
        }
      `}
    >
      {label}
    </button>
  );
}
