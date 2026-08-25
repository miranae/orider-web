/**
 * 모바일 피트니스 페이지.
 *
 * 개요 탭: PMC 링 + 60일 PMC 추이 + 주간 TSS(4주)
 * 분석 탭(종목별):
 *   - bike: FTP + 파워존 분포(스트림 기반) + 파워 커브 + 존 정의
 *   - run:  임계 페이스 + HR 존 분포 + 존 정의
 *   - swim: CSS + (HR 존 분포 가능 시)
 *
 * 모든 데이터는 FitnessPage 가 미리 계산해 props 로 전달.
 */
import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import SportFilterTabs from "./SportFilterTabs";
import { getDisciplineColor } from "../../utils/disciplineFilter";
import type { Discipline } from "../../utils/disciplineFilter";
import { Text } from "../../theme/components";
import type { ConsistencyStreakSummary } from "../../utils/consistencyStreak";
import ConsistencyStreakCard from "../training/ConsistencyStreakCard";
import type { BikeThresholdDecision } from "@shared/training/bikeThresholdDecision";
import type { EstimatedFtpPoint } from "@shared/training/ftpProgression";
import type { FtpHistoryEntry } from "@shared/training/ftpHistory";
import type { BikeThresholdDecisionV2, FtpDeviceReceipt, FtpMutationReceipt } from "@shared/types/threshold";
import type { CyclingAbilityResult, LoadFocusResult, RunEvidence, SwimEvidence } from "../../features/fitness/multisportPerformance";
import IntegratedLoadCard, { type CombinedLoadStatus } from "./IntegratedLoadCard";
import SportPerformanceCard from "./SportPerformanceCard";
import BikePerformanceSummaryCard, { type MobileFitnessPdcSummary } from "./BikePerformanceSummaryCard";
import { PMC_FUTURE_OPACITY, PMC_LINE_PALETTE } from "../../features/fitness/chartPalette";

export type ZoneSource = "power" | "hr" | "none";

export interface MobileFitnessZone {
  name: string;
  pct: number;
  color: string;
  rangeLabel: string;     // "< 110 W" 또는 "60–70% maxHR"
  percentLabel: string;   // "~55%" / "60–70%"
}

export interface MobilePowerCurvePoint {
  durationSeconds: number;
  maxPower: number;
}

export interface MobileFitnessPmcPoint { ctl: number; atl: number; tsb: number; date?: string; /* YYYY-MM-DD */ }
export interface MobileFitnessProjPoint { date: number; ctl: number; atl: number; tsb: number; /* ms timestamp */ }

export interface MobileFitnessThreshold {
  label: string;     // "FTP" / "임계 페이스" / "CSS"
  value: string;     // "245" / "4:25" / "1:35"
  unit: string;      // "W" / "/km" / "/100m"
  sub: string;       // 부연
}

export interface MobileFitnessData {
  // PMC
  ctl: number; atl: number; tsb: number;
  pmcHistory: MobileFitnessPmcPoint[];  // 오래된 → 최신
  pmcProjection?: MobileFitnessProjPoint[] | null;  // 미래 예측 (있을 때만)
  today?: string;                       // YYYY-MM-DD (오늘 마커용)
  // 주간 TSS
  weeklyTSS: number[];   // 오래된 → 최신 (최근 4주)
  thisWeekTSS: number;
  avgWeekTSS: number;
  restDays: number;
  // 임계값 (종목별)
  threshold: MobileFitnessThreshold | null;
  // bike 핵심 상태/역량 표시용 프로필 값.
  ftp?: number;
  weightKg?: number;
  hasLoadData: boolean;
  pdcSummary?: MobileFitnessPdcSummary | null;
  combinedLoad?: CombinedLoadStatus | null;
  loadFocus: LoadFocusResult;
  cyclingAbility: CyclingAbilityResult | null;
  runEvidence: RunEvidence;
  swimEvidence: SwimEvidence;
  // 존 분포
  zones: MobileFitnessZone[];
  zoneSource: ZoneSource;
  // 파워 커브 (bike, 있을 때만)
  powerCurve?: MobilePowerCurvePoint[];
  ftpProgression?: EstimatedFtpPoint[];
  ftpHistory?: FtpHistoryEntry[];
  thresholdDecision?: BikeThresholdDecision;
  // 디스플레이용 종목 키 (탭 라벨/색상 결정)
  discipline: "bike" | "run" | "swim" | "tri";
}

// ── PMC 추이 미니 차트 (Y축·X축 라벨, 오늘 마커, 예측, 탭 툴팁) ──
function niceTicks(min: number, max: number, count = 4): number[] {
  if (max <= min) return [min];
  const range = max - min;
  const step0 = range / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

function formatMd(dateStr?: string): string {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  return m && d ? `${parseInt(m)}/${parseInt(d)}` : dateStr;
}

function PmcMiniChart({ history, projection, today, ctlColor, ctlLabel, ariaLabel, t }: {
  history: MobileFitnessPmcPoint[];
  projection?: MobileFitnessProjPoint[] | null;
  today?: string;
  ctlColor: string;
  ctlLabel: string;
  ariaLabel: string;
  t: (key: string) => string;
}) {
  const [tapIdx, setTapIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (history.length < 2) {
    return (
      <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontSize: "var(--fs-xs)" }}>
        {t("mobileFitness.pmcNoData")}
      </div>
    );
  }

  // 캔버스 + 여백
  const W = 360, H = 210;
  const PAD_L = 26, PAD_R = 8, PAD_T = 10, PAD_B = 22;
  const PLOT_W = W - PAD_L - PAD_R, PLOT_H = H - PAD_T - PAD_B;

  // 과거 + 미래 시계열 정합 (FitnessChart 의 seed offset 동작 포팅)
  const pastCTL = history.map(p => p.ctl);
  const pastATL = history.map(p => p.atl);
  const pastTSB = history.map(p => p.tsb);
  const pastDates = history.map(p => p.date ?? "");

  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  const lastPastDate = pastDates[pastDates.length - 1] ?? "";

  // 예측: 오늘 이후로 필터, 첫 점이 과거 마지막과 어긋나면 평행이동.
  const tsToDateStr = (ms: number) => Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "";
  const fut = (projection ?? []).filter(p => tsToDateStr(p.date) > lastPastDate);
  const hasFut = fut.length > 0;
  const ctlOff = hasFut ? (pastCTL[pastCTL.length - 1] ?? 0) - fut[0]!.ctl : 0;
  const atlOff = hasFut ? (pastATL[pastATL.length - 1] ?? 0) - fut[0]!.atl : 0;
  const tsbOff = hasFut ? (pastTSB[pastTSB.length - 1] ?? 0) - fut[0]!.tsb : 0;

  const allCTL = [...pastCTL, ...fut.map(p => p.ctl + ctlOff)];
  const allATL = [...pastATL, ...fut.map(p => p.atl + atlOff)];
  const allTSB = [...pastTSB, ...fut.map(p => p.tsb + tsbOff)];
  const allDates = [...pastDates, ...fut.map(p => tsToDateStr(p.date))];
  const pastCount = pastCTL.length;
  const total = allCTL.length;

  // Y 스케일 (자동 + 패딩)
  const all = [...allCTL, ...allATL, ...allTSB];
  const dataMax = Math.max(...all, 10);
  const dataMin = Math.min(...all, -5);
  const pad = (dataMax - dataMin) * 0.1;
  const yMax = dataMax + pad, yMin = dataMin - pad;

  const sx = (i: number) => PAD_L + (i / Math.max(1, total - 1)) * PLOT_W;
  const sy = (v: number) => PAD_T + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;
  const zeroY = sy(0);

  const lineSeg = (arr: number[], from: number, count: number) =>
    arr.slice(from, from + count).map((v, i) => `${i ? "L" : "M"}${sx(from + i).toFixed(1)} ${sy(v).toFixed(1)}`).join(" ");

  const ctlPast = lineSeg(allCTL, 0, pastCount);
  const atlPast = lineSeg(allATL, 0, pastCount);
  const tsbPast = lineSeg(allTSB, 0, pastCount);
  const ctlFut = hasFut ? lineSeg(allCTL, pastCount - 1, fut.length + 1) : "";
  const atlFut = hasFut ? lineSeg(allATL, pastCount - 1, fut.length + 1) : "";
  const tsbFut = hasFut ? lineSeg(allTSB, pastCount - 1, fut.length + 1) : "";
  const ctlFill = `M${sx(0).toFixed(1)} ${(PAD_T + PLOT_H).toFixed(1)} ${ctlPast.replace(/^M/, "L")} L${sx(pastCount - 1).toFixed(1)} ${(PAD_T + PLOT_H).toFixed(1)} Z`;

  // 오늘 마커 + 예측 영역
  const todayIdx = pastCount - 1;
  const todayX = sx(todayIdx);
  const todayCtlY = sy(pastCTL[pastCount - 1] ?? 0);

  // Y 눈금
  const yTicks = niceTicks(yMin, yMax, 4);

  // X 날짜 라벨 (3개: 시작/중간/끝)
  const labelIdx = [0, Math.floor(total / 2), total - 1].filter((v, i, a) => a.indexOf(v) === i && v >= 0 && v < total);
  const xLabels = labelIdx.map(idx => ({ x: sx(idx), text: formatMd(allDates[idx]), isToday: allDates[idx] === todayStr }));

  // 탭 툴팁 처리
  const handleTap = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current; if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const px = ratio * W;
    // 가장 가까운 인덱스
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < total; i++) {
      const dx = Math.abs(sx(i) - px);
      if (dx < bestDist) { bestDist = dx; best = i; }
    }
    setTapIdx(best);
  };

  const tip = tapIdx != null ? {
    x: sx(tapIdx), date: allDates[tapIdx], ctl: allCTL[tapIdx]!, atl: allATL[tapIdx]!, tsb: allTSB[tapIdx]!,
    isFuture: tapIdx >= pastCount,
  } : null;

  return (
    <div
      data-pmc-chart
      role="img"
      aria-label={ariaLabel}
      style={{ position: "relative", width: "100%", aspectRatio: `${W} / ${H}` }}
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", touchAction: "manipulation" }}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handleTap} onPointerMove={(e) => { if (e.buttons & 1) handleTap(e); }} onPointerLeave={() => setTapIdx(null)}>
        <defs>
          <linearGradient id="mobPmcCtlFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={ctlColor} stopOpacity="0.22" />
            <stop offset="1" stopColor={ctlColor} stopOpacity="0" />
          </linearGradient>
          <pattern id="mobPmcFutHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-3)" strokeOpacity="0.10" strokeWidth="1" />
          </pattern>
        </defs>

        {/* Y 눈금 */}
        {yTicks.map((v) => (
          <line key={v} x1={PAD_L} x2={W - PAD_R} y1={sy(v)} y2={sy(v)} stroke="var(--line-soft)" strokeOpacity="0.5" />
        ))}
        {/* TSB 0 기준선 */}
        {zeroY > PAD_T && zeroY < PAD_T + PLOT_H && (
          <line x1={PAD_L} x2={W - PAD_R} y1={zeroY} y2={zeroY} stroke="var(--ink-3)" strokeDasharray="3 3" opacity="0.4" />
        )}

        {/* 예측 영역(해치) */}
        {hasFut && (
          <rect x={todayX} y={PAD_T} width={W - PAD_R - todayX} height={PLOT_H} fill="url(#mobPmcFutHatch)" />
        )}

        {/* CTL 영역 채움 (과거만) */}
        <path d={ctlFill} fill="url(#mobPmcCtlFill)" />

        {/* TSB → ATL → CTL (zorder: CTL 가장 위) */}
        <path d={tsbPast} stroke={PMC_LINE_PALETTE.tsb.color} strokeWidth={PMC_LINE_PALETTE.tsb.strokeWidth} strokeDasharray={PMC_LINE_PALETTE.tsb.dasharray} strokeLinecap={PMC_LINE_PALETTE.tsb.linecap} vectorEffect="non-scaling-stroke" fill="none" />
        <path d={atlPast} stroke={PMC_LINE_PALETTE.atl.color} strokeWidth={PMC_LINE_PALETTE.atl.strokeWidth} strokeDasharray={PMC_LINE_PALETTE.atl.dasharray} strokeLinecap={PMC_LINE_PALETTE.atl.linecap} vectorEffect="non-scaling-stroke" fill="none" />
        <path d={ctlPast} stroke={ctlColor} strokeWidth={PMC_LINE_PALETTE.ctl.strokeWidth} strokeLinecap={PMC_LINE_PALETTE.ctl.linecap} vectorEffect="non-scaling-stroke" fill="none" />
        {hasFut && (
          <>
            <path d={tsbFut} stroke={PMC_LINE_PALETTE.tsb.color} strokeWidth={PMC_LINE_PALETTE.tsb.strokeWidth} strokeDasharray={PMC_LINE_PALETTE.tsb.dasharray} strokeLinecap={PMC_LINE_PALETTE.tsb.linecap} vectorEffect="non-scaling-stroke" fill="none" opacity={PMC_FUTURE_OPACITY} />
            <path d={atlFut} stroke={PMC_LINE_PALETTE.atl.color} strokeWidth={PMC_LINE_PALETTE.atl.strokeWidth} strokeDasharray={PMC_LINE_PALETTE.atl.dasharray} strokeLinecap={PMC_LINE_PALETTE.atl.linecap} vectorEffect="non-scaling-stroke" fill="none" opacity={PMC_FUTURE_OPACITY} />
            <path d={ctlFut} stroke={ctlColor} strokeWidth={PMC_LINE_PALETTE.ctl.strokeWidth} strokeLinecap={PMC_LINE_PALETTE.ctl.linecap} vectorEffect="non-scaling-stroke" fill="none" opacity={PMC_FUTURE_OPACITY} />
          </>
        )}

        {/* 오늘 + 탭 마커 */}
        <line x1={todayX} x2={todayX} y1={PAD_T} y2={PAD_T + PLOT_H} stroke="var(--ink-2)" strokeDasharray="2 2" opacity="0.55" />
        <circle cx={todayX} cy={todayCtlY} r="3.5" fill={ctlColor} stroke="var(--bg-0)" strokeWidth="1.5" />
        {tip && <line x1={tip.x} x2={tip.x} y1={PAD_T} y2={PAD_T + PLOT_H} stroke="var(--ink-1)" strokeWidth="1" opacity="0.7" />}
      </svg>

      <div data-pmc-axis-labels style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {yTicks.map((v) => (
          <span key={v} style={{
            position: "absolute", left: `${(PAD_L / W) * 100}%`, top: `${(sy(v) / H) * 100}%`,
            transform: "translate(calc(-100% - var(--space-0-5)), -50%)", color: "var(--ink-4)", fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-xs)", fontWeight: 500, fontVariantNumeric: "tabular-nums", lineHeight: 1,
          }}>{Math.round(v)}</span>
        ))}
        {xLabels.map((l, i) => (
          <span key={i} style={{
            position: "absolute", left: `${(l.x / W) * 100}%`, top: `${((H - 6) / H) * 100}%`,
            transform: `translate(${i === 0 ? "0" : i === xLabels.length - 1 ? "-100%" : "-50%"}, -100%)`,
            color: l.isToday ? "var(--ink-1)" : "var(--ink-4)", fontSize: "var(--fs-xs)", fontWeight: 500,
            lineHeight: 1, whiteSpace: "nowrap",
          }}>{l.text}{l.isToday ? t("mobileFitness.pmcLabelToday") : ""}</span>
        ))}
      </div>

      {tip && (
        <div data-pmc-tooltip style={{
          position: "absolute", left: `${(tip.x / W) * 100}%`, top: `${((PAD_T + 2) / H) * 100}%`,
          transform: tip.x > W / 2 ? "translateX(calc(-100% - var(--space-1-5)))" : "translateX(var(--space-1-5))",
          width: "max-content", minWidth: "calc(var(--space-8) * 2 + var(--space-4))", maxWidth: "calc(100vw - var(--space-8))",
          padding: "var(--space-1)", borderRadius: "var(--r-sm)", pointerEvents: "none",
          background: "var(--bg-2)", border: "1px solid var(--line-soft)", boxSizing: "border-box",
          fontSize: "var(--fs-xs)", fontWeight: 500, lineHeight: 1.1,
        }}>
          <div style={{ color: "var(--ink-3)", whiteSpace: "nowrap" }}>
            {formatMd(tip.date)}{tip.isFuture ? t("mobileFitness.pmcLabelForecast") : ""}
          </div>
          <div data-pmc-tooltip-metric="CTL" style={{ color: ctlColor, fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <PmcLegendSample color={ctlColor} linecap={PMC_LINE_PALETTE.ctl.linecap} />
            <span>{ctlLabel} {tip.ctl.toFixed(0)}</span>
          </div>
          <div data-pmc-tooltip-metric="ATL" style={{ color: PMC_LINE_PALETTE.atl.color, fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <PmcLegendSample color={PMC_LINE_PALETTE.atl.color} dasharray={PMC_LINE_PALETTE.atl.dasharray} linecap={PMC_LINE_PALETTE.atl.linecap} />
            <span>ATL {tip.atl.toFixed(0)}</span>
          </div>
          <div data-pmc-tooltip-metric="TSB" style={{ color: PMC_LINE_PALETTE.tsb.color, fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <PmcLegendSample color={PMC_LINE_PALETTE.tsb.color} dasharray={PMC_LINE_PALETTE.tsb.dasharray} linecap={PMC_LINE_PALETTE.tsb.linecap} />
            <span>TSB {tip.tsb >= 0 ? "+" : ""}{tip.tsb.toFixed(0)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PmcLegendSample({ color, dasharray, linecap }: { color: string; dasharray?: string; linecap?: "butt" | "round" }) {
  return (
    <svg data-pmc-legend-sample width="14" height="6" viewBox="0 0 14 6" aria-hidden="true" style={{ display: "block", flex: "0 0 auto" }}>
      <line x1="0" y1="3" x2="14" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dasharray} strokeLinecap={linecap} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ── 주간 TSS 막대 ──────────────────────────────────────────────
function WeeklyTssBars({
  values,
  color,
  t,
}: {
  values: number[];
  color: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const max = Math.max(1, ...values);
  // #400 §8: "−3/−2/−1" 상대 인덱스 대신 사람이 바로 읽을 수 있는 "N주 전/지난주/이번 주".
  const labels = values.map((_, i, arr) => {
    if (i === arr.length - 1) return t("mobileFitness.weeklyTssThisWeek");
    const weeksAgo = arr.length - 1 - i;
    if (weeksAgo === 1) return t("fitness:mobile.week.lastWeek");
    return t("fitness:mobile.week.nWeeksAgo", { n: weeksAgo });
  });
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(values.length, 1)}, 1fr)`, gap: "var(--space-2)", alignItems: "end" }}>
      {values.map((v, i) => {
        const h = Math.round((v / max) * 70);
        const isCurrentWeek = i === values.length - 1;
        return (
          <div
            key={i}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-1)",
            }}
          >
            <div className="text-[length:var(--fs-xs)]" style={{ fontFamily: "var(--font-mono)", color: isCurrentWeek ? "var(--ink-0)" : "var(--ink-2)", fontWeight: isCurrentWeek ? 600 : 400 }}>{Math.round(v)}</div>
            <div style={{ width: "100%", height: 70, display: "flex", alignItems: "end" }}>
              {/* borderRadius 3px: --r-sm(4px) 보다 작은 미니 막대 전용 — 토큰 없음, 시각 동일 위해 리터럴 유지 */}
              <div style={{ width: "100%", height: `${h}px`, minHeight: v > 0 ? 4 : 0, background: isCurrentWeek ? color : "var(--bg-3)", borderRadius: "var(--r-xs)" }} />
            </div>
            <div className="text-[length:var(--fs-xs)]" style={{ color: isCurrentWeek ? "var(--ink-2)" : "var(--ink-4)", fontWeight: isCurrentWeek ? 600 : 400 }}>{labels[i] ?? ""}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── 파워 커브 미니 ─────────────────────────────────────────────
function PowerCurveMini({ points, color, ariaLabel }: { points: MobilePowerCurvePoint[]; color: string; ariaLabel: string }) {
  if (!points || points.length < 2) return null;
  // 기존 340×150 밀도를 유지하고, plot 높이 안에서 HTML 축 라벨 공간을 확보한다.
  const W = 340, H = 150;
  const PAD_X = 8, PAD_TOP = 10, PAD_BOTTOM = 24;
  const baselineY = H - PAD_BOTTOM;
  const xMin = Math.log10(Math.max(1, points[0]!.durationSeconds));
  const xMax = Math.log10(points[points.length - 1]!.durationSeconds);
  const yMax = Math.max(...points.map(p => p.maxPower)) * 1.05;
  const sx = (d: number) => PAD_X + ((W - PAD_X * 2) * (Math.log10(Math.max(1, d)) - xMin)) / Math.max(0.0001, xMax - xMin);
  const sy = (p: number) => PAD_TOP + (baselineY - PAD_TOP) * (1 - p / Math.max(1, yMax));
  const linePath = points.map((p, i) => `${i ? "L" : "M"}${sx(p.durationSeconds).toFixed(1)} ${sy(p.maxPower).toFixed(1)}`).join(" ");
  const fillPath = `${linePath} L${sx(points[points.length - 1]!.durationSeconds).toFixed(1)} ${baselineY} L${sx(points[0]!.durationSeconds).toFixed(1)} ${baselineY} Z`;
  const ticks = [5, 60, 300, 1200, 3600];
  const tickLabels: Record<number, string> = { 5: "5s", 60: "1m", 300: "5m", 1200: "20m", 3600: "1h" };
  const visibleTicks = ticks.filter(t => t >= points[0]!.durationSeconds && t <= points[points.length - 1]!.durationSeconds);
  return (
    <div
      data-power-curve-chart
      role="img"
      aria-label={ariaLabel}
      style={{ position: "relative", width: "100%", maxWidth: "100%", aspectRatio: `${W} / ${H}`, overflow: "hidden" }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
      >
        <defs>
          <linearGradient id="mobPcFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.2" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {visibleTicks.map((tick) => (
          <line key={tick} x1={sx(tick)} x2={sx(tick)} y1={PAD_TOP} y2={baselineY} stroke="var(--line-soft)" strokeDasharray="2 3" />
        ))}
        <line x1={PAD_X} x2={W - PAD_X} y1={baselineY} y2={baselineY} stroke="var(--line-soft)" />
        <path d={fillPath} fill="url(#mobPcFill)" />
        <path d={linePath} stroke={color} strokeWidth="1.8" fill="none" />
        {ticks.map(tick => {
          const point = points.find(point => point.durationSeconds === tick);
          if (!point) return null;
          return <circle key={tick} cx={sx(point.durationSeconds)} cy={sy(point.maxPower)} r="3" fill={color} />;
        })}
      </svg>
      <div data-power-curve-axis-labels aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-4)" }}>
        <span style={{ position: "absolute", top: 0, left: 0 }}>{Math.round(yMax)} W</span>
        {visibleTicks.map((tick) => {
          const leftPct = (sx(tick) / W) * 100;
          const transform = leftPct <= 5 ? "none" : leftPct >= 95 ? "translateX(-100%)" : "translateX(-50%)";
          return (
            <span
              key={tick}
              style={{ position: "absolute", left: `${leftPct}%`, top: `${((baselineY + 8) / H) * 100}%`, transform, whiteSpace: "nowrap" }}
            >
              {tickLabels[tick]}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── 카드 컨테이너 ─────────────────────────────────────────────
function SectionCard({ children, title, sub, accentColor }: { children: React.ReactNode; title?: string; sub?: string; accentColor?: string }) {
  // 모바일은 화면이 좁아 모든 카드를 화면 전폭으로 쓴다(섹션 스타일). Layout 컨텐츠 래퍼
  // (max-w mx-auto px-4 = 좌우 16px) 인셋을 음수 마진(-16)으로 상쇄해 좌우 끝까지 채우고,
  // 좌우 border·radius 는 제거하고 상하 구분선만 둔다. 콘텐츠는 좌우 16px padding 으로 가독성 유지.
  return (
    <div style={{
      margin: "0 -16px 12px",
      background: "var(--bg-1)",
      borderTop: accentColor ? `var(--space-0-5) solid ${accentColor}` : "1px solid var(--line-soft)",
      borderBottom: "1px solid var(--line-soft)",
      padding: "12px 16px",
    }}>
      {(title || sub) && (
        <div style={{ marginBottom: "var(--space-2)" }}>
          {title && <Text variant="eyebrow">{title}</Text>}
          {sub && <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-1)" }}>{sub}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────
export default function MobileFitnessPage({
  data,
  consistencyStreak = null,
  ftpDecision = null,
  ftpReceipt = null,
  ftpDeviceReceipts = [],
  decisionBusy = false,
  onAcceptDecision = () => undefined,
  embedded = false,
}: {
  data: MobileFitnessData;
  consistencyStreak?: ConsistencyStreakSummary | null;
  ftpDecision?: BikeThresholdDecisionV2 | null;
  ftpReceipt?: FtpMutationReceipt | null;
  ftpDeviceReceipts?: FtpDeviceReceipt[];
  decisionBusy?: boolean;
  onAcceptDecision?: () => void;
  /** Native host already owns the surface title and bottom navigation chrome. */
  embedded?: boolean;
}) {
  const { t } = useTranslation("dashboard");
  const [tab, setTab] = useState<"overview" | "analysis">("overview");
  useEffect(() => {
    setTab("overview");
  }, [data.discipline]);
  // sportSegment 는 URL ?sport= 와 양방향 바인딩 — 탭 클릭 시 URL 갱신 →
  // FitnessPage 가 discipline 별 데이터(PMC/존/임계값/최근활동/파워커브)를 재계산해
  // props 로 다시 흘려준다. URL 동기화 없이 로컬 state 만 바꾸면 데이터가 안 바뀌어
  // "탭 눌러도 화면이 그대로" 회귀가 발생한다.
  const [searchParams, setSearchParams] = useSearchParams();
  // 화면 표시용 — URL "tri" 는 탭 "all" 로, 없으면 URL 기본인 bike 와 정합.
  const urlSport = searchParams.get("sport") ?? "bike";
  const sportSegment = urlSport === "tri" ? "all" : urlSport;
  const setSportSegment = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("sport", v === "all" ? "tri" : v);
    setSearchParams(next, { replace: true });
  };
  const ringColor = data.discipline === "bike"
    ? getDisciplineColor("bike")
    : getDisciplineColor(data.discipline as Discipline);
  const pmcCtlColor = data.discipline === "tri" ? PMC_LINE_PALETTE.ctl.color : ringColor;
  const weeklyLoadColor = data.discipline === "tri" ? PMC_LINE_PALETTE.ctl.color : ringColor;
  const pmcTitle = t(`mobileFitness.pmcByDiscipline.${data.discipline}.title`, { n: data.pmcHistory.length });
  const pmcSub = t(`mobileFitness.pmcByDiscipline.${data.discipline}.sub`);
  const pmcCtlLabel = t(`mobileFitness.pmcByDiscipline.${data.discipline}.ctlLabel`);

  const analysisTabLabel = data.discipline === "bike"
    ? t("mobileFitness.tabZonesBike")
    : data.discipline === "run"
    ? t("mobileFitness.tabZonesRun")
    : t("mobileFitness.tabZonesSwim");
  const topTabs = ["overview", "analysis"] as const;
  const activeTab = data.discipline === "tri" ? "overview" : tab;

  const isBike = data.discipline === "bike";
  const showZones = data.zones.length > 0;
  const powerCurveMaxW = data.powerCurve?.length
    ? Math.round(Math.max(...data.powerCurve.map(point => point.maxPower)))
    : 0;
  const powerCurveTitle = t("mobileFitness.powerCurveTitle");
  const powerCurveSub = t("mobileFitness.powerCurveSub", { maxW: powerCurveMaxW });

  return (
    <div>
      {!embedded && (
        <div className="flex items-center sticky top-0 z-10"
          style={{ height: 52, background: "var(--bg-1)", borderBottom: "1px solid var(--line-soft)", padding: "0 16px", gap: "var(--space-2)" }}>
          <span style={{ fontSize: "var(--fs-base)", fontWeight: 700, color: "var(--ink-0)", letterSpacing: "-0.02em" }}>{t("mobileFitness.title")}</span>
        </div>
      )}

      <SportFilterTabs value={sportSegment} onChange={setSportSegment} allLabelKey="discipline.tri" />

      {/* 통합 화면은 단일 개요이므로 종목별 개요/분석 탭을 노출하지 않는다. */}
      {data.discipline !== "tri" && (
        <div className="flex" role="tablist" style={{ borderBottom: "1px solid var(--line-soft)", background: "var(--bg-1)" }}>
          {topTabs.map((k) => {
            const label = k === "overview" ? t("mobileFitness.tabOverview") : analysisTabLabel;
            const active = activeTab === k;
            return (
              <button key={k} onClick={() => setTab(k)}
                role="tab"
                aria-selected={active}
                className="flex-1 flex items-center justify-center relative"
                style={{ padding: "12px 0", fontSize: "var(--fs-sm)", fontWeight: 500, minHeight: 44,
                  color: active ? "var(--ink-0)" : "var(--ink-3)", background: "none", border: "none", cursor: "pointer" }}>
                {label}
                {active && <div style={{ position: "absolute", bottom: 0, left: 16, right: 16, height: 2, background: "var(--lime)", borderRadius: "2px 2px 0 0" }} />}
              </button>
            );
          })}
        </div>
      )}

      {activeTab === "overview" && (
        <div style={{ paddingTop: 14 }}>
          {data.discipline === "bike" && (
            <BikePerformanceSummaryCard
              decision={data.thresholdDecision}
              pdc={data.pdcSummary}
              weightKg={data.weightKg}
              progression={data.ftpProgression}
              ftpHistory={data.ftpHistory}
              // 임베드 표면은 FTP 결정을 쓰기(수락)하지 않는다 — 결정을 넘기지 않으면
              // 패널이 렌더되지 않아 액션 자체가 노출되지 않는다.
              ftpDecision={embedded ? null : ftpDecision}
              ftpReceipt={ftpReceipt}
              ftpDeviceReceipts={ftpDeviceReceipts}
              decisionBusy={decisionBusy}
              onAcceptDecision={onAcceptDecision}
            />
          )}

          {data.discipline === "tri" && data.combinedLoad && (
            <div style={{ marginBottom: "var(--space-3)" }}>
              <IntegratedLoadCard combined={data.combinedLoad} focus={data.loadFocus} />
            </div>
          )}

          {data.discipline !== "tri" && (
            <div style={{ marginBottom: "var(--space-3)" }}>
              <SportPerformanceCard
                discipline={data.discipline}
                cycling={data.cyclingAbility}
                run={data.runEvidence}
                swim={data.swimEvidence}
              />
            </div>
          )}

          {data.discipline !== "tri" && consistencyStreak && (
            <div style={{ padding: "0 14px 14px" }}>
              <ConsistencyStreakCard summary={consistencyStreak} compact />
            </div>
          )}

          {/* IntegratedLoadCard는 현재 snapshot/기여도/포커스, PMC는 시간 추이만 담당한다. */}
          <SectionCard title={pmcTitle} sub={pmcSub} accentColor={pmcCtlColor}>
            {/* 전폭 카드 안에서 카드 좌우 padding(16)을 상쇄해 차트를 화면 끝까지 채운다.
                제목/범례는 카드 padding 인셋 유지. */}
            <div style={{ margin: "0 -16px" }}>
              <PmcMiniChart history={data.pmcHistory} projection={data.pmcProjection} today={data.today} ctlColor={pmcCtlColor} ctlLabel={pmcCtlLabel} ariaLabel={`${pmcTitle}. ${pmcSub}`} t={t} />
            </div>
            <div style={{ marginTop: "var(--space-1-5)", fontSize: "var(--fs-xs)", color: "var(--ink-4)", display: "flex", gap: "var(--space-3)" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
                <PmcLegendSample color={pmcCtlColor} linecap={PMC_LINE_PALETTE.ctl.linecap} />{pmcCtlLabel}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
                <PmcLegendSample color={PMC_LINE_PALETTE.atl.color} dasharray={PMC_LINE_PALETTE.atl.dasharray} linecap={PMC_LINE_PALETTE.atl.linecap} />ATL
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
                <PmcLegendSample color={PMC_LINE_PALETTE.tsb.color} dasharray={PMC_LINE_PALETTE.tsb.dasharray} linecap={PMC_LINE_PALETTE.tsb.linecap} />TSB
              </span>
            </div>
          </SectionCard>

          {/* 주간 TSS */}
          {data.weeklyTSS.length > 0 && (
            <SectionCard title={t("mobileFitness.weeklyLoadTitle")} sub={t("mobileFitness.weeklyLoadSub", { thisWeek: data.thisWeekTSS, avg: data.avgWeekTSS, restDays: data.restDays })}>
              <WeeklyTssBars values={data.weeklyTSS} color={weeklyLoadColor} t={t} />
            </SectionCard>
          )}

        </div>
      )}

      {activeTab === "analysis" && (
        <div style={{ paddingTop: 14 }}>
          {/* 임계값 카드 */}
          {data.threshold && !isBike && (
            <SectionCard>
              <Text variant="eyebrow">{data.threshold.label}</Text>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-3xl)", fontWeight: 600, color: "var(--ink-0)", letterSpacing: "-0.03em", marginTop: "var(--space-1)" }}>
                {data.threshold.value || "—"}
                {data.threshold.unit && <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", marginLeft: "var(--space-1)" }}>{data.threshold.unit}</span>}
              </div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-1)" }}>{data.threshold.sub}</div>
            </SectionCard>
          )}

          {/* 존 분포 */}
          {showZones && (
            <SectionCard
              title={isBike ? t("mobileFitness.zonePowerTitle") : t("mobileFitness.zoneHrTitle")}
              sub={
                data.zoneSource === "power" ? t("mobileFitness.zoneSourcePower") :
                data.zoneSource === "hr" ? (isBike ? t("mobileFitness.zoneSourceHrBike") : t("mobileFitness.zoneSourceHrRun")) :
                t("mobileFitness.zoneSourceNone")
              }>
              {data.zones.map((z, i) => (
                <div key={i} className="flex items-center gap-2" style={{ padding: "6px 0" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-4)", width: 18, textAlign: "right" }}>Z{i + 1}</div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", width: 60 }}>{z.name}</div>
                  <div style={{ flex: 1, height: 18, background: "var(--bg-3)", borderRadius: "var(--r-xs)", overflow: "hidden" }}>
                    <div style={{ width: `${z.pct}%`, height: "100%", background: z.color, borderRadius: "var(--r-xs)" }} />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-2)", width: 36, textAlign: "right" }}>{z.pct}%</div>
                </div>
              ))}
            </SectionCard>
          )}

          {/* 파워 커브 (bike) */}
          {isBike && data.powerCurve && data.powerCurve.length >= 2 && (
            <SectionCard>
              <div data-power-curve-copy style={{ marginBottom: "var(--space-2)" }}>
                <Text variant="eyebrow">{powerCurveTitle}</Text>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-1)" }}>{powerCurveSub}</div>
              </div>
              <div
                data-power-curve-visual
                style={{ margin: "0 -16px", overflow: "hidden" }}
              >
                <PowerCurveMini points={data.powerCurve} color={ringColor} ariaLabel={`${powerCurveTitle}. ${powerCurveSub}`} />
              </div>
            </SectionCard>
          )}

          {/* 존 정의 */}
          {showZones && (
            <SectionCard title={t("mobileFitness.zoneDefsSectionTitle")}>
              {data.zones.map((z, i) => (
                <div key={i} className="flex items-center" style={{ padding: "8px 0", borderBottom: i < data.zones.length - 1 ? "1px solid var(--line-soft)" : "none", gap: "var(--space-3)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-3)", width: 20 }}>Z{i + 1}</span>
                  <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-0)", flex: 1 }}>{z.name}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}>{z.rangeLabel}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-4)", width: 60, textAlign: "right" }}>{z.percentLabel}</span>
                </div>
              ))}
            </SectionCard>
          )}

          {!showZones && !data.threshold && (
            <div style={{ padding: "var(--space-8) var(--space-4)", textAlign: "center", fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
              {t("mobileFitness.analysisInsufficient")}
            </div>
          )}
        </div>
      )}

      {!embedded && <div style={{ height: 80 }} />}
    </div>
  );
}
