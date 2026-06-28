import { useState } from "react";

import type { DailyLoad } from "../../../utils/fitnessMetrics";

export default function DailyTSSChart({ data }: { data: DailyLoad[] }) {
  const recent = data.slice(-42);
  const maxLoad = Math.max(...recent.map((d) => d.totalLoad), 1);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hover = hoverIdx != null ? recent[hoverIdx] : null;
  const anchorPct =
    hoverIdx != null
      ? Math.min(Math.max(((hoverIdx + 0.5) / recent.length) * 100, 12), 88)
      : 0;

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{ display: "flex", alignItems: "flex-end", gap: "var(--space-1)", height: 90 }}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {recent.map((d, i) => {
          const v = d.totalLoad;
          const c =
            v === 0 ? "var(--bg-3)" :
            v < 100 ? "var(--aqua-dim, oklch(0.55 0.12 200))" :
            v < 200 ? "var(--lime-dim, oklch(0.55 0.14 130))" :
            v < 300 ? "var(--amber)" : "var(--rose)";
          const op = v === 0 ? 0.4 : hoverIdx != null && hoverIdx !== i ? 0.5 : 1;
          return (
            <div
              key={i}
              onPointerEnter={() => setHoverIdx(i)}
              style={{
                flex: 1,
                height: `${Math.max((v / maxLoad) * 100, v === 0 ? 4 : 0)}%`,
                background: c,
                borderRadius: "var(--r-xs)",
                minWidth: 3,
                opacity: op,
                transition: "opacity 0.12s",
                cursor: "default",
              }}
            />
          );
        })}
      </div>
      {hover && (
        <div
          style={{
            position: "absolute",
            top: -6,
            left: `${anchorPct}%`,
            transform: "translate(-50%, -100%)",
            background: "var(--bg-1)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-md)",
            padding: "var(--space-2) var(--space-3)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 5,
          }}
        >
          <div style={{ fontSize: "var(--fs-xs)", fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>
            {hover.date}
          </div>
          <div style={{ fontSize: "var(--fs-sm)", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--ink-0)" }}>
            {Math.round(hover.totalLoad)} TSS
          </div>
        </div>
      )}
    </div>
  );
}
