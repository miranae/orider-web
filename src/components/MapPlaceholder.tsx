import { useTranslation } from "react-i18next";

interface MapPlaceholderProps {
  height?: string;
  label?: string;
}

export default function MapPlaceholder({
  height = "h-64",
  label,
}: MapPlaceholderProps) {
  const { t } = useTranslation("common");
  const displayLabel = label ?? t("map.placeholder");
  return (
    <div
      className={`${height} rounded-[var(--r-lg)] flex flex-col items-center justify-center relative overflow-hidden`}
      style={{ background: "var(--bg-1)", borderWidth: 1, borderStyle: "solid", borderColor: "var(--line-soft)", color: "var(--ink-3)" }}
    >
      {/* Fake map grid */}
      <div className="absolute inset-0 opacity-10">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={`h${i}`}
            className="absolute w-full border-t"
            style={{ borderColor: "var(--ink-3)", top: `${(i + 1) * 12}%` }}
          />
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={`v${i}`}
            className="absolute h-full border-l"
            style={{ borderColor: "var(--ink-3)", left: `${(i + 1) * 8}%` }}
          />
        ))}
      </div>
      {/* Fake route */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
      >
        <path
          d="M 30 150 Q 80 50, 150 100 T 250 60 T 370 120"
          fill="none"
          stroke="#f97316"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.6"
        />
      </svg>
      <div className="relative z-10 flex flex-col items-center gap-1">
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
          />
        </svg>
        <span className="text-[length:var(--fs-sm)] font-medium">{displayLabel}</span>
      </div>
    </div>
  );
}
