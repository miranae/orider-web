import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FitnessPoint } from "../utils/fitnessMetrics";

interface ProjectionPoint {
  date: number; // ms timestamp
  ctl: number;
  atl: number;
  tsb: number;
}

interface FitnessChartProps {
  data: FitnessPoint[];
  projection?: ProjectionPoint[] | null;
  /** Today's date string 'YYYY-MM-DD' */
  today?: string;
  /** Goal day timestamp ms */
  goalDate?: number | null;
  /** CTL value on goal day */
  goalCTL?: number | null;
  /** TSB value on goal day */
  goalTSB?: number | null;
}

function tsToDateStr(ms: number): string {
  // 로컬 시간대 기준 (toLocalDate와 동일 규칙)
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// formatDateLabel needs t() for locale-aware format — defined inside component


// 차트 레이아웃 — padding-aware (Y라벨 / 범례 공간 확보).
const PAD_LEFT = 44;
const PAD_RIGHT = 8;
const PAD_TOP = 32;
const PAD_BOTTOM = 24;
const VIEW_W = 1080;
const VIEW_H = 280;
const PLOT_W = VIEW_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = VIEW_H - PAD_TOP - PAD_BOTTOM;

/** 친근한 Y축 tick 생성 (5의 배수 단위). */
function niceTicks(min: number, max: number, count = 5): number[] {
  const range = max - min;
  if (range === 0) return [min];
  const rawStep = range / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const niceStep = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const start = Math.ceil(min / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = start; v <= max + 0.001; v += niceStep) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/**
 * PMC (Performance Management Chart).
 *
 * 라인:
 *  - CTL(lime, 두꺼움) — 장기 피트니스 (42일 EMA)
 *  - ATL(rose) — 단기 피로 (7일 EMA)
 *  - TSB(amber) — 폼/컨디션 (CTL - ATL, 0 근처 최적)
 *
 * 추가 시각 요소:
 *  - 좌상단 범례 (라인 색 + 의미)
 *  - 좌측 Y축 tick + 값
 *  - 미래 예측(dashed) + 오늘/목표일 마커
 *  - 호버 시 십자선 + 도트 + 카드 (날짜·CTL·ATL·TSB)
 */
export default function FitnessChart({
  data,
  projection,
  today,
  goalDate,
  goalCTL,
  goalTSB,
}: FitnessChartProps) {
  const { t } = useTranslation("dashboard");
  const svgRef = useRef<SVGSVGElement>(null);

  const formatDateLabel = (dateStr: string): string => {
    const parts = dateStr.split("-");
    return t("weeklySummary.dateMonthDay", { month: parseInt(parts[1]!), day: parseInt(parts[2]!) });
  };
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const {
    ctlPastPath, atlPastPath, tsbPastPath,
    ctlFuturePath, atlFuturePath, tsbFuturePath,
    ctlFillPath,
    todayX, todayCtlY,
    goalX, goalCtlY, goalTsbY,
    goalCTLVal, goalTSBVal,
    hasFuture,
    xLabels,
    yTicks,
    series,
    syFn,
  } = useMemo(() => {
    const todayStr = today ?? new Date().toISOString().slice(0, 10);

    const pastCTL = data.map((d) => d.ctl);
    const pastATL = data.map((d) => d.atl);
    const pastTSB = data.map((d) => d.tsb);
    const pastDates = data.map((d) => d.date);

    const lastPastDate = pastDates[pastDates.length - 1] ?? "";
    const futurePoints = (projection ?? []).filter(
      (p) => tsToDateStr(p.date) > lastPastDate,
    );
    const hasFut = futurePoints.length > 0;

    // Seed 보정 (기존 동작 유지) — 서버 projection 의 load 공식 차이로 인한
    // 경계 점프 방지. 첫 미래값을 오늘 실제값에 맞춰 평행이동.
    const lastPastCTL = pastCTL[pastCTL.length - 1] ?? 0;
    const lastPastATL = pastATL[pastATL.length - 1] ?? 0;
    const lastPastTSB = pastTSB[pastTSB.length - 1] ?? 0;
    const ctlOffset = hasFut ? lastPastCTL - futurePoints[0]!.ctl : 0;
    const atlOffset = hasFut ? lastPastATL - futurePoints[0]!.atl : 0;
    const tsbOffset = hasFut ? lastPastTSB - futurePoints[0]!.tsb : 0;

    const allCTL = [...pastCTL, ...futurePoints.map((p) => p.ctl + ctlOffset)];
    const allATL = [...pastATL, ...futurePoints.map((p) => p.atl + atlOffset)];
    const allTSB = [...pastTSB, ...futurePoints.map((p) => p.tsb + tsbOffset)];
    const pastCount = pastCTL.length;
    const totalPoints = pastCount + futurePoints.length;

    // Y 자동 스케일.
    const allValues = [...allCTL, ...allATL, ...allTSB];
    const dataMax = Math.max(...allValues, 10);
    const dataMin = Math.min(...allValues, -5);
    const padding = (dataMax - dataMin) * 0.1;
    const yMax = dataMax + padding;
    const yMin = dataMin - padding;

    const sx = (i: number) =>
      PAD_LEFT + (i / Math.max(totalPoints - 1, 1)) * PLOT_W;
    const sy = (v: number) =>
      PAD_TOP + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;

    const lineSeg = (arr: number[], from: number, count: number) =>
      arr
        .slice(from, from + count)
        .map((v, i) => `${i === 0 ? "M" : "L"}${sx(from + i).toFixed(1)} ${sy(v).toFixed(1)}`)
        .join(" ");

    const ctlPast = pastCount > 0 ? lineSeg(allCTL, 0, pastCount) : "";
    const atlPast = pastCount > 0 ? lineSeg(allATL, 0, pastCount) : "";
    const tsbPast = pastCount > 0 ? lineSeg(allTSB, 0, pastCount) : "";

    const baseY = (PAD_TOP + PLOT_H).toFixed(1);
    const ctlFill = pastCount > 0
      ? `M${sx(0).toFixed(1)} ${baseY} ${lineSeg(allCTL, 0, pastCount).replace(/^M/, "L")} L${sx(pastCount - 1).toFixed(1)} ${baseY} Z`
      : "";

    let ctlFut = "";
    let atlFut = "";
    let tsbFut = "";
    if (hasFut && pastCount > 0) {
      const startIdx = pastCount - 1;
      const futCount = futurePoints.length + 1;
      ctlFut = lineSeg(allCTL, startIdx, futCount);
      atlFut = lineSeg(allATL, startIdx, futCount);
      tsbFut = lineSeg(allTSB, startIdx, futCount);
    }

    const todayIdx = pastCount - 1;
    const tX = sx(todayIdx);
    const tCtlY = pastCount > 0 ? sy(pastCTL[pastCount - 1]!) : 0;

    const goalDateStr = goalDate != null ? tsToDateStr(goalDate) : null;
    let gX = sx(totalPoints - 1);
    let gCtlY = 0;
    let gTsbY = 0;
    let gCTLVal = goalCTL ?? null;
    let gTSBVal = goalTSB ?? null;
    if (goalDateStr && hasFut) {
      const futIdx = futurePoints.findIndex((p) => tsToDateStr(p.date) >= goalDateStr);
      if (futIdx >= 0) {
        const globalIdx = pastCount + futIdx;
        gX = sx(globalIdx);
        const goalCtlAdj = futurePoints[futIdx]!.ctl + ctlOffset;
        const goalTsbAdj = futurePoints[futIdx]!.tsb + tsbOffset;
        gCtlY = sy(goalCtlAdj);
        gTsbY = sy(goalTsbAdj);
        if (gCTLVal == null) gCTLVal = goalCtlAdj;
        if (gTSBVal == null) gTSBVal = goalTsbAdj;
      } else {
        const lastFut = futurePoints[futurePoints.length - 1];
        if (lastFut) {
          gX = sx(totalPoints - 1);
          gCtlY = sy(lastFut.ctl + ctlOffset);
          gTsbY = sy(lastFut.tsb + tsbOffset);
          if (gCTLVal == null) gCTLVal = lastFut.ctl + ctlOffset;
          if (gTSBVal == null) gTSBVal = lastFut.tsb + tsbOffset;
        }
      }
    }

    const allDates = [...pastDates, ...futurePoints.map((p) => tsToDateStr(p.date))];
    const labelIndices = [
      0,
      Math.floor(totalPoints * 0.25),
      Math.floor(totalPoints * 0.5),
      Math.floor(totalPoints * 0.75),
      totalPoints - 1,
    ].filter((v, i, a) => a.indexOf(v) === i && v >= 0 && v < allDates.length);
    const labels = labelIndices.map((idx) => {
      const d = allDates[idx]!;
      return {
        x: sx(idx),
        text: formatDateLabel(d),
        isToday: d === todayStr,
        isGoal: goalDateStr != null && d === goalDateStr,
      };
    });

    const ticks = niceTicks(yMin, yMax, 5).map((v) => ({ v, y: sy(v) }));

    const seriesData = Array.from({ length: totalPoints }, (_, i) => ({
      x: sx(i),
      dateStr: allDates[i] ?? "",
      ctl: allCTL[i] ?? 0,
      atl: allATL[i] ?? 0,
      tsb: allTSB[i] ?? 0,
      isFuture: i >= pastCount,
    }));

    return {
      ctlPastPath: ctlPast,
      atlPastPath: atlPast,
      tsbPastPath: tsbPast,
      ctlFuturePath: ctlFut,
      atlFuturePath: atlFut,
      tsbFuturePath: tsbFut,
      ctlFillPath: ctlFill,
      todayX: tX,
      todayCtlY: tCtlY,
      goalX: gX,
      goalCtlY: gCtlY,
      goalTsbY: gTsbY,
      goalCTLVal: gCTLVal,
      goalTSBVal: gTSBVal,
      hasFuture: hasFut,
      xLabels: labels,
      yTicks: ticks,
      series: seriesData,
      syFn: sy,
    };
  }, [data, projection, today, goalDate, goalCTL, goalTSB, t]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>
        {t("charts.fitness.noData")}
      </div>
    );
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || series.length === 0) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const localX = pt.matrixTransform(ctm.inverse()).x;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < series.length; i++) {
      const d = Math.abs(series[i]!.x - localX);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    setHoverIdx(best);
  }

  const hover = hoverIdx != null ? series[hoverIdx] : null;
  const tooltipW = 156;
  const tooltipH = 90;
  const tooltipPad = 10;
  const tooltipX = hover
    ? hover.x + tooltipPad + tooltipW > VIEW_W - PAD_RIGHT
      ? hover.x - tooltipPad - tooltipW
      : hover.x + tooltipPad
    : 0;
  const tooltipY = PAD_TOP + 4;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      style={{ width: "100%", height: "auto", maxHeight: 360, display: "block" }}
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={handleMove}
      onPointerLeave={() => setHoverIdx(null)}
    >
      <defs>
        <linearGradient id="ctlFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--lime)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--lime)" stopOpacity="0" />
        </linearGradient>
        {/* 예측 영역 hatch — 토큰화 (테마 교체 시 자동 반영). */}
        <pattern id="projHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--accent-soft-bg)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--lime)" strokeOpacity="0.15" strokeWidth="1" />
        </pattern>
      </defs>

      {/* 범례 — 좌상단 */}
      <g transform={`translate(${PAD_LEFT}, 12)`} fontFamily="var(--font-mono)" fontSize="11">
        {[
          { label: "CTL", color: "var(--lime)", desc: t("charts.fitness.legendFitness") },
          { label: "ATL", color: "var(--rose)", desc: t("charts.fitness.legendFatigue") },
          { label: "TSB", color: "var(--amber)", desc: t("charts.fitness.legendForm") },
        ].map((item, i) => (
          <g key={item.label} transform={`translate(${i * 130}, 0)`}>
            <line x1="0" y1="6" x2="14" y2="6" stroke={item.color} strokeWidth="2.5" />
            <text x="18" y="9" fill="var(--ink-1)" fontWeight="600">{item.label}</text>
            <text x="48" y="9" fill="var(--ink-3)">{item.desc}</text>
          </g>
        ))}
      </g>

      {/* 예측 영역 배경 */}
      {hasFuture && (
        <rect x={todayX} y={PAD_TOP} width={VIEW_W - PAD_RIGHT - todayX} height={PLOT_H} fill="url(#projHatch)" />
      )}

      {/* Y축 grid + tick 값 */}
      {yTicks.map((t) => (
        <g key={t.v}>
          <line
            x1={PAD_LEFT}
            x2={VIEW_W - PAD_RIGHT}
            y1={t.y}
            y2={t.y}
            stroke={t.v === 0 ? "var(--grid-axis)" : "var(--grid-soft)"}
            strokeDasharray={t.v === 0 ? "4 3" : undefined}
          />
          <text
            x={PAD_LEFT - 6}
            y={t.y + 3}
            fontSize="10"
            fontFamily="var(--font-mono)"
            fill="var(--ink-3)"
            textAnchor="end"
          >
            {t.v > 0 ? "+" : ""}{Math.round(t.v)}
          </text>
        </g>
      ))}

      {/* CTL 영역 fill + 라인 (CTL 두꺼움, ATL/TSB opacity 강화) */}
      {ctlFillPath && <path d={ctlFillPath} fill="url(#ctlFill)" />}
      {ctlPastPath && (
        <path d={ctlPastPath} stroke="var(--lime)" strokeWidth="2.4" fill="none" strokeLinejoin="round" />
      )}
      {atlPastPath && (
        <path d={atlPastPath} stroke="var(--rose)" strokeWidth="2" fill="none" opacity="0.95" strokeLinejoin="round" />
      )}
      {tsbPastPath && (
        <path d={tsbPastPath} stroke="var(--amber)" strokeWidth="1.8" fill="none" opacity="0.9" strokeLinejoin="round" />
      )}

      {/* 예측 dashed */}
      {ctlFuturePath && (
        <path d={ctlFuturePath} stroke="var(--lime)" strokeWidth="2.2" fill="none" strokeDasharray="5 3" opacity="0.85" />
      )}
      {atlFuturePath && (
        <path d={atlFuturePath} stroke="var(--rose)" strokeWidth="1.8" fill="none" strokeDasharray="4 3" opacity="0.75" />
      )}
      {tsbFuturePath && (
        <path d={tsbFuturePath} stroke="var(--amber)" strokeWidth="1.6" fill="none" strokeDasharray="4 3" opacity="0.8" />
      )}

      {/* 오늘 마커 */}
      <line x1={todayX} x2={todayX} y1={PAD_TOP} y2={PAD_TOP + PLOT_H}
            stroke="var(--ink-2)" strokeDasharray="3 3" opacity="0.7" />
      <text x={todayX + 6} y={PAD_TOP + 12} fontSize="10" fontFamily="var(--font-mono)"
            fill="var(--ink-1)" fontWeight="600">
        {t("charts.fitness.today")}
      </text>
      <circle cx={todayX} cy={todayCtlY} r="4" fill="var(--lime)" stroke="var(--bg-0)" strokeWidth="2" />

      {/* 목표일 마커 */}
      {hasFuture && goalCTLVal != null && (
        <>
          <line x1={goalX} x2={goalX} y1={PAD_TOP} y2={PAD_TOP + PLOT_H}
                stroke="var(--lime)" strokeWidth="1.5" opacity="0.85" />
          <rect x={goalX - 58} y={PAD_TOP + 2} width="56" height="18" rx="3" fill="var(--lime)" />
          <text x={goalX - 30} y={PAD_TOP + 14} fontSize="10" fontFamily="var(--font-mono)"
                fill="var(--primary-fg)" fontWeight="700" textAnchor="middle">
            {t("charts.fitness.goalDay")}
          </text>
          <circle cx={goalX} cy={goalCtlY} r="5" fill="var(--lime)" stroke="var(--bg-0)" strokeWidth="2" />
          <text x={goalX - 8} y={goalCtlY - 8} fontSize="11" fontFamily="var(--font-mono)"
                fill="var(--lime)" fontWeight="600" textAnchor="end">
            CTL {Math.round(goalCTLVal)}
          </text>
          {goalTSBVal != null && (
            <text x={goalX - 8} y={goalTsbY - 6} fontSize="10" fontFamily="var(--font-mono)"
                  fill="var(--amber)" textAnchor="end">
              TSB {goalTSBVal >= 0 ? "+" : ""}{Math.round(goalTSBVal)}
            </text>
          )}
        </>
      )}

      {/* 호버 십자선 + 도트 + 카드 */}
      {hover && (
        <g pointerEvents="none">
          <line x1={hover.x} x2={hover.x} y1={PAD_TOP} y2={PAD_TOP + PLOT_H}
                stroke="var(--ink-2)" strokeWidth="1" opacity="0.5" strokeDasharray="2 2" />
          <circle cx={hover.x} cy={syFn(hover.ctl)} r="3.5" fill="var(--lime)" stroke="var(--bg-0)" strokeWidth="1.5" />
          <circle cx={hover.x} cy={syFn(hover.atl)} r="3.5" fill="var(--rose)" stroke="var(--bg-0)" strokeWidth="1.5" />
          <circle cx={hover.x} cy={syFn(hover.tsb)} r="3.5" fill="var(--amber)" stroke="var(--bg-0)" strokeWidth="1.5" />

          <rect x={tooltipX} y={tooltipY} width={tooltipW} height={tooltipH} rx="6"
                fill="var(--bg-1)" stroke="var(--line)" strokeWidth="1" opacity="0.98" />
          <text x={tooltipX + 10} y={tooltipY + 16} fontSize="11" fontFamily="var(--font-mono)"
                fill="var(--ink-0)" fontWeight="700">
            {formatDateLabel(hover.dateStr)}{hover.isFuture ? ` · ${t("charts.fitness.forecast")}` : ""}
          </text>
          {([
            ["CTL", hover.ctl, "var(--lime)"],
            ["ATL", hover.atl, "var(--rose)"],
            ["TSB", hover.tsb, "var(--amber)"],
          ] as const).map(([label, v, color], i) => (
            <g key={label} transform={`translate(${tooltipX + 10}, ${tooltipY + 34 + i * 16})`}>
              <circle cx="4" cy="-3" r="3" fill={color} />
              <text x="14" y="0" fontSize="10" fontFamily="var(--font-mono)" fill="var(--ink-2)">{label}</text>
              <text x={tooltipW - 20} y="0" fontSize="11" fontFamily="var(--font-mono)" fill={color}
                    fontWeight="700" textAnchor="end">
                {v >= 0 && label === "TSB" ? "+" : ""}{v.toFixed(1)}
              </text>
            </g>
          ))}
        </g>
      )}

      {/* X축 레이블 */}
      {xLabels.map((lbl, i) => (
        <text
          key={i}
          x={lbl.x}
          y={PAD_TOP + PLOT_H + 16}
          fontSize="10"
          fontFamily="var(--font-mono)"
          fill={lbl.isToday || lbl.isGoal ? "var(--lime)" : "var(--ink-3)"}
          fontWeight={lbl.isToday || lbl.isGoal ? 600 : 400}
          textAnchor="middle"
        >
          {lbl.text}
        </text>
      ))}
    </svg>
  );
}
