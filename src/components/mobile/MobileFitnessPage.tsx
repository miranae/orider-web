import type { FitnessTimeseriesDoc } from "@shared/types/fitness-timeseries";
import { isSportUiEnabled } from "../../config/sportFeatures";
import CriticalPaceCurve from "../charts/CriticalPaceCurve";
import type { CurvePeriods, RunPacePoint } from "../../features/fitness/fitnessCurveDocuments";
import ConditionSectionNav from "../../features/fitness/components/ConditionSectionNav";
import { FitnessZoneDistributions, type FitnessZoneEvidence } from "../../features/fitness/components/FitnessZoneDistributions";
import type { NativePowerLoadedActivity } from "../../features/fitness/components/NativePowerTwelvePersonalView";
import { FitnessEvidenceTrend } from "../../features/fitness/components/FitnessEvidenceTrend";
import GlossaryText from "../common/GlossaryText";
import DisciplineTabs from "../redesign/DisciplineTabs";
import FitnessPeriodEvidence from "../../features/fitness/components/FitnessPeriodEvidence";
import { LocalizedLink } from "../LocalizedLink";
import type { MonthlyCyclingVo2maxPoint } from "../../features/fitness/deriveMonthlyCyclingVo2maxTrend";
import { computeOutdoorPacingGuide, type GapEntry } from "@shared/training/expectedPower";
import { makeDurationLabel } from "../../features/fitness/fitnessPageUtils";
import RunningRaceEstimatesPanel from "../../features/fitness/RunningRaceEstimatesPanel";
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
import { useEffect, useState, useRef, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import type { PmcHistoryPoint } from "../../features/fitness/pmcHistory";
import { PowerCurvePeriodsPanel } from "../../features/fitness/components/PowerCurvePeriodsPanel";
import PmcHistoryPanel, { PmcHistoryMethodNotes } from "../../features/fitness/components/PmcHistoryPanel";
import { fitnessTodayKey, type FitnessDateKeyBasis } from "@shared/training/dateKey";
import FtpDecisionSection from "../../features/fitness/components/FtpDecisionSection";
import { qualifiedRunRecords, needsRunAnalysisReadiness } from "../../features/fitness/runAnalysisReadiness";
import RunRecordsSummary from "../../features/fitness/components/RunRecordsSummary";
import CoachDetailSection from "../../features/fitness/components/CoachDetailSection";
import DetailsSection from "../redesign/DetailsSection";
import SportFilterTabs from "./SportFilterTabs";
import { getDisciplineColor } from "../../utils/disciplineFilter";
import type { Discipline } from "../../utils/disciplineFilter";
import { Button, Chip, Text, ToggleControls, ToggleButton } from "../../theme/components";
import type { SufficiencySet } from "@shared/types/sufficiency";
import { SufficiencyCard, SufficiencyInline, SufficiencyGroup, isSufficiencyGrouped, findSufficiencyBlock, needsSufficiencyCard } from "../../features/sufficiency/SufficiencyBlock";
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
import type { TodayTrainingDecisionState } from "../../hooks/useTodayTrainingDecision";
import { canShowRecommendation, decisionAction, primaryEffectiveSession, primaryRecommendedAdjustment, primaryRecommendedSession, primaryScheduledSession } from "../../features/trainingDecision/decisionPresentation";
import "./MobileFitnessPage.css";

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
  /** 서버 충분도 블록(PDC 문서 동반). 없으면 기존 표시. */
  pdcSufficiency?: SufficiencySet | null;
  loadSufficiency?: SufficiencySet | null;
  activityWindowSufficiency?: SufficiencySet | null;
  // PMC
  ctl: number; atl: number; tsb: number;
  pmcHistory: MobileFitnessPmcPoint[];  // 오래된 → 최신
  pmcProjection?: MobileFitnessProjPoint[] | null;  // 미래 예측 (있을 때만)
  today?: string;                       // YYYY-MM-DD (오늘 마커용)
  // 주간 TSS
  weeklyTSS: (number | null)[];   // 오래된 → 최신 (최근 4주)
  thisWeekTSS: number | null;
  avgWeekTSS: number | null;
  restDays: number | null;
  weeklyLoadPartial?: boolean;
  weeklyLoadStoredSummary?: boolean;
  weeklyLoadAsOf?: string;
  weeklyLoadDateBasis?: "utc" | "zone" | "local" | "mixed";
  loadUnknownCount?: number;
  thisWeekUnknownCount?: number;
  hasKnownWeeklyLoad?: boolean;
  hasKnownThisWeekLoad?: boolean;
  // 임계값 (종목별)
  threshold: MobileFitnessThreshold | null;
  // bike 핵심 상태/역량 표시용 프로필 값.
  ftp?: number;
  weightKg?: number;
  hasLoadData: boolean;
  pdcSummary?: MobileFitnessPdcSummary | null;
  monthlyVo2maxTrend?: MonthlyCyclingVo2maxPoint[];
  powerGaps?: GapEntry[];
  combinedLoad?: CombinedLoadStatus | null;
  loadFocus: LoadFocusResult | null;
  cyclingAbility: CyclingAbilityResult | null;
  runEvidence: RunEvidence;
  swimEvidence: SwimEvidence;
  // 존 분포
  zones: MobileFitnessZone[];
  zoneEvidence?: FitnessZoneEvidence;
  zoneSource: ZoneSource;
  // 파워 커브 (bike, 있을 때만)
  powerCurve?: MobilePowerCurvePoint[];
  ftpProgression?: EstimatedFtpPoint[];
  ftpHistory?: FtpHistoryEntry[];
  thresholdDecision?: BikeThresholdDecision;
  // 디스플레이용 종목 키 (탭 라벨/색상 결정)
  discipline: "bike" | "run" | "swim" | "tri";
}

export interface MobileFitnessSectionState {
  trend: "loading" | "error" | "ready";
  derived: "loading" | "error" | "ready";
  onRetryTrend?: () => void;
  retryLabel?: string;
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
      tabIndex={0}
      aria-label={ariaLabel}
      aria-description={t("fitness:chartDetail.navigate")}
      onFocus={() => setTapIdx(pastCount - 1)}
      onBlur={() => setTapIdx(null)}
      onPointerLeave={event => { if (event.pointerType === "mouse") setTapIdx(null); }}
      onKeyDown={event => {
        if (event.key === "Escape") setTapIdx(null);
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          setTapIdx(index => Math.max(0, Math.min(total - 1, (index ?? pastCount - 1) + (event.key === "ArrowRight" ? 1 : -1))));
        }
      }}
      style={{ position: "relative", width: "100%", aspectRatio: `${W} / ${H}` }}
    >
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", touchAction: "manipulation" }}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handleTap} onPointerMove={(e) => { if (e.pointerType === "mouse" || e.buttons & 1) handleTap(e); }}>
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
            transform: "translate(calc(-100% - var(--space-0-5)), -50%)", color: "var(--ink-2)", fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-xs)", fontWeight: 500, fontVariantNumeric: "tabular-nums", lineHeight: 1,
          }}>{v === null ? "–" : Math.round(v)}</span>
        ))}
        {xLabels.map((l, i) => (
          <span key={i} style={{
            position: "absolute", left: `${(l.x / W) * 100}%`, top: `${((H - 6) / H) * 100}%`,
            transform: `translate(${i === 0 ? "0" : i === xLabels.length - 1 ? "-100%" : "-50%"}, -100%)`,
            color: l.isToday ? "var(--ink-1)" : "var(--ink-2)", fontSize: "var(--fs-xs)", fontWeight: 500,
            lineHeight: 1, whiteSpace: "nowrap",
          }}>{l.text}{l.isToday ? t("mobileFitness.pmcLabelToday") : ""}</span>
        ))}
      </div>

      {tip && (
        <div data-pmc-tooltip role="status" style={{
          position: "absolute", insetInline: 0, top: "100%", zIndex: 5,
          width: "100%", maxHeight: "min(50vh, 24rem)", overflowY: "auto",
          padding: "var(--space-3)", borderRadius: "var(--r-sm)",
          background: "var(--bg-2)", border: "1px solid var(--line-soft)", boxSizing: "border-box",
          fontSize: "var(--fs-xs)", fontWeight: 500, lineHeight: 1.5,
        }}>
          <div style={{ color: "var(--ink-3)", whiteSpace: "nowrap" }}>
            {tip.date} · {t(tip.isFuture ? "fitness:chartDetail.forecast" : "fitness:chartDetail.recorded")}
          </div>
          <div data-pmc-tooltip-metric="CTL" style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <PmcLegendSample color={ctlColor} linecap={PMC_LINE_PALETTE.ctl.linecap} />
            <span>{ctlLabel} {tip.ctl.toFixed(1)}</span>
          </div>
          <div data-pmc-tooltip-metric="ATL" style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <PmcLegendSample color={PMC_LINE_PALETTE.atl.color} dasharray={PMC_LINE_PALETTE.atl.dasharray} linecap={PMC_LINE_PALETTE.atl.linecap} />
            <span>ATL {tip.atl.toFixed(1)}</span>
          </div>
          <div data-pmc-tooltip-metric="TSB" style={{ color: "var(--ink-1)", fontFamily: "var(--font-mono)", display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <PmcLegendSample color={PMC_LINE_PALETTE.tsb.color} dasharray={PMC_LINE_PALETTE.tsb.dasharray} linecap={PMC_LINE_PALETTE.tsb.linecap} />
            <span>TSB {tip.tsb >= 0 ? "+" : ""}{tip.tsb.toFixed(1)}</span>
          </div>
          <div style={{ color: "var(--ink-2)" }}>{t("fitness:chartDetail.pmcUnit")}</div>
          <div style={{ color: "var(--ink-2)" }}>{t("fitness:chartDetail.range")}: {allDates[0]} – {allDates[total - 1]}</div>
          <div style={{ color: "var(--ink-2)" }}>{t(tip.isFuture ? "fitness:chartDetail.forecastNote" : "fitness:chartDetail.metricNote")}</div>
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
  compact = false,
}: {
  values: (number | null)[];
  compact?: boolean;
  color: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const knownValues = values.filter((value): value is number => value !== null);
  const max = Math.max(1, ...knownValues);
  const labels = values.map((_, i, arr) => t("fitness:weekly.window", { start: (arr.length - 1 - i) * 7, end: (arr.length - i) * 7 - 1 }));
  if (!values.length) return null;
  if (compact && !knownValues.length) return <Text as="p" variant="bodySmall" tone="secondary">{t("mobileFitness.weeklyUnknown")}</Text>;
  return <ol className="mobile-weekly-load" aria-label={t("fitness:weekly.title")}>
    {values.map((value, index) => <li key={index}>
      <Text as="div" variant="bodyMedium" mono>{value === null ? "–" : Math.round(value)}</Text>
      {knownValues.length > 0 && <div className="mobile-weekly-load__plot" aria-hidden="true">
        <div className="mobile-weekly-load__bar" style={{ height: `${value === null ? 0 : Math.round(value / max * 100)}%`, minHeight: value !== null && value > 0 ? "var(--space-1)" : 0, background: index === values.length - 1 ? color : "var(--bg-3)" }} />
      </div>}
      <Text as="div" variant="bodySmall" tone="secondary">{labels[index]}</Text>
    </li>)}
  </ol>;
}

// ── 파워 커브 미니 ─────────────────────────────────────────────
function PowerCurveMini({ points, color, ariaLabel, detailed = false }: { points: MobilePowerCurvePoint[]; color: string; ariaLabel: string; detailed?: boolean }) {
  const { t } = useTranslation("fitness");
  if (detailed) return <FitnessEvidenceTrend title={t("powerCurve.title")} description={ariaLabel} color={color} logarithmic
    ticks={[{ x: 5, label: "5s" }, { x: 60, label: "1m" }, { x: 300, label: "5m" }, { x: 1200, label: "20m" }, { x: 3600, label: "1h" }]}
    points={points.map(point => ({ key: String(point.durationSeconds), label: makeDurationLabel(t)(point.durationSeconds), x: point.durationSeconds, value: point.maxPower, unit: "W", detail: t("period.recent") }))} />;
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
function SectionCard({ specId, children, title, sub, accentColor, ariaLabel, compact = false, readableSub = false }: { specId?: string; children: React.ReactNode; title?: string; sub?: string; accentColor?: string; ariaLabel?: string; compact?: boolean; readableSub?: boolean }) {
  // 기본 섹션 geometry는 기존 임베드 표현을 유지한다. 웹에서는 --web 스코프가
  // 음수 여백을 제거하고 Layout 셸의 거터 안에 카드·제목·탭을 정렬한다.
  return (
    <div data-testid={specId} className="mobile-fitness-section" role={ariaLabel ? "region" : undefined} aria-label={ariaLabel} style={{
      margin: compact ? "0 -16px var(--space-2)" : "0 -16px 12px",
      background: "var(--bg-1)",
      borderTop: accentColor ? `var(--space-0-5) solid ${accentColor}` : "1px solid var(--line-soft)",
      borderBottom: "1px solid var(--line-soft)",
      padding: compact ? "var(--space-3) var(--space-4)" : "12px 16px",
    }}>
      {(title || sub) && (
        <div style={{ marginBottom: "var(--space-2)" }}>
          {title && <Text variant="eyebrow"><GlossaryText>{title}</GlossaryText></Text>}
          {sub && <div className={readableSub ? "ds-text ds-text--body-medium" : undefined} style={{ overflowWrap: readableSub ? "anywhere" : undefined, fontSize: readableSub ? undefined : "var(--fs-xs)", color: "var(--ink-2)", marginTop: "var(--space-1)" }}><GlossaryText>{sub}</GlossaryText></div>}
        </div>
      )}
      {children}
    </div>
  );
}

function TodayDecisionPreview({ state, signedIn, hasDetails }: {
  state?: TodayTrainingDecisionState;
  signedIn: boolean;
  hasDetails: boolean;
}) {
  const { t } = useTranslation("training");
  const decision = state?.decision;
  const healthStop = decision?.healthGate.state === "stop";
  const scheduled = decision ? primaryScheduledSession(decision) : null;
  const effective = decision ? primaryEffectiveSession(decision) : null;
  const recommendationVisible = Boolean(decision && !healthStop && canShowRecommendation(decision));
  const adjustment = decision && recommendationVisible ? primaryRecommendedAdjustment(decision) : null;
  const recommended = decision && adjustment ? primaryRecommendedSession(decision) : null;
  const applied = decision?.receipt?.status === "applied";
  const pending = Boolean(adjustment && !applied);
  const stateKey = !signedIn ? "signed-out" : !state || state.loading ? "loading"
    : !decision ? state.unavailableReason === "disabled" ? "disabled" : state.unavailableReason === "error" ? "error" : "unavailable"
      : healthStop ? "health-stop" : !scheduled ? "no-scheduled" : applied ? "applied" : pending ? "recommendation-pending" : "scheduled";
  const title = stateKey === "signed-out" ? t("dashboard:mobileFitness.decision.signedOut")
    : stateKey === "loading" ? t("decision.loading")
      : stateKey === "disabled" ? t("decision.fallback.reason.feature_disabled")
        : stateKey === "error" ? t("decision.fallback.unavailableTitle")
          : stateKey === "unavailable" ? t("dashboard:mobileFitness.decision.unavailable")
            : stateKey === "health-stop" ? t("dashboard:mobileFitness.decision.healthStop")
              : stateKey === "no-scheduled" ? t("decision.noScheduled")
                : stateKey === "applied" ? t("decision.status.applied")
                  : stateKey === "recommendation-pending" ? t("decision.status.recommendationPending")
                    : t("decision.status.scheduledOnly");
  const session = stateKey === "scheduled" || stateKey === "applied" || stateKey === "recommendation-pending" ? effective : null;
  const canOpenDetails = hasDetails && Boolean(decision);

  return <div data-mobile-fitness-decision={stateKey} aria-live="polite" style={{ marginTop: "var(--space-1)" }}>
    <Text as="div" variant="subtitle">{title}</Text>
    {stateKey === "health-stop" && <Text as="p" variant="caption" tone="warning" style={{ margin: "var(--space-1) 0 0" }}>{t("decision.healthStop")}</Text>}
    {session && <Text as="div" variant="bodySmall" style={{ marginTop: "var(--space-1)" }}>
      {t("decision.effective")}: {t(`decision.workout.${session.current.workout}`)} · {t("decision.duration", { value: session.current.durationMin })}
    </Text>}
    {pending && <Text as="div" variant="caption" tone="secondary" style={{ marginTop: "var(--space-1)" }}>
      {t("decision.recommended")}: {recommended ? t(`decision.workout.${recommended.current.workout}`) : t(`decision.status.${decisionAction(decision!) ?? "reassess"}`)} · {t("decision.mode.not-applied")}
    </Text>}
    {stateKey === "scheduled" && decision?.fallback.active && decision.fallback.reasonCode && <Text as="div" variant="caption" tone="secondary" style={{ marginTop: "var(--space-1)" }}>
      {t(`decision.fallback.reason.${decision.fallback.reasonCode}`)}
    </Text>}
    {stateKey === "scheduled" && decision?.prescription.status !== "ready" && !decision?.fallback.active && <Text as="div" variant="caption" tone="secondary" style={{ marginTop: "var(--space-1)" }}>
      {t("decision.fallback.reason.prescription_not_ready")}
    </Text>}
    {stateKey === "error" && state && <Button variant="secondary" onClick={state.refresh}>{t("decision.refresh")}</Button>}
    {canOpenDetails && <Button variant="secondary" data-mobile-fitness-today-link
      onClick={() => document.getElementById("fitness-coach-today")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
      {t(stateKey === "health-stop" ? "dashboard:mobileFitness.decision.viewSafetyDetails" : "dashboard:mobileFitness.decision.viewDetails")} ↓
    </Button>}
  </div>;
}

/** 기간 읽기 인증과 열기 상태는 실제 사이클 상세 도구에서만 구독한다. */
function MobilePowerCurvePeriods({ ownerUid, enabled, inline = false, nativeActivities = [] }: { ownerUid: string; enabled: boolean; inline?: boolean; nativeActivities?: readonly NativePowerLoadedActivity[] }) {
  const { t } = useTranslation("fitness");
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  if (!user || user.isAnonymous || user.uid !== ownerUid) return null;
  if (inline) return <section data-testid="K5-5-1" className="rounded-[var(--r-lg)] border border-[var(--line-soft)] p-3">
    <PowerCurvePeriodsPanel ownerUid={ownerUid} callableEnabled={enabled} nativeActivities={nativeActivities} />
  </section>;
  return <details data-testid="K5-5-1" className="rounded-[var(--r-lg)] border border-[var(--line-soft)] p-3" onToggle={event => { if (event.currentTarget.open) setMounted(true); }}>
    <summary className="cursor-pointer py-3"><Text variant="label">{t("periodCurve.title")}</Text></summary>
    {mounted && <div className="pt-3"><PowerCurvePeriodsPanel ownerUid={ownerUid} callableEnabled={enabled} nativeActivities={nativeActivities} embedded /></div>}
  </details>;
}

/** 웹 분석에서만 추가되는 실측 월별 VO₂max·CP 기대값 비교. */
function MobileCyclingEvidence({ data, condition = false }: { data: MobileFitnessData; condition?: boolean }) {
  const { t } = useTranslation("fitness");
  const trend = data.monthlyVo2maxTrend ?? [];
  const gaps = data.powerGaps ?? [];
  const durationLabel = makeDurationLabel(t);
  const first = trend[0], last = trend[trend.length - 1];
  const delta = first && last ? last.v - first.v : 0;
  const deltaLabel = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`;
  const trendLabel = first && last ? t("vo2maxCard.trendAriaValues", { startPeriod: first.period, start: first.v, endPeriod: last.period, end: last.v, delta: deltaLabel }) : "";
  const sufficiency = data.pdcSufficiency ?? null;
  const vo2maxBlock = findSufficiencyBlock(sufficiency, "vo2max");
  const powerModelBlock = findSufficiencyBlock(sufficiency, "power_model");
  const ftpBlock = findSufficiencyBlock(sufficiency, "ftp_estimate");
  const monthlyBlock = findSufficiencyBlock(sufficiency, "vo2max", "monthly");
  const riderBlock = findSufficiencyBlock(sufficiency, "rider_profile");
  const analysisSets = [sufficiency && { ...sufficiency, blocks: sufficiency.blocks.filter(block => block.discipline === data.discipline) }, data.activityWindowSufficiency && { ...data.activityWindowSufficiency,
    blocks: data.activityWindowSufficiency.blocks.filter(block => block.discipline === data.discipline && (block.featureId !== "power_curve" || block.viewId === "mobile")) }]
    .filter((set): set is NonNullable<typeof set> => set != null);
  const hasPowerModel = gaps.length > 0;
  const cp = data.thresholdDecision?.cpW;
  const pacing = cp != null ? computeOutdoorPacingGuide(cp, data.weightKg) : null;
  return <>
    {sufficiency && !isSufficiencyGrouped(...analysisSets) && needsSufficiencyCard(sufficiency, riderBlock) && <SufficiencyCard set={sufficiency} block={riderBlock} testId="K5-1-1-sufficiency" />}
    {data.pdcSummary?.vo2maxEst != null && <SectionCard title={t("vo2maxCard.pdcLabel")}>
      <div data-testid="K5-1-3">
        <Text variant="dataLarge">~{data.pdcSummary.vo2maxEst}</Text> <Text variant="unit">ml/kg/min</Text>
        <Text as="p" variant="caption" tone="tertiary"><GlossaryText>{t("vo2maxCard.pdcSub")}</GlossaryText></Text>
        {vo2maxBlock && sufficiency && <SufficiencyInline set={sufficiency} block={vo2maxBlock} testId="K5-1-3-sufficiency-inline" />}
        {(monthlyBlock ? !needsSufficiencyCard(sufficiency!, monthlyBlock) : trend.length >= 2) && trend.length > 0 && <>
          <FitnessEvidenceTrend title={t("vo2maxCard.pdcLabel")} description={trendLabel} color="var(--aqua)"
            points={trend.map(point => ({ key: point.period, label: point.period, value: point.v, unit: "ml/kg/min", detail: t("vo2maxCard.pdcSub") }))} />
          <Text as="p" variant="mono">{deltaLabel} · {t("vo2maxCard.trendSpan", { n: trend.length })}</Text>
        </>}
      </div>
    </SectionCard>}
    {sufficiency && !isSufficiencyGrouped(...analysisSets) && needsSufficiencyCard(sufficiency, ftpBlock) && <SufficiencyCard set={sufficiency} block={ftpBlock} testId="K5-1-ftp-sufficiency" />}
    {sufficiency && !isSufficiencyGrouped(...analysisSets) && needsSufficiencyCard(sufficiency, monthlyBlock) && <SufficiencyCard set={sufficiency} block={monthlyBlock} testId="K5-1-3-monthly-sufficiency" />}
    {data.pdcSummary?.vo2maxEst == null && sufficiency && !isSufficiencyGrouped(...analysisSets) && needsSufficiencyCard(sufficiency, vo2maxBlock)
      && <SufficiencyCard set={sufficiency} block={vo2maxBlock} testId="K5-1-3-sufficiency" />}
    {!hasPowerModel && sufficiency && !isSufficiencyGrouped(...analysisSets) && needsSufficiencyCard(sufficiency, powerModelBlock)
      && <SufficiencyCard set={sufficiency} block={powerModelBlock} testId="K5-1-4-sufficiency" />}
    {condition && pacing && <SectionCard specId="K1-6-6" title={t("pacing.title")}>
      <Text as="div" variant="dataMedium">{pacing.lowerW}–{pacing.upperW} W{pacing.lowerWkg != null && pacing.upperWkg != null ? ` · ${pacing.lowerWkg.toFixed(2)}–${pacing.upperWkg.toFixed(2)} W/kg` : ""}</Text>
      <Text as="p" variant="caption" tone="secondary">{t("pacing.note", { cp })}</Text>
    </SectionCard>}
    {gaps.some(gap => gap.label === "strength" || gap.label === "weakness") && <SectionCard title={t("gapCard.title")}>
      <div data-testid="K5-1-4">
        {(["strength", "weakness"] as const).map(label => {
          const group = gaps.filter(gap => gap.label === label);
          return group.length > 0 ? <div key={label} className="flex flex-wrap items-center gap-2 mb-3">
            <Text variant="eyebrow">{t(label === "strength" ? "gapCard.strengthLabel" : "gapCard.weaknessLabel")}</Text>
            {group.map(gap => <Chip key={gap.durationSeconds} variant={label === "strength" ? "success" : "warning"}>
              {durationLabel(gap.durationSeconds)} {gap.gapPct > 0 ? "+" : ""}{Math.round(gap.gapPct)}%
            </Chip>)}
          </div> : null;
        })}
        <Text as="p" variant="caption" tone="tertiary">{t("gapCard.sub")}</Text>
      </div>
    </SectionCard>}
  </>;
}

// ── 메인 ──────────────────────────────────────────────────────
export default function MobileFitnessPage({
  data,
  part = "all",
  runningRaceEstimatesOwnerUid,
  runPaceCurve,
  powerCurvePeriodsOwnerUid,
  powerCurvePeriodsEnabled = false,
  pmcHistoryPoints,
  pmcHistoryCanonical = false,
  periodTimeseries = null,
  fitnessDateKeyBasis,
  coachSlot = null,
  thresholdsSlot = null,
  hasThresholdSettings = Boolean(thresholdsSlot),
  goalSummarySlot = null,
  periodSlot = null,
  analysisSummarySlot = null,
  conditionSupplementSlot = null,
  currentBasis,
  currentStatusSlot = null,
  periodEvidenceSlot = null,
  ridingEvidenceSlot = null,
  powerCurveEvidenceSlot = null,
  runningRecordsSlot = null,
  triEvidenceSlot = null,
  nativePowerActivities = [],
  todayDecisionState,
  todayDecisionSignedIn = true,
  consistencyStreak = null,
  ftpDecision = null,
  ftpReceipt = null,
  ftpDeviceReceipts = [],
  decisionBusy = false,
  onAcceptDecision = () => undefined,
  embedded = false,
  sectionState = { trend: "ready", derived: "ready" },
}: {
  data: MobileFitnessData;
  part?: "all" | "condition" | "analysis";
  runningRaceEstimatesOwnerUid?: string;
  runPaceCurve?: CurvePeriods<RunPacePoint>;
  powerCurvePeriodsOwnerUid?: string;
  powerCurvePeriodsEnabled?: boolean;
  /** 표시 범위를 확장해도 활동 상세 조회는 늘리지 않는 전체 일별 이력. */
  pmcHistoryPoints?: readonly PmcHistoryPoint[];
  pmcHistoryCanonical?: boolean;
  periodTimeseries?: FitnessTimeseriesDoc | null;
  /** 정본 loadSnapshot.dateKeyBasis — PMC 이력의 오늘 키. 없으면 UTC. */
  fitnessDateKeyBasis?: FitnessDateKeyBasis;
  /** 단일 종목에서 활동 영향과 오늘 선택을 먼저 보여주는 공용 코치 브리핑. */
  coachSlot?: ReactNode;
  thresholdsSlot?: ReactNode;
  hasThresholdSettings?: boolean;
  goalSummarySlot?: ReactNode;
  periodSlot?: ReactNode;
  analysisSummarySlot?: ReactNode;
  conditionSupplementSlot?: ReactNode;
  currentBasis?: string;
  currentStatusSlot?: ReactNode;
  periodEvidenceSlot?: ReactNode;
  ridingEvidenceSlot?: ReactNode;
  powerCurveEvidenceSlot?: ReactNode;
  runningRecordsSlot?: ReactNode;
  triEvidenceSlot?: ReactNode;
  nativePowerActivities?: readonly NativePowerLoadedActivity[];
  /** 오늘 결정 상세와 공유하는 단일 서버 판정 상태. 모바일 소스가 한 번만 조회한다. */
  todayDecisionState?: TodayTrainingDecisionState;
  todayDecisionSignedIn?: boolean;
  consistencyStreak?: ConsistencyStreakSummary | null;
  ftpDecision?: BikeThresholdDecisionV2 | null;
  ftpReceipt?: FtpMutationReceipt | null;
  ftpDeviceReceipts?: FtpDeviceReceipt[];
  decisionBusy?: boolean;
  onAcceptDecision?: () => void;
  /** Native host already owns the surface title and bottom navigation chrome. */
  embedded?: boolean;
  /** 임베드 부분 로딩에서 시계열과 파생 섹션을 독립적으로 표시한다. */
  sectionState?: MobileFitnessSectionState;
}) {
  const { t } = useTranslation("dashboard");
  const { t: trainingT } = useTranslation("training");
  const [chartViews, setChartViews] = useState<Partial<Record<MobileFitnessData["discipline"], "trend" | "years" | "activities">>>({});
  const chartView = chartViews[data.discipline] ?? "trend";
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
  const requestedSport = searchParams.get("sport") ?? "bike";
  const urlSport = isSportUiEnabled(requestedSport) ? requestedSport : "bike";
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
  const trendSectionTitle = sectionState.trend === "ready"
    ? pmcTitle
    : t("mobileFitness.trendTitle");

  const analysisTabLabel = data.discipline === "bike"
    ? t("mobileFitness.tabAnalysis")
    : data.discipline === "run"
    ? t("mobileFitness.tabZonesRun")
    : t("mobileFitness.tabZonesSwim");
  const activeTab = part === "analysis" ? "analysis" : part === "condition" || data.discipline === "tri" ? "overview" : tab;
  const tsbValue = data.hasLoadData && Number.isFinite(data.tsb) ? Number(data.tsb.toFixed(1)) : null;
  const tsbInterpretation = tsbValue == null ? t("mobileFitness.tsbMeaning.noData")
    : tsbValue < 0 ? t("mobileFitness.tsbMeaning.fatigueHigher")
      : tsbValue > 0 ? t("mobileFitness.tsbMeaning.fitnessHigher")
        : t("mobileFitness.tsbMeaning.balanced");
  // 사용 불가 안내는 훈련 수치보다 우선순위가 낮다. 건강 중단·오류·실제 처방은
  // 기존처럼 상단에 남기고, 기능 비활성 안내만 차트 뒤로 보낸다.
  const deferDisabledDecision = todayDecisionSignedIn && todayDecisionState?.unavailableReason === "disabled"
    && !todayDecisionState.loading && !todayDecisionState.decision;

  const isBike = data.discipline === "bike";
  const loadSet = data.loadSufficiency;
  const loadTrend = findSufficiencyBlock(loadSet, "load_history", "trend");
  const loadForm = findSufficiencyBlock(loadSet, "load_history", "form");
  const riderSet = data.pdcSufficiency;
  const riderBlock = findSufficiencyBlock(riderSet, "rider_profile");
  const mobileAnalysisSets = [data.pdcSufficiency && { ...data.pdcSufficiency, blocks: data.pdcSufficiency.blocks.filter(block => block.discipline === data.discipline) }, data.activityWindowSufficiency && { ...data.activityWindowSufficiency,
    blocks: data.activityWindowSufficiency.blocks.filter(block => block.discipline === data.discipline && (block.featureId !== "power_curve" || block.viewId === "mobile")) }];
  const showZones = data.zones.length > 0;
  const runReadiness = (part === "analysis" || part === "condition") && !embedded && data.discipline === "run"
    && sectionState.derived === "ready" && needsRunAnalysisReadiness(data.runEvidence, !!data.threshold, showZones);
  const mobileCurveBlock = data.activityWindowSufficiency?.blocks.find(block => block.featureId === "power_curve" && block.viewId === "mobile" && block.discipline === data.discipline);
  const powerCurveMaxW = data.powerCurve?.length
    ? Math.round(Math.max(...data.powerCurve.map(point => point.maxPower)))
    : 0;
  const powerCurveTitle = t("mobileFitness.powerCurveTitle");
  const powerCurveSub = t("mobileFitness.powerCurveSub", { maxW: powerCurveMaxW });

  const dailyChartContent = (<>
                    {/* 전폭 카드 안에서 카드 좌우 padding(16)을 상쇄해 차트를 화면 끝까지 채운다.
                        제목/범례는 카드 padding 인셋 유지. */}
                    <div style={{ margin: "0 -16px" }}>
                      <PmcMiniChart history={data.pmcHistory} projection={data.pmcProjection} today={data.today} ctlColor={pmcCtlColor} ctlLabel={pmcCtlLabel} ariaLabel={`${pmcTitle}. ${pmcSub}`} t={t} />
                    </div>
                    <div style={{ marginTop: "var(--space-1-5)", fontSize: "var(--fs-xs)", color: "var(--ink-2)", display: "flex", gap: "var(--space-3)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
                        <PmcLegendSample color={pmcCtlColor} linecap={PMC_LINE_PALETTE.ctl.linecap} /><GlossaryText>{pmcCtlLabel}</GlossaryText>
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
                        <PmcLegendSample color={PMC_LINE_PALETTE.atl.color} dasharray={PMC_LINE_PALETTE.atl.dasharray} linecap={PMC_LINE_PALETTE.atl.linecap} /><GlossaryText>ATL</GlossaryText>
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
                        <PmcLegendSample color={PMC_LINE_PALETTE.tsb.color} dasharray={PMC_LINE_PALETTE.tsb.dasharray} linecap={PMC_LINE_PALETTE.tsb.linecap} /><GlossaryText>TSB</GlossaryText>
                      </span>
                    </div>
  </>);

  const bikePowerCurveContent = (<>
          {/* 파워 커브 (bike) */}
          {sectionState.derived === "ready" && isBike && (part === "condition" || part === "analysis" && !embedded && !(mobileCurveBlock && needsSufficiencyCard(data.activityWindowSufficiency!, mobileCurveBlock))) && powerCurveEvidenceSlot}
          {sectionState.derived === "ready" && isBike && !((part === "condition" || part === "analysis" && !embedded) && powerCurveEvidenceSlot) && data.powerCurve && (mobileCurveBlock ? !needsSufficiencyCard(data.activityWindowSufficiency!, mobileCurveBlock) && data.powerCurve.length > 0 : data.powerCurve.length >= 2) && (
            <SectionCard specId="K5-2-1">
              <div data-power-curve-copy style={{ marginBottom: "var(--space-2)" }}>
                <Text variant="eyebrow">{powerCurveTitle}</Text>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-1)" }}>{powerCurveSub}</div>
              </div>
              <div
                data-power-curve-visual
                style={{ margin: "0 -16px", overflow: "hidden" }}
              >
                <PowerCurveMini detailed={part === "condition"} points={data.powerCurve} color={ringColor} ariaLabel={`${powerCurveTitle}. ${powerCurveSub}`} />
              </div>
            </SectionCard>
          )}

  </>);
  const bikePeriodZoneContent = (<>
          {isBike && powerCurvePeriodsOwnerUid && <MobilePowerCurvePeriods nativeActivities={nativePowerActivities} inline={part === "condition" && embedded || part === "analysis" && !embedded} key={powerCurvePeriodsOwnerUid} ownerUid={powerCurvePeriodsOwnerUid} enabled={powerCurvePeriodsEnabled} />}

          {/* 두 종목 부하 근거를 파워 우선 선택으로 숨기지 않는다. */}
          {sectionState.derived === "ready" && (part === "condition" || part === "analysis" && !embedded) && data.zoneEvidence && <FitnessZoneDistributions compact={part === "analysis" && !embedded} evidence={data.zoneEvidence} />}

  </>);

  const mobileAnalysis = part === "analysis" && !embedded;
  const mobileCondition = part === "condition" && !embedded;
  const hasRunCurve = Boolean(runPaceCurve && (runPaceCurve.recent28.length > 0 || runPaceCurve.prev28.length > 0));
  const runCurveContent = ((part === "condition" || mobileAnalysis) && data.discipline === "run" && sectionState.derived === "ready" && <SectionCard specId="K5-2-3" title={t("fitness:criticalPace.title")}>
            {runPaceCurve && (runPaceCurve.recent28.length > 0 || runPaceCurve.prev28.length > 0)
              ? <CriticalPaceCurve stableSelection={!embedded} recentPoints={runPaceCurve.recent28} prevPoints={runPaceCurve.prev28} />
              : <Text as="p" variant="bodySmall" tone="secondary">{t("fitness:criticalPace.unavailable")}</Text>}
          </SectionCard>);
  const modelContent = (<>
          {part === "analysis" && embedded && isBike && <BikePerformanceSummaryCard compact={!embedded} part="analysis" decision={data.thresholdDecision} pdc={data.pdcSummary} weightKg={data.weightKg} />}
          {(part === "analysis" || part === "condition") && !(mobileAnalysis && data.discipline === "run") && !runReadiness && !(part === "condition" && data.discipline === "run" && !embedded && runningRecordsSlot && data.runEvidence.thresholdPaceSec == null) && <SportPerformanceCard compact={!embedded} discipline={data.discipline} cycling={data.cyclingAbility} run={!embedded && data.discipline === "run" ? { ...data.runEvidence, records: [], unverifiedRecords: [] } : data.runEvidence} swim={data.swimEvidence} />}
          {(part === "analysis" || part === "condition") && isBike && data.cyclingAbility && riderSet && riderBlock && <SufficiencyInline set={riderSet} block={riderBlock} testId="K5-1-1-sufficiency-inline" />}
          {(part === "analysis" || part === "condition") && !embedded && data.discipline === "run" && !(runningRecordsSlot && !runReadiness && qualifiedRunRecords(data.runEvidence).length === 0) && <RunRecordsSummary evidence={data.runEvidence} readiness={runReadiness} sourceBoard={Boolean(runningRecordsSlot)} />}
          {(part === "condition" || mobileAnalysis) && (mobileAnalysis && (runningRecordsSlot || data.discipline === "run" && runningRaceEstimatesOwnerUid) ? <CoachDetailSection id="analysis-run-records" title={t("mobileFitness.runRecordSources")}>{runningRecordsSlot}{data.discipline === "run" && runningRaceEstimatesOwnerUid && <RunningRaceEstimatesPanel key={runningRaceEstimatesOwnerUid} ownerUid={runningRaceEstimatesOwnerUid} />}</CoachDetailSection> : runningRecordsSlot)}
          {(part === "analysis" || part === "condition") && !embedded && isBike && sectionState.derived === "ready" && <MobileCyclingEvidence condition={part === "condition" || mobileAnalysis} data={data} />}
  </>);

  const bikeThresholdSection = data.discipline === "bike" && !mobileCondition ? (
            <FtpDecisionSection title={t(part === "condition" || mobileAnalysis ? "fitness:condition.basis.title" : "fitness:conclusion.performanceDetailToggle")} anchorEnabled={(part === "condition" || part === "analysis") && !embedded} compact={!embedded} preserveExpanded>
            <BikePerformanceSummaryCard
              part={mobileAnalysis ? "condition" : part}
              compact={!embedded}
              stableDetails={mobileAnalysis}
              decision={data.thresholdDecision}
              pdc={data.pdcSummary}
              weightKg={data.weightKg}
              progression={data.ftpProgression}
              ftpHistory={data.ftpHistory}
              // 임베드 표면은 FTP 결정을 쓰기(수락)하지 않는다 — 결정을 넘기지 않으면
              // 패널이 렌더되지 않아 액션 자체가 노출되지 않는다.
              ftpDecision={ftpDecision}
              ftpReceipt={ftpReceipt}
              ftpDeviceReceipts={ftpDeviceReceipts}
              decisionBusy={decisionBusy}
              onAcceptDecision={onAcceptDecision}
            />
            </FtpDecisionSection>
  ) : null;

  const analysisContent = (
<div id={mobileAnalysis && !isBike ? "analysis-comparison" : part === "condition" && !mobileCondition ? "condition-metrics" : undefined} tabIndex={part === "condition" ? -1 : undefined} className={part === "condition" ? "mobile-fitness-riding-metrics condition-section-target" : undefined} style={{ paddingTop: 14 }}>
          {part === "condition" && !mobileCondition && <Text as="h2" variant="title" className="mobile-fitness-riding-metrics__title">{t(data.discipline === "bike" ? "fitness:condition.metrics.bikeTitle" : "fitness:condition.metrics.runTitle")}</Text>}
          {part === "condition" && <Text as="p" variant="bodySmall" tone="secondary">{t("fitness:condition.metrics.description")}</Text>}
          {part === "condition" && ridingEvidenceSlot}
          {sectionState.derived === "loading" && (
            <div role="status" style={{ padding: "var(--space-8) var(--space-4)", textAlign: "center" }}>
              {t("mobileFitness.derivedLoading")}
            </div>
          )}
          {sectionState.derived === "error" && (
            <div role="alert" style={{ padding: "var(--space-8) var(--space-4)", textAlign: "center" }}>
              {t("mobileFitness.derivedError")}
            </div>
          )}
          {part === "condition" && isBike && <>{bikePowerCurveContent}{bikePeriodZoneContent}</>}
          {!mobileAnalysis && (part === "analysis" || part === "condition") && <SufficiencyGroup inline={part === "condition"} sets={mobileAnalysisSets.filter((set): set is NonNullable<typeof set> => set != null)} testId="K5-sufficiency-group" />}
          {mobileAnalysis && hasRunCurve && runCurveContent}
          {mobileAnalysis && <div id={isBike ? "analysis-comparison" : undefined}>{bikePowerCurveContent}</div>}
          {mobileAnalysis && <SufficiencyGroup summaryOnly sets={mobileAnalysisSets.filter((set): set is NonNullable<typeof set> => set != null)} testId="analysis-readiness-summary" />}
          {mobileAnalysis && analysisSummarySlot && <CoachDetailSection id="analysis-activity-flow" title={t("mobileFitness.activityFlow")}>{analysisSummarySlot}</CoachDetailSection>}
          {mobileAnalysis && isBike ? <CoachDetailSection id="analysis-model" title={t("mobileFitness.modelDetails")}>{modelContent}</CoachDetailSection> : modelContent}
          {/* 임계값 카드 */}
          {sectionState.derived === "ready" && data.threshold && !isBike && (
            <SectionCard>
              <Text variant="eyebrow"><GlossaryText>{data.threshold.label}</GlossaryText></Text>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-3xl)", fontWeight: 600, color: "var(--ink-0)", letterSpacing: "-0.03em", marginTop: "var(--space-1)" }}>
                {data.threshold.value || "—"}
                {data.threshold.unit && <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", marginLeft: "var(--space-1)" }}>{data.threshold.unit}</span>}
              </div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: "var(--space-1)" }}><GlossaryText>{data.threshold.sub}</GlossaryText></div>
            </SectionCard>
          )}

          {sectionState.derived === "ready" && !runReadiness && !data.threshold && (data.discipline === "run" || data.discipline === "swim") && (
            <SectionCard>
              <Text variant="body">{t(data.discipline === "run" ? "mobileFitness.thresholdMissingRun" : "mobileFitness.thresholdMissingSwim")}</Text>
            </SectionCard>
          )}

          {sectionState.derived === "ready" && !isSufficiencyGrouped(...mobileAnalysisSets) && data.activityWindowSufficiency?.blocks.filter(block => block.discipline === data.discipline && (block.featureId === "power_curve" && block.viewId === "mobile" || block.featureId === "training_zones") && needsSufficiencyCard(data.activityWindowSufficiency!, block)).map(block => <SufficiencyCard key={`${block.featureId}-${block.viewId}`} set={data.activityWindowSufficiency!} block={block} testId={block.featureId === "power_curve" ? "K5-2-1-sufficiency" : "K5-3-2-sufficiency"} />)}
          {/* 원래 단일 분포는 레거시와 서버 근거가 없는 호환 입력에만 유지한다. */}
          {sectionState.derived === "ready" && showZones && ((part !== "condition" && !mobileAnalysis) || !data.zoneEvidence) && (
            <SectionCard specId="K5-3-2"
              title={isBike ? t("mobileFitness.zonePowerTitle") : t("mobileFitness.zoneHrTitle")}
              sub={
                data.zoneSource === "power" ? t("mobileFitness.zoneSourcePowerHistorical") :
                data.zoneSource === "hr" ? (isBike ? t("mobileFitness.zoneSourceHrBike") : t("mobileFitness.zoneSourceHrRun")) :
                t("mobileFitness.zoneSourceNone")
              }>
              {data.zones.map((z, i) => (
                <div key={i} className="flex items-center gap-2" style={{ padding: "6px 0" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-4)", width: 18, textAlign: "right" }}><GlossaryText>{`Z${i + 1}`}</GlossaryText></div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", width: 60 }}><GlossaryText>{z.name}</GlossaryText></div>
                  <div style={{ flex: 1, height: 18, background: "var(--bg-3)", borderRadius: "var(--r-xs)", overflow: "hidden" }}>
                    <div style={{ width: `${z.pct}%`, height: "100%", background: z.color, borderRadius: "var(--r-xs)" }} />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-2)", width: 36, textAlign: "right" }}>{z.pct}%</div>
                </div>
              ))}
            </SectionCard>
          )}

          {!mobileAnalysis && runCurveContent}
          {mobileAnalysis && !hasRunCurve && runCurveContent}

          {!mobileAnalysis && !(part === "condition" && isBike) && bikePowerCurveContent}

          {!mobileAnalysis && data.discipline === "run" && runningRaceEstimatesOwnerUid && <RunningRaceEstimatesPanel key={runningRaceEstimatesOwnerUid} ownerUid={runningRaceEstimatesOwnerUid} />}

          {mobileAnalysis && data.discipline !== "tri" ? <CoachDetailSection id="analysis-periods" title={t("activity:trainingPeriods.title")}><FitnessPeriodEvidence discipline={data.discipline} inline timeseries={periodTimeseries} />{bikePeriodZoneContent}</CoachDetailSection> : !(part === "condition" && isBike) && bikePeriodZoneContent}

          {/* 존 정의 */}
          {sectionState.derived === "ready" && showZones && (embedded || data.zones.some(zone => zone.rangeLabel || zone.percentLabel)) && (
            <SectionCard specId="K5-3-1" title={t("mobileFitness.zoneDefsSectionTitle")}>
              {data.zones.map((z, i) => (
                <div key={i} className="flex items-center" style={{ padding: "8px 0", borderBottom: i < data.zones.length - 1 ? "1px solid var(--line-soft)" : "none", gap: "var(--space-3)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-3)", width: 20 }}><GlossaryText>{`Z${i + 1}`}</GlossaryText></span>
                  <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-0)", flex: 1 }}><GlossaryText>{z.name}</GlossaryText></span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}><GlossaryText>{z.rangeLabel}</GlossaryText></span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-4)", width: 60, textAlign: "right" }}>{z.percentLabel}</span>
                </div>
              ))}
            </SectionCard>
          )}

          {sectionState.derived === "ready" && !runReadiness && !showZones && (data.discipline === "run" || data.discipline === "swim") && (
            <SectionCard>
              <Text variant="body"><GlossaryText>{t("mobileFitness.hrZonesMissing")}</GlossaryText></Text>
            </SectionCard>
          )}

          {sectionState.derived === "ready" && isBike && !showZones && !data.threshold && !(mobileAnalysis && data.powerCurve && (mobileCurveBlock ? !needsSufficiencyCard(data.activityWindowSufficiency!, mobileCurveBlock) && data.powerCurve.length > 0 : data.powerCurve.length >= 2)) && (
            <div style={{ padding: "var(--space-8) var(--space-4)", textAlign: "center", fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
              <GlossaryText>{t("mobileFitness.analysisInsufficient")}</GlossaryText>
            </div>
          )}
          {mobileAnalysis && bikeThresholdSection}
          {mobileAnalysis && isSufficiencyGrouped(...mobileAnalysisSets) && <CoachDetailSection id="analysis-evidence" title={t("mobileFitness.modelEvidence")}><SufficiencyGroup inline sets={mobileAnalysisSets.filter((set): set is NonNullable<typeof set> => set != null)} testId="K5-sufficiency-group" /></CoachDetailSection>}
        </div>
  );

  const conditionStory = part === "condition" && data.discipline !== "tri" && isValidElement(coachSlot);
  const conditionNavigation = embedded ? (<ConditionSectionNav sections={[
        { id: "condition-current", label: t("fitness:condition.current.title") },
        { id: "condition-trend", label: t("fitness:condition.chart.region") },
        ...(coachSlot && data.discipline !== "tri" ? [{ id: "condition-activities", label: t("fitness:coach.recent.title") }] : []),
        { id: "condition-load", label: t("fitness:condition.load.title") },
        ...((embedded || data.discipline === "tri") && (data.discipline !== "tri" || triEvidenceSlot) ? [{ id: "condition-metrics", label: t(data.discipline === "tri" ? "fitness:condition.metrics.triTitle" : data.discipline === "bike" ? "fitness:condition.metrics.bikeTitle" : "fitness:condition.metrics.runTitle") }] : []),
        ...(isBike && embedded ? [{ id: "condition-ftp", label: t("fitness:condition.basis.title") }] : []),
        ...(!embedded && !mobileCondition && hasThresholdSettings ? [{ id: "thresholds", label: t("fitness:condition.settings.title") }] : []),
      ]} />) : null;
  const conditionTrend = (          <section id={part === "condition" ? "condition-trend" : undefined} tabIndex={part === "condition" ? -1 : undefined} className={part === "condition" ? "condition-section-target" : undefined}>
          <SectionCard title={pmcHistoryPoints ? undefined : trendSectionTitle} sub={pmcHistoryPoints ? undefined : pmcSub} accentColor={pmcCtlColor}>
            {sectionState.trend === "loading" ? (
              <p role="status">{t("mobileFitness.trendLoading")}</p>
            ) : sectionState.trend === "error" ? (
              <>
                <p role="alert">{t("mobileFitness.trendError")}</p>
                {sectionState.onRetryTrend && (
                  <Button variant="secondary" onClick={sectionState.onRetryTrend}>
                    {sectionState.retryLabel ?? t("common:button.retry")}
                  </Button>
                )}
              </>
            ) : (
              <>
                {part === "condition" && pmcHistoryPoints && <ToggleControls variant="axis" aria-label={t("fitness:condition.chart.view")}>
                  {(["trend", "years", "activities"] as const).map(view => <ToggleButton key={view} selected={chartView === view} onClick={() => setChartViews(previous => ({ ...previous, [data.discipline]: view }))}>{t(view === "activities" ? "fitness:condition.chart.activities" : `fitness:history.mode.${view}`)}</ToggleButton>)}
                </ToggleControls>}
                {pmcHistoryPoints && (
                  <div className="mobile-fitness-pmc" hidden={part === "condition" && chartView === "activities"}>
                    <PmcHistoryPanel suppressMethodNotes={part === "condition" && data.discipline !== "tri"} controlledMode={part === "condition" ? chartView === "years" ? "years" : "trend" : undefined} hideModeControls={part === "condition"} key={data.discipline} points={pmcHistoryPoints} today={fitnessTodayKey(Date.now(), fitnessDateKeyBasis)} canonical={pmcHistoryCanonical} ctlColor={pmcCtlColor} variant="embedded" rangeChoices={data.discipline === "tri" ? [42, 90, 180, 365, "3y", "all"] : [30, 90, 180, 365, "3y", "all"]} />
                  </div>
                )}
                <div className="mobile-fitness-daily-details" hidden={part === "condition" && Boolean(pmcHistoryPoints) && chartView !== "activities"}>
                  {part === "condition" && <Text as="h2" variant="title">{t("fitness:condition.chart.activities")}</Text>}
                    {part === "condition" ? dailyChartContent : <DetailsSection title={t("fitness:history.dailyDetails")} defaultOpen={!pmcHistoryPoints}>{dailyChartContent}</DetailsSection>}
                </div>
              </>
            )}
          </SectionCard>

          </section>);
  const conditionStoryContent = conditionStory ? cloneElement(coachSlot as ReactElement<{ trendSlot?: ReactNode; evidenceNavSlot?: ReactNode }>, { trendSlot: conditionTrend, evidenceNavSlot: conditionNavigation }) : null;

  return (
    <div className={embedded ? "mobile-fitness-page mobile-fitness-page--embedded" : "mobile-fitness-page mobile-fitness-page--web"}>
      <h1 data-testid={part === "analysis" ? "K5-0-1" : part === "condition" ? "K1-0-1" : undefined} className={embedded ? "orider-embedded-page-title" : part === "condition" || part === "analysis" && !embedded ? "mobile-fitness-page__title" : "sr-only"}>{part === "analysis" ? t("fitness:analysis.header.title") : part === "condition" ? t("fitness:condition.header.title") : t("mobileFitness.title")}</h1>

      <div className="mobile-fitness-toolbar">
        <div data-testid={part === "analysis" ? "K5-0-2" : part === "condition" ? "K1-0-2" : undefined} className="mobile-fitness-toolbar__sports">
          {part === "condition" || part === "analysis" ? <DisciplineTabs includeTri disabledKeys={["swim"]} value={data.discipline} onChange={value => setSportSegment(value === "tri" ? "all" : value)} /> : <SportFilterTabs value={sportSegment} onChange={setSportSegment} allLabelKey="discipline.tri" />}
        </div>
        {part === "all" && data.discipline !== "tri" && <button type="button" className="mobile-fitness-mode-toggle"
          onClick={() => setTab(activeTab === "overview" ? "analysis" : "overview")}>
          {activeTab === "overview" ? analysisTabLabel : t("mobileFitness.tabOverview")}
        </button>}
      </div>


      {!embedded && part === "analysis" ? <div className="mobile-analysis-period">
        <Text as="p" variant="label">{t("fitness:history.range")}</Text>{periodSlot}
        <Text as="p" variant="caption" tone="secondary">{t("mobileFitness.periodScope")}</Text>
        <LocalizedLink to={`/coach/condition?sport=${data.discipline}`}>{t("mobileFitness.conditionLink")} →</LocalizedLink>
      </div> : periodSlot}
      {activeTab === "overview" && (
        <div style={{ paddingTop: "var(--space-2)" }}>
          {conditionStoryContent}
          {!conditionStory && <section id={part === "condition" ? "condition-current" : undefined} tabIndex={part === "condition" ? -1 : undefined} className={part === "condition" ? "condition-section-target" : undefined}>
          {part === "condition" && data.discipline === "tri" && data.combinedLoad ? (
            <div className="mobile-fitness-integrated-current"><IntegratedLoadCard condition={part === "condition"} combined={data.combinedLoad} focus={data.loadFocus} />
              {currentBasis && <Text as="p" variant="caption" tone="secondary">{currentBasis}</Text>}
              {loadSet && loadForm && <SufficiencyInline set={loadSet} block={loadForm} testId="K1-1-1-sufficiency-inline" />}
            </div>
          ) : <SectionCard specId={part === "condition" ? "K1-1" : undefined} ariaLabel={data.discipline === "tri" ? t("mobileFitness.integrated.title") : t("mobileFitness.currentStatusTitle")} compact>
            {part === "condition" ? <>
              {currentStatusSlot && <><Text as="h2" variant="title" style={{ margin: "0 0 var(--space-3)" }}>{t("fitness:condition.current.title")}</Text>{currentStatusSlot}</>}
              <div data-mobile-fitness-status className="mobile-fitness-current-metrics">
                {(["ctl", "atl", "tsb"] as const).map(metric => <div key={metric}>
                  <Text as="div" variant="caption"><GlossaryText>{t(`fitness:${metric}`)}</GlossaryText></Text>
                  <Text as="div" variant="dataMedium">{data.hasLoadData && Number.isFinite(data[metric]) ? `${metric === "tsb" && data[metric] > 0 ? "+" : ""}${data[metric].toFixed(1)}` : "—"}</Text>
                </div>)}
              </div>
              {!currentStatusSlot && <Text as="p" variant="bodySmall" tone="secondary">{sectionState.trend === "loading" ? t("mobileFitness.trendLoading") : sectionState.trend === "error" ? t("mobileFitness.trendError") : tsbInterpretation}</Text>}
            </> : <div data-mobile-fitness-status className="mobile-fitness-status">
              <Text as="div" variant="eyebrow" className="mobile-fitness-status__label"><GlossaryText>{t("mobileFitness.kpiTsbLabel")}</GlossaryText><span className="mobile-fitness-status__meaning">{tsbInterpretation}</span></Text>
              <span className="mobile-fitness-status__value">{tsbValue == null ? "—" : tsbValue.toFixed(1)}</span>
            </div>}
            {currentBasis && <Text as="p" variant="caption" tone="secondary" style={{ marginTop: "var(--space-2)" }}>{currentBasis}</Text>}
            {loadSet && loadForm && <SufficiencyInline set={loadSet} block={loadForm} testId="K1-1-1-sufficiency-inline" />}
            {part === "condition" && data.discipline !== "tri" && <LocalizedLink data-testid="K1-1-3" to={`/coach/today?sport=${data.discipline}`}>{t("fitness:today.header.title")} →</LocalizedLink>}
            {data.discipline !== "tri" && todayDecisionState && !deferDisabledDecision && <TodayDecisionPreview state={todayDecisionState} signedIn={todayDecisionSignedIn} hasDetails={Boolean(coachSlot)} />}
          </SectionCard>}
          </section>}
          {part === "condition" && !conditionStory && conditionNavigation}

          {loadSet && needsSufficiencyCard(loadSet, loadTrend) && <SufficiencyCard set={loadSet} block={loadTrend} testId="K1-2-sufficiency" />}
          {/* IntegratedLoadCard는 현재 snapshot/기여도/포커스, PMC는 시간 추이만 담당한다. */}
          {!conditionStory && conditionTrend}


          {deferDisabledDecision && <div className="mobile-fitness-deferred-decision"><TodayDecisionPreview state={todayDecisionState} signedIn={todayDecisionSignedIn} hasDetails={Boolean(coachSlot)} /></div>}

          {!conditionStory && coachSlot && data.discipline !== "tri" && (
            <div data-mobile-fitness-coach style={{ padding: "0 var(--space-4) var(--space-3)" }}>
              {coachSlot}
            </div>
          )}

          {part === "all" && !embedded && data.discipline !== "tri" && (
            <div style={{ marginBottom: "var(--space-3)" }}>
              <SportPerformanceCard compact={!embedded} discipline={data.discipline} cycling={data.cyclingAbility} run={data.runEvidence} swim={data.swimEvidence} />
            </div>
          )}

          {part === "condition" && goalSummarySlot}

          <section id={part === "condition" ? "condition-load" : undefined} tabIndex={part === "condition" ? -1 : undefined} className={part === "condition" ? "mobile-fitness-load-section condition-section-target" : undefined}>
          {part === "condition" && <Text as="h2" variant="title">{t("fitness:condition.load.title")}</Text>}
          {part === "condition" && <Text as="p" variant="bodySmall" tone="secondary" style={{ paddingInline: "var(--space-4)" }}>{t("fitness:condition.load.description")}</Text>}
          {part === "condition" && periodEvidenceSlot && <SectionCard>{periodEvidenceSlot}</SectionCard>}
          {!embedded && part === "condition" && conditionSupplementSlot}
          {(part === "condition" || data.discipline === "bike") && consistencyStreak && (
            <div style={{ padding: "0 14px 14px" }}>
              <ConsistencyStreakCard summary={consistencyStreak} compact allSports={part === "condition"} />
            </div>
          )}

          {part !== "condition" && data.discipline === "tri" && data.combinedLoad && (
            <div style={{ marginBottom: "var(--space-3)" }}><IntegratedLoadCard combined={data.combinedLoad} focus={data.loadFocus} /></div>
          )}


          {/* 주간 TSS */}
          {sectionState.trend === "ready" && (data.weeklyTSS.length > 0 || data.weeklyLoadPartial) && (
            <SectionCard specId="K1-7-2" readableSub title={t(data.weeklyLoadStoredSummary ? "fitness:weekly.storedSummaryTitle" : "fitness:weekly.title")} sub={t(data.weeklyLoadStoredSummary ? "fitness:weekly.storedSummary" : "fitness:weekly.sub", { thisWeek: data.thisWeekUnknownCount && !data.hasKnownThisWeekLoad ? "–" : data.thisWeekTSS ?? "–", avg: data.loadUnknownCount && !data.hasKnownWeeklyLoad ? "–" : data.avgWeekTSS ?? "–", restDays: data.restDays ?? "–" })}>
              {!data.weeklyLoadStoredSummary && <WeeklyTssBars compact={!embedded} values={data.weeklyTSS} color={weeklyLoadColor} t={t} />}
              <div className="mobile-weekly-load__notes">
                {data.weeklyLoadPartial && <Text as="p" variant="bodyMedium">{t("fitness:weekly.partial")}</Text>}
                <Text as="p" variant="bodyMedium">{t(`fitness:hub.weekly.basis.${data.weeklyLoadDateBasis ?? "local"}`, { date: data.weeklyLoadAsOf ?? "–" })}</Text>
                {!!data.loadUnknownCount && <Text as="p" variant="caption">{trainingT("log.loadPartial", { count: data.loadUnknownCount })}</Text>}
              </div>
            </SectionCard>
          )}

          </section>

          {part === "condition" && data.discipline === "tri" && triEvidenceSlot && <section id="condition-metrics" tabIndex={-1} className="condition-section-target">{triEvidenceSlot}</section>}

          {part === "condition" && data.discipline !== "tri" && !mobileCondition && analysisContent}


          {!mobileCondition && bikeThresholdSection}
          {mobileCondition && <div className="mobile-condition-destinations">
            <LocalizedLink to={`/coach/analysis?sport=${data.discipline}`}>{t("mobileFitness.analysisDestination")} →</LocalizedLink>
            <LocalizedLink to={`/settings/training?sport=${data.discipline}`}>{t("fitness:condition.settings.title")} →</LocalizedLink>
          </div>}
          {part === "condition" && data.discipline !== "tri" && (mobileCondition ? <CoachDetailSection id="condition-methods" title={t("fitness:condition.story.methodsTitle")}><PmcHistoryMethodNotes canonical={pmcHistoryCanonical} /></CoachDetailSection> : <section className="condition-method-section"><Text as="h2" variant="title">{t("fitness:condition.story.methodsTitle")}</Text><PmcHistoryMethodNotes canonical={pmcHistoryCanonical} /></section>)}
          {!embedded && (mobileCondition && thresholdsSlot ? <CoachDetailSection id="thresholds" title={t("fitness:condition.settings.title")}>{thresholdsSlot}</CoachDetailSection> : thresholdsSlot)}

          {embedded && data.discipline !== "tri" && (
            <details className="mobile-fitness-provenance">
              <summary>{t(`mobileFitness.sport.${data.discipline}.title`)}</summary>
              <SportPerformanceCard compact={!embedded} discipline={data.discipline} cycling={data.cyclingAbility} run={data.runEvidence} swim={data.swimEvidence} />
            </details>
          )}

        </div>
      )}

      {activeTab === "analysis" && analysisContent}
    </div>
  );
}
