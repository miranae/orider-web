import { useState } from "react";
import { Text } from "../../theme/components";
import { formatNum } from "../../utils/units";
interface WeekEntry {
  label: string;
  distance: number;
}

/** 거리 → 표시 문자열. 10km 미만은 소수 1자리, 이상은 정수 반올림.
 *  formatNum 으로 불필요한 끝자리 0 제거 (예: 5.0→"5", 5.3→"5.3", 190.4→"190"). */
function formatBarDistance(km: number): string {
  return km < 10 ? formatNum(km, 1) : formatNum(km, 0);
}

/** 막대 위 inline 라벨. 0 은 빈 공간 (시각 노이즈 제거). aria/title 은 formatBarDistance 로 동일 포맷 유지. */
function formatBarLabel(km: number): string {
  if (km <= 0) return "";
  return formatBarDistance(km);
}

export default function WeekBars({ weeks }: { weeks: WeekEntry[] }) {
  const last7 = weeks.slice(-7);
  const max = Math.max(...last7.map((w) => w.distance), 1);
  // 탭으로 선택된 막대 인덱스. -1 = 미선택 (마지막 = 이번주가 기본 강조).
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const activeIdx = selectedIdx >= 0 ? selectedIdx : last7.length - 1;
  // 호버(데스크톱) 막대 인덱스 — 선택보다 우선해 툴팁 표시. 모바일은 위 inline 라벨이 보조.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const tipIdx = hoverIdx != null ? hoverIdx : selectedIdx >= 0 ? selectedIdx : null;
  const tip = tipIdx != null ? last7[tipIdx] : null;
  // 양 끝 막대 툴팁이 잘리지 않도록 앵커 중심을 [12%, 88%] 로 클램프
  const anchorPct =
    tipIdx != null ? Math.min(Math.max(((tipIdx + 0.5) / last7.length) * 100, 12), 88) : 0;

  return (
    <div style={{ position: "relative" }}>
      {tip && (
        <div
          style={{
            position: "absolute",
            top: 18,
            left: `${anchorPct}%`,
            transform: "translateX(-50%)",
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
          <Text as="div" variant="mono" className="text-[length:var(--fs-xs)]" style={{ color: "var(--ink-2)" }}>
            {tip.label}
          </Text>
          <Text as="div" variant="mono" className="text-[length:var(--fs-sm)]" style={{ color: "var(--ink-0)", fontWeight: 700 }}>
            {formatBarDistance(tip.distance)} km
          </Text>
        </div>
      )}
      {/* 막대 위에 항상 km 값 노출 (모바일은 hover 툴팁 부재 → inline 라벨이 더 명확).
       *  선택된 막대는 lime, 나머지는 ink-3. */}
      <div className="flex items-end gap-[5px] mb-2">
        {last7.map((w, i) => (
          <Text key={`v-${w.label}`} as="div" variant="mono"
            className="text-[10px]"
            style={{
              flex: 1,
              textAlign: "center",
              color: i === activeIdx ? "var(--lime)" : "var(--ink-3)",
              fontWeight: i === activeIdx ? 600 : 400,
            }}
          >
            {formatBarLabel(w.distance)}
          </Text>
        ))}
      </div>
      <div className="flex items-end gap-[5px]" style={{ height: 96 }}>
        {last7.map((w, i) => (
          <button
            key={w.label}
            type="button"
            aria-label={`${w.label} ${formatBarDistance(w.distance)} km`}
            onClick={() => setSelectedIdx((s) => (s === i ? -1 : i))}
            onPointerEnter={() => setHoverIdx(i)}
            onPointerLeave={() => setHoverIdx(null)}
            className="flex-1 flex flex-col items-center gap-[3px] h-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lime)] rounded-[var(--r-sm)]"
            style={{
              // 디자인 시스템 className 차단 룰(no-token-bypass-classname, 2026-06-22 error
              // 승격) 회피 + iOS Safari 기본 button 스타일/탭 하이라이트 명시적 reset.
              background: "transparent",
              border: 0,
              padding: 0,
              color: "inherit",
              font: "inherit",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <div className="flex-1 w-full flex items-end">
              <div
                className="w-full"
                style={{
                  height: `${(w.distance / max) * 100}%`,
                  minHeight: w.distance > 0 ? 3 : 0,
                  background: i === activeIdx ? "var(--lime)" : "var(--lime-dim)",
                  borderRadius: "3px 3px 0 0",
                  transition: "background 0.15s",
                }}
              />
            </div>
            <Text as="div" variant="mono"
              className="text-[9px]"
              style={{ color: i === activeIdx ? "var(--lime)" : "var(--ink-4)" }}
            >
              {w.label}
            </Text>
          </button>
        ))}
      </div>
    </div>
  );
}
