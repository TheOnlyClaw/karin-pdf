import { useRef, useCallback, type DragEvent, type ChangeEvent } from "react";
import { MAX_FILE_BYTES } from "../lib/constants";

interface DropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function Dropzone({ onFileSelected, disabled }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
        alert("❌ Only PDF files are accepted.");
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        alert("❌ File too large. Max 200 MB.");
        return;
      }
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      dropRef.current?.classList.remove("border-accent", "bg-accent/5");
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    dropRef.current?.classList.add("border-accent", "bg-accent/5");
  }, []);

  const onDragLeave = useCallback(() => {
    dropRef.current?.classList.remove("border-accent", "bg-accent/5");
  }, []);

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
      e.target.value = "";
    },
    [handleFile]
  );

  return (
    <div
      ref={dropRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload PDF file"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      onDrop={disabled ? undefined : onDrop}
      onDragOver={disabled ? undefined : onDragOver}
      onDragLeave={disabled ? undefined : onDragLeave}
      className={`
        relative flex cursor-pointer flex-col items-center justify-center
        rounded-xl border-2 border-dashed border-border
        bg-bg-dropzone px-6 py-14 text-center
        transition-all duration-200
        ${
          disabled
            ? "cursor-not-allowed opacity-50"
            : "hover:border-accent hover:bg-accent/5"
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={onInputChange}
        disabled={disabled}
      />

      {/* Icon */}
      <svg
        className="mb-4 h-12 w-12 text-muted"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
        />
      </svg>

      <p className="text-lg font-medium text-primary">
        Drop your PDF here
      </p>
      <p className="mt-1 text-sm text-muted">or click to browse</p>
      <p className="mt-4 text-xs text-muted">
        Supported: PDF &middot; Max: 200 MB
      </p>
    </div>
  );
}
