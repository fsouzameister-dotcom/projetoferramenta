import { useState } from "react";

type InfoTooltipProps = {
  text: string;
  className?: string;
};

export default function InfoTooltip({ text, className = "" }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      tabIndex={0}
      aria-label={text}
      role="note"
    >
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-cyan-400/70 text-cyan-200 text-[10px] cursor-help">
        i
      </span>
      {visible ? (
        <span className="absolute left-1/2 -translate-x-1/2 top-6 z-[120] w-64 rounded-lg border border-cyan-400/40 bg-[#0f1a33] px-3 py-2 text-[11px] leading-relaxed text-cyan-100 shadow-2xl">
          {text}
        </span>
      ) : null}
    </span>
  );
}
