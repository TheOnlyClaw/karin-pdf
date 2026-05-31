import { MIN_TARGET_BYTES } from "../lib/constants";
import { formatBytes } from "../lib/utils";

interface SizeSliderProps {
  minBytes: number;
  maxBytes: number;
  valueBytes: number;
  onChange: (bytes: number) => void;
  disabled?: boolean;
}

export default function SizeSlider({
  minBytes,
  maxBytes,
  valueBytes,
  onChange,
  disabled,
}: SizeSliderProps) {
  const minMB = +(minBytes / (1024 * 1024)).toFixed(1);
  const maxMB = +(maxBytes / (1024 * 1024)).toFixed(1);
  const valMB = +(valueBytes / (1024 * 1024)).toFixed(1);
  const stepMB = 0.1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-primary">Target size</label>
        <span className="text-sm font-semibold text-accent">
          {formatBytes(valueBytes)}
        </span>
      </div>

      <div className="relative">
        <input
          type="range"
          min={minMB}
          max={maxMB}
          step={stepMB}
          value={valMB}
          disabled={disabled}
          onChange={(e) => {
            const mb = parseFloat(e.target.value);
            onChange(Math.round(mb * 1024 * 1024));
          }}
          className="
            peer w-full cursor-pointer appearance-none rounded-full
            bg-border/50 h-2 outline-none
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-accent
            [&::-webkit-slider-thumb]:shadow-lg
            [&::-webkit-slider-thumb]:shadow-accent/30
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:duration-150
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:h-5
            [&::-moz-range-thumb]:w-5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-accent
            [&::-moz-range-thumb]:border-0
            [&::-moz-range-thumb]:shadow-lg
          "
        />

        {/* Tick marks */}
        <div className="mt-1 flex justify-between px-0.5 text-[10px] text-muted/60">
          <span>{formatBytes(MIN_TARGET_BYTES)}</span>
          <span className="relative">
            {formatBytes(maxBytes)}
            {/* Original-size marker tick */}
            <span className="absolute -top-5 left-1/2 h-2 w-0.5 -translate-x-1/2 rounded bg-muted/30" />
          </span>
        </div>
      </div>
    </div>
  );
}
