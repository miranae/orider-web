import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityStreams, ActivitySummary, LapData } from "@shared/types";
import { estimateRecoveryHours } from "@shared/training/recoveryTime";
import { buildClimbTableRows, formatClimbEntryTime } from "../utils/climbMetrics";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContext";
import ZoneDistributionChart from "./ZoneDistributionChart";
import PowerCurveChart from "./PowerCurveChart";
import MetabolismCard from "./MetabolismCard";
import InfoTip from "./InfoTip";
import { VirtualPowerBadge } from "./activity/VirtualPowerBadge";
import { Chip, Text } from "../theme/components";
import { useActivityMetrics, type ActivityMetricsDoc } from "../hooks/useActivityMetrics";
import { useFitnessTimeseries } from "../hooks/useFitnessTimeseries";
import ServerMetricsBanner from "./activity/ServerMetricsBanner";
import { buildCyclingDynamicsCards, type CyclingDynamicsCardDescriptor } from "../features/activity/detail/cyclingDynamicsPresentation";
import { LocalizedLink as Link } from "./LocalizedLink";
import { buildClimbSegmentProposalPath } from "../features/segmentCreation/climbPromotion";
import {
  POLARIZATION_DESCRIPTION,
  criticalBands as presentCriticalBands,
  hrZoneDistribution,
  powerCurvePoints,
  powerZoneDistribution,
  seilerZones as presentSeilerZones,
  wPrimeBalance as presentWPrimeBalance,
} from "../features/activity/detail/metricsPresentation";

/**
 * 활동 분석 탭 — **서버 `activity_metrics` 를 그린다. 계산하지 않는다.** (#2437)
 *
 * 이전엔 이 파일이 스트림에서 NP·TSS·존·파워커브·디커플링·TRIMP 를 22곳에서 다시 계산했고,
 * 그 사본(`src/utils/advancedMetrics.ts` 등 5개)은 서버와 본문이 갈라져 같은 활동이 화면과
 * 서버에서 다른 값을 냈다. 다른 사용자의 활동을 볼 때 서버 값을 못 읽어 재계산이 필요했던
 * 것인데, 이제 `activity_metrics` 읽기가 활동 가시성을 따르므로 그 이유가 사라졌다.
 *
 * 값이 아직 없으면(계산 중·미계산) **숫자 대신 상태**를 보인다 — 0 이나 빈 계산으로 채우지
 * 않는다. 그게 이 에픽이 없애려는 결함이다.
 */
type AccentColor = "lime" | "aqua" | "amber" | "rose" | "violet" | "ink";
const ACCENT: Record<AccentColor, string> = {
  lime: "var(--lime)",
  aqua: "var(--aqua)",
  amber: "var(--amber)",
  rose: "var(--rose)",
  violet: "var(--violet)",
  ink: "var(--ink-0)",
};

/** 임계영역 영문 라벨 → glossary 키 (calculateCriticalBands 의 고정 라벨) */
const BAND_GLOSSARY_KEY: Record<string, string> = {
  "Sweet Spot": "sweetSpot",
  "Threshold": "threshold",
  "VO2max": "vo2max",
  "Anaerobic": "anaerobic",
};

interface MetricCardProps {
  label: string;
  value: string | null | undefined;
  unit?: string;
  description?: string;
  color?: AccentColor;
  tone?: "default" | "good" | "warn" | "bad";
  /** 영문 약어 옆 ⓘ 툴팁 본문 (한글 용어 + 설명) */
  tooltip?: string;
}

function MetricCard({ label, value, unit, description, color = "ink", tone, tooltip }: MetricCardProps) {
  const baseColor = ACCENT[color];
  const accent = tone === "good" ? "var(--lime)"
    : tone === "warn" ? "var(--amber)"
    : tone === "bad" ? "var(--rose)"
    : baseColor;
  return (
    <div style={{
      padding: "14px 16px",
      borderRadius: "var(--r-xl)",
      background: "var(--bg-2)",
      border: "1px solid var(--line-soft)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)", marginBottom: "var(--space-1-5)" }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent, flexShrink: 0 }} />
        <Text variant="eyebrow" style={{ fontSize: "var(--fs-xs)" }}>{label}</Text>
        {tooltip && <InfoTip content={tooltip} label={label} />}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-1)", lineHeight: 1 }}>
        <Text variant="dataHero" style={{ fontSize: "var(--fs-xl)", color: value != null ? accent : "var(--ink-3)" }}>
          {value ?? "—"}
        </Text>
        {value != null && unit && <Text variant="unit">{unit}</Text>}
      </div>
      {description && (
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: 'var(--space-1)' }}>{description}</div>
      )}
    </div>
  );
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** 시:분:초 (시간이 0이어도 0:mm:ss로 강제) */
function formatHms(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface AnalysisTabProps {
  activityId?: string | null;
  /** 소유자 여부 — CTL 기반 회복 시간 등 개인 컨텍스트에만 쓴다. 지표 읽기 권한은 활동 가시성이 정한다. */
  isOwner?: boolean;
  /** 활동 시작 epoch (초 또는 밀리초). 클라임 진입 실제 현지 시각 계산에 사용. */
  startTime?: number | null;
  /** 랩·칼로리·FTP 폴백·기질 카드에만 쓴다. 지표는 여기서 계산하지 않는다. */
  streams: ActivityStreams;
  summary?: ActivitySummary;
  sport?: "ride" | "run" | "swim" | "other";
  isVirtualPower?: boolean;
  virtualPowerParams?: {
    riderWeightKg: number;
    bikeWeightKg: number;
    rollingResistance: number;
    cdA: number;
  };
}

interface SensorCandidateFlags {
  power: boolean;
  heartRate: boolean;
  cadence: boolean;
}
type FilteredActivityMetricsDoc = Omit<ActivityMetricsDoc, "workoutType" | "workoutTypeConfidence" | "zoneKj" | "lrBalance"> & {
  workoutType?: ActivityMetricsDoc["workoutType"];
  workoutTypeConfidence?: number;
  zoneKj?: ActivityMetricsDoc["zoneKj"];
  lrBalance?: ActivityMetricsDoc["lrBalance"];
};

export function filterServerMetricsForSensorCandidates(
  metrics: ActivityMetricsDoc | null,
  candidates: SensorCandidateFlags,
): FilteredActivityMetricsDoc | null {
  if (!metrics) return null;
  const filteredMetrics: FilteredActivityMetricsDoc = { ...metrics };
  if (candidates.power || candidates.heartRate) {
    delete filteredMetrics.workoutType;
    delete filteredMetrics.workoutTypeConfidence;
  }
  const cyclingMetrics = metrics.cyclingMetrics
    ? {
        ...metrics.cyclingMetrics,
        longestZ4PlusSec: candidates.power ? null : metrics.cyclingMetrics.longestZ4PlusSec,
        cadenceStdDev: candidates.cadence ? null : metrics.cyclingMetrics.cadenceStdDev,
      }
    : undefined;

  return {
    ...filteredMetrics,
    sufferScore: candidates.heartRate ? null : metrics.sufferScore,
    quadrant: candidates.power || candidates.cadence ? null : metrics.quadrant,
    cyclingMetrics,
    zoneKj: candidates.power ? undefined : metrics.zoneKj,
    lrBalance: candidates.power ? undefined : metrics.lrBalance,
    cyclingDynamics: metrics.cyclingDynamics,
    climbs: candidates.power && Array.isArray(metrics.climbs)
      ? metrics.climbs.map((climb) => ({
          ...climb,
          avgPower: null,
          wPerKg: null,
          normalizedPower: null,
        }))
      : metrics.climbs,
  };
}

export function calculateKjPerHour(workKj: number | null, durationSec: number): number | null {
  if (workKj == null || durationSec <= 0) return null;
  return (workKj / durationSec) * 3600;
}

function WPrimeBalChart({ series, wPrimeMaxJ, idxMin }: { series: number[]; wPrimeMaxJ: number; idxMin: number }) {
  const w = 480, h = 110;
  const n = series.length;
  if (n < 2 || wPrimeMaxJ <= 0) return null;
  const sx = (i: number) => (i / (n - 1)) * w;
  const sy = (v: number) => h - (Math.max(0, Math.min(v, wPrimeMaxJ)) / wPrimeMaxJ) * h;
  const line = series.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(" ");
  const area = `M0 ${h} ` + series.map((v, i) => `L${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(" ") + ` L${w} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 110, display: "block" }} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((p) => <line key={p} x1="0" x2={w} y1={h * p} y2={h * p} stroke="var(--grid-soft)" />)}
      <path d={area} fill="var(--amber)" opacity="0.15" />
      <path d={line} stroke="var(--amber)" strokeWidth="1.5" fill="none" />
      <circle cx={sx(idxMin)} cy={sy(series[idxMin]!)} r="3.5" fill="var(--rose)" />
    </svg>
  );
}

export default function AnalysisTab({ activityId, isOwner = false, startTime, streams, summary, sport, isVirtualPower, virtualPowerParams }: AnalysisTabProps) {
  // 읽기 권한은 활동 가시성이 정한다 — 소유자 게이트가 있으면 뷰어는 영원히 "없음" 을 본다.
  const serverMetrics = useActivityMetrics(activityId ?? null, true);
  const sm = useMemo(() => filterServerMetricsForSensorCandidates(serverMetrics.metrics, {
    power: false, heartRate: false, cadence: false,
  }), [serverMetrics.metrics]);
  const { t } = useTranslation("activity");
  const { profile, user } = useAuth();
  const ctlDiscipline = sport === "run" ? "run" : sport === "swim" ? "swim" : "bike";
  const { timeseries: ctlTs } = useFitnessTimeseries(isOwner ? user?.uid : undefined, ctlDiscipline);
  const currentCtl = ctlTs?.points?.[ctlTs.points.length - 1]?.ctl;
  const { units, locale } = useLocale();
  const M_PER_MI = 1609.344;
  const M_PER_FT = 0.3048;
  const distVal = (km: number) => units === 'imperial' ? (km * 1000 / M_PER_MI).toFixed(2) : km.toFixed(2);
  const distUnit = units === 'imperial' ? 'mi' : 'km';
  const speedVal = (kph: number) => units === 'imperial' ? (kph * 1000 / M_PER_MI).toFixed(1) : kph.toFixed(1);
  const speedUnit = units === 'imperial' ? 'mph' : 'km/h';
  const elevValRound = (m: number) => units === 'imperial' ? Math.round(m / M_PER_FT) : Math.round(m);
  const elevUnit = units === 'imperial' ? 'ft' : 'm';

  // ── 서버 값을 화면 변수로. 계산은 없다 — 이름은 이전 JSX 가 쓰던 것을 유지한다.
  // 계산에 쓰인 컨텍스트는 서버 스냅샷이 정본이다. 프로필 현재값과 다르면(FTP 갱신 뒤) 그
  // 차이가 화면에 드러나야 한다 — 프로필로 덮으면 IF 와 FTP 가 서로 다른 값에서 나온다.
  const ftp = sm?.contextSnapshot?.ftp ?? profile?.ftp ?? streams.ftp ?? 200;
  const hasFtp = sm?.contextSnapshot?.ftp != null || !!profile?.ftp || !!streams.ftp;
  const maxHr = sm?.contextSnapshot?.maxHr ?? sm?.hrZoneBoundaries?.referenceBpm ?? 190;
  const hasMaxHr = sm?.contextSnapshot?.maxHr != null;
  const weightKg = sm?.contextSnapshot?.weightKg ?? profile?.weightKg ?? null;
  const hasPower = sm != null && (sm.np != null || sm.avgPower != null);
  const hasHr = sm != null && sm.avgHr != null;
  const np = sm?.np ?? null;
  const ifactor = sm?.if ?? null;
  const tss = sm?.tss ?? null;
  const vi = sm?.vi ?? null;
  const xPower = sm?.xPower ?? null;
  // 최대 파워는 3초 창 — 1초 최대는 스파이크에 취약하다. 서버가 3초를 못 냈으면 1초로.
  const powerStats = { avg: sm?.avgPower ?? null, max: sm?.maxPower3s ?? sm?.maxPower ?? null };
  const workKj = sm && hasPower ? sm.workKj : null;
  const durationSec = sm?.durationSec ?? 0;
  const powerDurationSec = sm?.movingTimeSec ?? sm?.durationSec ?? 0;
  const kjPerHr = calculateKjPerHour(workKj, powerDurationSec);
  const hrStats = { avg: sm?.avgHr ?? null, max: sm?.maxHr ?? null };
  const hrDrift = sm?.decoupling?.hrDriftPct ?? null;
  const ef = sm?.decoupling?.ef ?? null;
  const decoupling = sm?.decoupling?.decouplingPct ?? null;
  const trimp = sm?.trimp ?? null;
  const recovery = useMemo(() => {
    const load = tss ?? trimp ?? null;
    return load != null ? estimateRecoveryHours({ load, ctl: currentCtl }) : null;
  }, [tss, trimp, currentCtl]);
  const cadenceStats = { avg: sm?.avgCadence ?? null, max: sm?.maxCadence ?? null };
  // 요약(summary)은 제공자가 준 값이라 스트림 계산보다 우선한다 — 서버도 같은 순서다.
  const speed = {
    avgKph: summary?.averageSpeed && summary.averageSpeed > 0 ? summary.averageSpeed : sm?.avgSpeedKph ?? null,
    maxKph: summary?.maxSpeed && summary.maxSpeed > 0 && summary.maxSpeed < 120 ? summary.maxSpeed : sm?.maxSpeedKph ?? null,
  };
  const distanceKm = sm?.distanceKm ?? null;
  const elevGain = sm?.elevationGainM ?? null;
  const hrZones = useMemo(() => (sm && hasHr ? hrZoneDistribution(sm) : null), [sm, hasHr]);
  const powerZones = useMemo(() => (sm && hasPower ? powerZoneDistribution(sm) : null), [sm, hasPower]);
  const seilerZones = useMemo(() => (sm && hasPower && sport !== "run" && sport !== "swim" ? presentSeilerZones(sm) : null), [sm, hasPower, sport]);
  const polarization = sm?.polarization ?? null;
  const criticalBands = useMemo(() => (sm && hasPower ? presentCriticalBands(sm) : null), [sm, hasPower]);
  const powerCurve = useMemo(() => (sm && hasPower ? powerCurvePoints(sm) : []), [sm, hasPower]);
  const matches = sm && hasPower && sm.matches
    ? { count: sm.matches.count, totalSeconds: sm.matches.totalSec, avgPower: sm.matches.peakW || null, longestSeconds: sm.matches.longestSec ?? 0, longestAvgPower: sm.matches.longestW || null }
    : null;
  const cp = sm && hasPower && !isVirtualPower && sm.cp != null && sm.wPrime != null
    ? { cp: sm.cp, wPrime: sm.wPrime, rSquared: sm.cpR2 ?? 0 }
    : null;
  const wbal = useMemo(() => (sm && cp ? presentWPrimeBalance(sm) : null), [sm, cp]);
  // 서버 클라임만 쓴다 — 클라이언트 검출 폴백은 없다(빈 배열).
  const climbRows = useMemo(() => buildClimbTableRows(sm?.climbs, [], {
    distance: streams.distance,
    time: streams.time,
    activityStartTime: startTime,
    elapsedDurationSec: summary?.elapsedTimeMillis != null
      ? summary.elapsedTimeMillis / 1000
      : summary?.ridingTimeMillis != null ? summary.ridingTimeMillis / 1000 : null,
    routeOffsetSec: streams.device_temperature?.routeOffsetSec,
    routeRecordStartTimeMs: streams.device_temperature?.startTimeMs,
  }), [sm?.climbs, startTime, summary?.elapsedTimeMillis, summary?.ridingTimeMillis, streams.device_temperature?.routeOffsetSec, streams.device_temperature?.startTimeMs, streams.distance, streams.time]);
  const runSplits = useMemo(() => (sport === "run" ? (sm?.splits ?? []).map((s) => ({
    km: s.km,
    paceSecPerKm: s.paceSec,
    gapSecPerKm: s.gapSec,
    avgHr: s.avgHr,
    avgCadence: s.avgCadence ?? null,
    elevationGain: s.elevGain,
    elevationLoss: s.elevLoss ?? 0,
  })) : []), [sm?.splits, sport]);
  const overallGap = sport === "run" ? sm?.runMetrics?.gapAvgSec ?? null : null;
  const peakKey = [5, 60, 300, 1200, 3600];
  const peakRows = useMemo(() => peakKey.map((d) => {
    const pt = powerCurve.find((p) => p.durationSeconds === d);
    return { duration: d, watts: pt?.maxPower ?? null, wkg: pt && weightKg ? pt.maxPower / weightKg : null };
  }), [powerCurve, weightKg]);
  // 기질(지방/탄수) 카드는 아직 원시 파워로 웹이 적분한다 — 서버 정본 이전 대상(남은 항목).
  const laps = streams.laps;

  // 파워 존 뷰 토글: Coggan 7존 ↔ Seiler 3존
  const [powerZoneView, setPowerZoneView] = useState<"coggan" | "seiler">("coggan");
  const cyclingDynamicsCards = buildCyclingDynamicsCards({
    cyclingDynamics: sm?.cyclingDynamics,
    lrBalance: sm?.lrBalance,
  });

  const cyclingDynamicsDescription = (card: CyclingDynamicsCardDescriptor): string => {
    switch (card.kind) {
      case "balance": return t("analysis.metric.pedalBalanceDesc", { value: card.detailValue });
      case "torqueEffectiveness": return t("analysis.metric.torqueEffectivenessDesc");
      case "pedalSmoothness": return card.detailValue
        ? t("analysis.metric.pedalSmoothnessCombined", { value: card.detailValue })
        : t("analysis.metric.pedalSmoothnessDesc");
      case "platformCenterOffset": return t("analysis.metric.platformCenterOffsetDesc");
      case "powerPhaseLeft":
      case "powerPhaseRight": {
        const [arc, peak] = card.detailValue?.split("|") ?? [];
        return peak
          ? t("analysis.metric.powerPhasePeakDesc", { arc, peak })
          : t("analysis.metric.powerPhaseDesc", { arc });
      }
      case "coverage": {
        const [samples, source] = card.detailValue?.split("|") ?? [];
        return t("analysis.metric.dynamicsCoverageDesc", {
          samples,
          source: source === "session" ? t("analysis.metric.dynamicsSourceSession") : t("analysis.metric.dynamicsSourceRecords"),
        });
      }
    }
  };

  const cyclingDynamicsLabel = (card: CyclingDynamicsCardDescriptor): string => {
    switch (card.kind) {
      case "balance": return t("analysis.metric.pedalBalance");
      case "torqueEffectiveness": return t("analysis.metric.torqueEffectiveness");
      case "pedalSmoothness": return t("analysis.metric.pedalSmoothness");
      case "platformCenterOffset": return t("analysis.metric.platformCenterOffset");
      case "powerPhaseLeft": return t("analysis.metric.powerPhaseLeft");
      case "powerPhaseRight": return t("analysis.metric.powerPhaseRight");
      case "coverage": return t("analysis.metric.dynamicsCoverage");
    }
  };

  const cyclingDynamicsGlossary = (card: CyclingDynamicsCardDescriptor): string => {
    switch (card.kind) {
      case "balance": return t("analysis.glossary.pedalBalance");
      case "torqueEffectiveness": return t("analysis.glossary.torqueEffectiveness");
      case "pedalSmoothness": return t("analysis.glossary.pedalSmoothness");
      case "platformCenterOffset": return t("analysis.glossary.platformCenterOffset");
      case "powerPhaseLeft":
      case "powerPhaseRight": return t("analysis.glossary.powerPhase");
      case "coverage": return t("analysis.glossary.dynamicsCoverage");
    }
  };

  if (!hasPower && !hasHr && cyclingDynamicsCards.length === 0) {
    return (
      <div className="rounded-[var(--r-lg)] border border-dashed px-4 py-8 text-center" style={{ background: 'var(--bg-1)', borderColor: 'var(--line-soft)' }}>
        <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: 'var(--ink-1)' }}>
          {t("analysis.empty.noStreamsTitle")}
        </div>
        <div className="mx-auto mt-1 max-w-[420px] text-[length:var(--fs-xs)] leading-relaxed" style={{ color: 'var(--ink-3)' }}>
          {t("analysis.noData")}
        </div>
      </div>
    );
  }

  // 디커플링 톤 (5% 미만 우수, 5-10% 보통, 10%+ 드리프트)
  const decoupTone = decoupling == null ? "default"
    : decoupling < 5 ? "good" : decoupling < 10 ? "warn" : "bad";

  return (
    <div className="space-y-6">
      {/* Phase A.7: 서버 메트릭 배너 (있으면 표시) */}
      <ServerMetricsBanner
        state={serverMetrics}
        suppressPowerMetrics={false}
        suppressHeartRateMetrics={false}
      />

      {/* FTP/maxHR 기본값 경고 */}
      {hasPower && !hasFtp && (
        <div className="rounded-[var(--r-lg)] px-4 py-2.5 text-[length:var(--fs-xs)]" style={{ background: 'color-mix(in srgb, var(--amber) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--amber) 30%, transparent)', color: 'var(--amber)' }}>
          {t("analysis.ftpFallback", { ftp })}
        </div>
      )}
      {hasHr && !hasMaxHr && (
        <div className="rounded-[var(--r-lg)] px-4 py-2.5 text-[length:var(--fs-xs)]" style={{ background: 'color-mix(in srgb, var(--amber) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--amber) 30%, transparent)', color: 'var(--amber)' }}>
          {t("analysis.maxHrFallback", { hr: maxHr })}
        </div>
      )}

      {/* 부하 (Load) — intervals.icu 스타일 핵심 지표 */}
      <div>
        <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>{t("analysis.section.load")}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <MetricCard color="violet" label="TSS" value={tss?.toFixed(0)} description={t("analysis.metric.tssDesc")} tooltip={t("analysis.glossary.tss")} />
          <MetricCard color="violet" label="IF" value={ifactor?.toFixed(2)} description={hasFtp ? t("analysis.metric.ifDesc", { ftp }) : t("analysis.metric.ifDescDefault", { ftp })} tooltip={t("analysis.glossary.if")} />
          <MetricCard color="lime" label={t("analysis.metric.work")} value={workKj != null ? Math.round(workKj).toString() : null} unit="kJ" description={t("analysis.metric.workDesc")} tooltip={t("analysis.glossary.work")} />
          <MetricCard color="lime" label={t("analysis.metric.kjPerHour")} value={kjPerHr != null ? Math.round(kjPerHr).toString() : null} unit="kJ/h" description={t("analysis.metric.kjPerHourDesc")} tooltip={t("analysis.glossary.kjPerHour")} />
          <MetricCard color="rose" label="TRIMP" value={trimp != null ? Math.round(trimp).toString() : null} description={t("analysis.metric.trimpDesc")} tooltip={t("analysis.glossary.trimp")} />
          {sm?.sufferScore != null && (
            <MetricCard color="rose" label={t("analysis.metric.sufferScore")} value={Math.round(sm.sufferScore).toString()} description={t("analysis.metric.sufferScoreDesc")} tooltip={t("analysis.glossary.sufferScore")} />
          )}
          <MetricCard color="amber" label={t("analysis.metric.recovery")} value={recovery != null ? `~${recovery.hours}` : null} unit="h" description={t("analysis.metric.recoveryDesc")} tooltip={t("analysis.glossary.recovery")} />
          <MetricCard color="aqua" label={t("analysis.metric.duration")} value={durationSec > 0 ? formatHms(durationSec) : null} description={t("analysis.metric.durationDesc")} tooltip={t("analysis.glossary.duration")} />
        </div>
      </div>

      {/* 파워 분석 */}
      {hasPower && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: 'var(--ink-1)' }}>{t("analysis.section.power")}</h3>
            {isVirtualPower && <VirtualPowerBadge params={virtualPowerParams} />}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <MetricCard color="lime" label={t("analysis.metric.avgPower")} value={powerStats.avg != null ? Math.round(powerStats.avg).toString() : null} unit="W" tooltip={t("analysis.glossary.avgPower")} />
            <MetricCard color="lime" label={t("analysis.metric.maxPower")} value={powerStats.max != null ? Math.round(powerStats.max).toString() : null} unit="W" description={t("analysis.metric.maxPowerDesc")} tooltip={t("analysis.glossary.maxPower")} />
            <MetricCard color="violet" label="NP" value={np != null ? Math.round(np).toString() : null} unit="W" description={t("analysis.metric.npDesc")} tooltip={t("analysis.glossary.np")} />
            <MetricCard color="violet" label="xPower" value={xPower != null ? Math.round(xPower).toString() : null} unit="W" description={t("analysis.metric.xPowerDesc")} tooltip={t("analysis.glossary.xpower")} />
            <MetricCard color="amber" label="VI" value={vi?.toFixed(2)} description={t("analysis.metric.viDesc")} tooltip={t("analysis.glossary.vi")} />
            {weightKg && (
              <>
                <MetricCard color="lime" label={t("analysis.metric.wkgAvg")} value={powerStats.avg != null ? (powerStats.avg / weightKg).toFixed(2) : null} unit="W/kg" tooltip={t("analysis.glossary.wkgAvg")} />
                <MetricCard color="violet" label={t("analysis.metric.wkgNp")} value={np != null ? (np / weightKg).toFixed(2) : null} unit="W/kg" tooltip={t("analysis.glossary.wkgNp")} />
              </>
            )}
          </div>
        </div>
      )}

      {/* 임계 파워 (CP / W') + 매치 분석 */}
      {hasPower && (cp || (matches && matches.count > 0)) && (
        <div>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>{t("analysis.section.criticalPower")}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {cp && (
              <>
                <MetricCard color="violet" label={t("analysis.metric.cp")} value={Math.round(cp.cp).toString()} unit="W" description={t("analysis.metric.cpDesc", { value: cp.rSquared.toFixed(2) })} tooltip={t("analysis.glossary.cp")} />
                <MetricCard color="amber" label={t("analysis.metric.wPrime")} value={Math.round(cp.wPrime / 1000).toString()} unit="kJ" description={t("analysis.metric.wPrimeDesc")} tooltip={t("analysis.glossary.wprime")} />
              </>
            )}
            {matches && matches.count > 0 && (
              <>
                <MetricCard color="rose" label={t("analysis.metric.matches")} value={matches.count.toString()} unit={t("analysis.metric.matchesUnit")} description={t("analysis.metric.matchesDesc", { ftp })} tooltip={t("analysis.glossary.matches")} />
                <MetricCard color="rose" label={t("analysis.metric.matchesTime")} value={formatDuration(matches.totalSeconds)} description={matches.avgPower != null ? t("analysis.metric.matchesTimeDesc", { value: Math.round(matches.avgPower) }) : undefined} tooltip={t("analysis.glossary.matchesTime")} />
                <MetricCard color="rose" label={t("analysis.metric.longestMatch")} value={matches.longestSeconds > 0 ? formatDuration(matches.longestSeconds) : null} description={matches.longestAvgPower != null ? `${Math.round(matches.longestAvgPower)}W` : undefined} tooltip={t("analysis.glossary.longestMatch")} />
              </>
            )}
          </div>
          {/* #458 W'bal 잔량 궤적 차트 (CP/W' 추정 있을 때만) */}
          {wbal && cp && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[length:var(--fs-xs)] font-medium" style={{ color: 'var(--ink-2)' }}>{t("analysis.metric.wPrimeBal")}</span>
                  <InfoTip content={t("analysis.glossary.wPrimeBal")} label={t("analysis.metric.wPrimeBal")} />
                </div>
                <span className="text-[length:var(--fs-xs)] tabular-nums" style={{ color: 'var(--rose)' }}>
                  {t("analysis.metric.wPrimeBalMin", { pct: Math.round((wbal.minJ / cp.wPrime) * 100) })}
                </span>
              </div>
              <WPrimeBalChart series={wbal.series} wPrimeMaxJ={cp.wPrime} idxMin={wbal.idxMin} />
            </div>
          )}
        </div>
      )}

      {cyclingDynamicsCards.length > 0 && (
        <div>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>{t("analysis.section.cyclingDynamics")}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {cyclingDynamicsCards.map((card) => (
              <MetricCard
                key={card.kind}
                color={card.kind === "balance" ? "aqua" : card.kind === "coverage" ? "ink" : "violet"}
                label={cyclingDynamicsLabel(card)}
                value={card.value}
                unit={card.unit}
                description={cyclingDynamicsDescription(card)}
                tooltip={cyclingDynamicsGlossary(card)}
              />
            ))}
          </div>
        </div>
      )}

      {/* #459/#462 페달링 사분면 + 노력 품질 (서버 사전계산 메트릭 노출) */}
      {hasPower && (sm?.quadrant || sm?.cyclingMetrics?.cadenceStdDev != null || sm?.cyclingMetrics?.longestZ4PlusSec != null) && (
        <div>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>{t("analysis.section.pedalQuality")}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {sm?.quadrant && (
              <>
                <MetricCard color="lime" label={t("analysis.metric.q1")} value={Math.round(sm.quadrant.q1Pct).toString()} unit="%" description={t("analysis.metric.q1Desc")} tooltip={t("analysis.glossary.quadrant")} />
                <MetricCard color="amber" label={t("analysis.metric.q4")} value={Math.round(sm.quadrant.q4Pct).toString()} unit="%" description={t("analysis.metric.q4Desc")} tooltip={t("analysis.glossary.quadrant")} />
                <MetricCard color="aqua" label={t("analysis.metric.q2")} value={Math.round(sm.quadrant.q2Pct).toString()} unit="%" description={t("analysis.metric.q2Desc")} tooltip={t("analysis.glossary.quadrant")} />
                <MetricCard color="ink" label={t("analysis.metric.q3")} value={Math.round(sm.quadrant.q3Pct).toString()} unit="%" description={t("analysis.metric.q3Desc")} tooltip={t("analysis.glossary.quadrant")} />
              </>
            )}
            {sm?.cyclingMetrics?.longestZ4PlusSec != null && sm.cyclingMetrics.longestZ4PlusSec > 0 && (
              <MetricCard color="amber" label={t("analysis.metric.longestZ4")} value={formatDuration(sm.cyclingMetrics.longestZ4PlusSec)} description={t("analysis.metric.longestZ4Desc")} tooltip={t("analysis.glossary.longestZ4")} />
            )}
            {sm?.cyclingMetrics?.cadenceStdDev != null && (
              <MetricCard color="violet" label={t("analysis.metric.cadenceConsistency")} value={sm.cyclingMetrics.cadenceStdDev.toFixed(0)} unit="rpm σ" description={t("analysis.metric.cadenceConsistencyDesc")} tooltip={t("analysis.glossary.cadenceConsistency")} />
            )}
          </div>
        </div>
      )}

      {/* 심박 분석 */}
      {hasHr && (
        <div>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>{t("analysis.section.hr")}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <MetricCard color="rose" label={t("analysis.metric.avgHr")} value={hrStats.avg != null ? Math.round(hrStats.avg).toString() : null} unit="bpm" tooltip={t("analysis.glossary.avgHr")} />
            <MetricCard color="rose" label={t("analysis.metric.maxHr")} value={hrStats.max != null ? Math.round(hrStats.max).toString() : null} unit="bpm" tooltip={t("analysis.glossary.maxHr")} />
            <MetricCard
              label={t("analysis.metric.hrDrift")}
              value={hrDrift != null ? `${hrDrift >= 0 ? "+" : ""}${hrDrift.toFixed(1)}%` : null}
              description={t("analysis.metric.hrDriftDesc")}
              tone={hrDrift == null ? "default" : Math.abs(hrDrift) < 3 ? "good" : Math.abs(hrDrift) < 6 ? "warn" : "bad"}
              tooltip={t("analysis.glossary.hrDrift")}
            />
            {hasPower && (
              <>
                <MetricCard color="aqua" label={t("analysis.metric.ef")} value={ef != null ? ef.toFixed(2) : null} description={t("analysis.metric.efDesc")} tooltip={t("analysis.glossary.ef")} />
                <MetricCard
                  label={t("analysis.metric.decoupling")}
                  value={decoupling != null ? `${decoupling >= 0 ? "+" : ""}${decoupling.toFixed(1)}%` : null}
                  description={t("analysis.metric.decouplingDesc")}
                  tone={decoupTone}
                  tooltip={t("analysis.glossary.decoupling")}
                />
              </>
            )}
          </div>
          {decoupling != null && (
            <div className="text-[length:var(--fs-xs)] mt-2" style={{ color: 'var(--ink-3)' }}>
              {decoupling < 5
                ? t("analysis.decoupling.good")
                : decoupling < 10
                  ? t("analysis.decoupling.warn")
                  : t("analysis.decoupling.bad")}
            </div>
          )}
        </div>
      )}

      {/* 임계 영역 (Sweet Spot / Threshold / VO2 / Anaerobic 시간) */}
      {criticalBands && criticalBands.some((b) => b.seconds > 0) && (
        <div>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>{t("analysis.section.criticalBands")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {criticalBands.map((b) => (
              <div key={b.label} style={{
                padding: "14px 16px",
                borderRadius: "var(--r-xl)",
                background: "var(--bg-2)",
                border: "1px solid var(--line-soft)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1-5)", marginBottom: "var(--space-1-5)" }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: b.color, flexShrink: 0 }} />
                  <Text variant="eyebrow" style={{ fontSize: "var(--fs-xs)" }}>{b.label}</Text>
                  {BAND_GLOSSARY_KEY[b.label] && (
                    <InfoTip content={t(`analysis.glossary.${BAND_GLOSSARY_KEY[b.label]}`)} label={b.label} />
                  )}
                </div>
                <Text as="div" variant="dataHero" style={{ fontSize: "var(--fs-xl)", color: b.seconds > 0 ? b.color : "var(--ink-3)", lineHeight: 1 }}>
                  {b.seconds > 0 ? formatDuration(b.seconds) : "—"}
                </Text>
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", marginTop: 'var(--space-1)' }}>{b.range}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 케이던스/속도/거리/고도 */}
      {(cadenceStats.avg != null || speed.avgKph != null || distanceKm != null || elevGain != null || streams.calories != null) && (
        <div>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>{t("analysis.section.exerciseData")}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <MetricCard color="aqua" label={t("analysis.metric.distance")} value={distanceKm != null ? distVal(distanceKm) : null} unit={distUnit} tooltip={t("analysis.glossary.distance")} />
            <MetricCard color="aqua" label={t("analysis.metric.elevGain")} value={elevGain != null && elevGain > 0 ? elevValRound(elevGain).toString() : null} unit={elevUnit} tooltip={t("analysis.glossary.elevGain")} />
            <MetricCard color="lime" label={t("analysis.metric.avgSpeed")} value={speed.avgKph != null ? speedVal(speed.avgKph) : null} unit={speedUnit} tooltip={t("analysis.glossary.avgSpeed")} />
            <MetricCard color="lime" label={t("analysis.metric.maxSpeed")} value={speed.maxKph != null ? speedVal(speed.maxKph) : null} unit={speedUnit} tooltip={t("analysis.glossary.maxSpeed")} />
            <MetricCard color="violet" label={t("analysis.metric.avgRpm")} value={cadenceStats.avg != null ? Math.round(cadenceStats.avg).toString() : null} unit="rpm" tooltip={t("analysis.glossary.avgRpm")} />
            <MetricCard color="violet" label={t("analysis.metric.maxRpm")} value={cadenceStats.max != null ? Math.round(cadenceStats.max).toString() : null} unit="rpm" tooltip={t("analysis.glossary.maxRpm")} />
            {sport === "run" && sm?.runMetrics?.paceStdDevSec != null && (
              <MetricCard color="aqua" label={t("analysis.metric.paceConsistency")} value={formatPace(sm.runMetrics.paceStdDevSec)} unit="σ" description={t("analysis.metric.paceConsistencyDesc")} tooltip={t("analysis.glossary.paceConsistency")} />
            )}
            {streams.calories != null && (
              <MetricCard color="amber" label={t("analysis.metric.calories")} value={Math.round(streams.calories).toString()} unit="kcal" tooltip={t("analysis.glossary.calories")} />
            )}
          </div>
        </div>
      )}

      {/* 에너지 대사 (FATMAX / 지방·탄수) — 바이크 + 충분한 파워 스트림일 때만 */}
      {hasPower && sport !== "run" && sport !== "swim" && sm.substrate && (
        <MetabolismCard
          substrate={sm.substrate}
          fatMax={sm.fatMax}
          isVirtualPower={isVirtualPower}
        />
      )}

      {/* 존 분포 */}
      {(hasHr || hasPower) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <h3 className="text-[length:var(--fs-sm)] font-semibold" style={{ color: 'var(--ink-1)' }}>{t("analysis.section.zones")}</h3>
              <InfoTip content={t("analysis.glossary.zones")} label={t("analysis.section.zones")} />
            </div>
            {/* Coggan ↔ Seiler 토글 (자전거+파워 있을 때만) */}
            {seilerZones && (
              <div className="flex items-center gap-1 rounded-[var(--r-md)] p-0.5" style={{ background: 'var(--bg-2)' }}>
                <button
                  onClick={() => setPowerZoneView("coggan")}
                  className="px-2.5 py-1 rounded-[var(--r-sm)] text-[length:var(--fs-xs)] font-medium transition-colors"
                  style={powerZoneView === "coggan"
                    ? { background: 'var(--bg-0)', color: 'var(--ink-0)', boxShadow: '0 1px 2px color-mix(in srgb, var(--bg-0) 15%, transparent)' }
                    : { color: 'var(--ink-3)' }}
                  aria-pressed={powerZoneView === "coggan"}
                >
                  {t("analysis.seiler.cogganTab")}
                </button>
                <button
                  onClick={() => setPowerZoneView("seiler")}
                  className="px-2.5 py-1 rounded-[var(--r-sm)] text-[length:var(--fs-xs)] font-medium transition-colors"
                  style={powerZoneView === "seiler"
                    ? { background: 'var(--bg-0)', color: 'var(--ink-0)', boxShadow: '0 1px 2px color-mix(in srgb, var(--bg-0) 15%, transparent)' }
                    : { color: 'var(--ink-3)' }}
                  aria-pressed={powerZoneView === "seiler"}
                >
                  {t("analysis.seiler.seilerTab")}
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {hasHr && (
              <ZoneDistributionChart
                title={t("analysis.zones.hr")}
                zones={hrZones ?? []}
                emptyTitle={t("analysis.empty.hrZonesTitle")}
                emptyDescription={t("analysis.empty.hrZonesDesc")}
              />
            )}
            {powerZoneView === "coggan" && powerZones && (
              <div>
                <ZoneDistributionChart
                  title={t("analysis.zones.power")}
                  zones={powerZones}
                  emptyTitle={t("analysis.empty.powerZonesTitle")}
                  emptyDescription={t("analysis.empty.powerZonesDesc")}
                />
                {/* #460 존별 일량(kJ) — 서버 사전계산 zoneKj 노출(시간 분포 보완) */}
                {sm?.zoneKj && (
                  <div className="mt-3">
                    <div className="text-[length:var(--fs-xs)] mb-1.5" style={{ color: 'var(--ink-3)' }}>{t("analysis.zones.powerKj")}</div>
                    <div className="grid grid-cols-7 gap-1">
                      {([1, 2, 3, 4, 5, 6, 7] as const).map((z) => {
                        const kj = Math.round((sm.zoneKj as Record<string, number>)[`z${z}`] ?? 0);
                        return (
                          <div key={z} className="text-center">
                            <div className="text-[length:var(--fs-xs)]" style={{ color: 'var(--ink-3)' }}>Z{z}</div>
                            <Text as="div" variant="mono" className="text-[length:var(--fs-xs)]" style={{ color: kj > 0 ? 'var(--ink-1)' : 'var(--ink-4)' }}>{kj}</Text>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {powerZoneView === "seiler" && seilerZones && polarization && (
              <div>
                <h4 className="text-[length:var(--fs-sm)] font-semibold mb-2" style={{ color: "var(--ink-1)" }}>
                  {t("analysis.seiler.title")}
                </h4>
                {/* Seiler 3존 막대 */}
                <div className="space-y-2 mb-3">
                  {seilerZones.map((z) => (
                    <div key={z.zone}>
                      <div className="flex items-center justify-between text-[length:var(--fs-xs)] mb-0.5" style={{ color: 'var(--ink-2)' }}>
                        <span>Z{z.zone} {z.label}</span>
                        <span className="tabular-nums">{z.pct.toFixed(1)}%</span>
                      </div>
                      <div className="h-5 rounded-[var(--r-sm)] overflow-hidden" style={{ background: 'var(--bg-2)' }}>
                        <div
                          className="h-full rounded-[var(--r-sm)] transition-all"
                          style={{ width: `${z.pct}%`, background: z.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {/* 양극화 판정 */}
                <div className="rounded-[var(--r-md)] px-3 py-2.5" style={{ background: 'var(--bg-2)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[length:var(--fs-xs)] mb-0.5" style={{ color: 'var(--ink-3)' }}>
                        {t("analysis.seiler.polarizationLabel")}
                      </div>
                      <div className="text-[length:var(--fs-sm)] font-semibold" style={{ color: 'var(--ink-0)' }}>
                        {t(`analysis.seiler.${polarization.verdict}`)}
                      </div>
                      <div className="text-[length:var(--fs-xs)] mt-0.5" style={{ color: 'var(--ink-2)' }}>
                        {POLARIZATION_DESCRIPTION[polarization.verdict][locale.startsWith("ko") ? "ko" : "en"]}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-[length:var(--fs-xs)]" style={{ color: 'var(--ink-3)' }}>
                        {t("analysis.seiler.extremePct")}
                      </div>
                      <div className="text-[length:var(--fs-sm)] tabular-nums font-semibold" style={{ color: 'var(--ink-0)' }}>
                        {polarization.extremePct.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 베스트 노력 (W/kg) */}
      {hasPower && powerCurve.length > 0 && (
        <div>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>{t("analysis.section.bestEfforts")}</h3>
          <div className="rounded-[var(--r-lg)] overflow-hidden" style={{ background: 'var(--bg-2)' }}>
            <table className="w-full text-[length:var(--fs-sm)]">
              <thead>
                <tr className="text-[length:var(--fs-xs)] uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
                  <th className="text-left px-4 py-2">{t("analysis.bestEfforts.duration")}</th>
                  <th className="text-right px-4 py-2">{t("analysis.bestEfforts.power")}</th>
                  {weightKg && <th className="text-right px-4 py-2">{t("analysis.bestEfforts.wkg")}</th>}
                  <th className="text-right px-4 py-2">{t("analysis.bestEfforts.ftpPercent")}</th>
                </tr>
              </thead>
              <tbody>
                {peakRows.filter((r) => r.watts != null).map((r) => (
                  <tr key={r.duration} className="border-t" style={{ borderColor: 'var(--bg-3)' }}>
                    <td className="px-4 py-2" style={{ color: 'var(--ink-1)' }}>
                      {r.duration < 60 ? t("analysis.bestEfforts.seconds", { count: r.duration })
                        : r.duration < 3600 ? t("analysis.bestEfforts.minutes", { count: r.duration / 60 })
                          : t("analysis.bestEfforts.hours", { count: r.duration / 3600 })}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--ink-0)' }}>{r.watts}W</td>
                    {weightKg && (
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--ink-0)' }}>
                        {r.wkg != null ? `${r.wkg.toFixed(2)}` : "-"}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>
                      {r.watts != null ? `${Math.round((r.watts / ftp) * 100)}%` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 파워 커브 */}
      {hasPower && (
        <div>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>{t("analysis.section.powerCurve")}</h3>
          <PowerCurveChart
            points={powerCurve}
            ftp={streams.ftp}
            emptyTitle={t("analysis.empty.powerCurveTitle")}
            emptyDescription={t("analysis.empty.powerCurveDesc")}
          />
        </div>
      )}

      {/* 클라임 자동 탐지 */}
      {climbRows.length > 0 && (
        <div>
          <h3 id="climb-analysis-heading" className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>{t("analysis.section.climbs", { count: climbRows.length })}</h3>
          <div className="rounded-[var(--r-lg)] overflow-x-auto" style={{ background: 'var(--bg-2)', border: '1px solid var(--line-soft)' }}>
            <table aria-labelledby="climb-analysis-heading" className="w-full text-[length:var(--fs-sm)]">
              <thead>
                <tr className="text-[length:var(--fs-xs)] uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
                  <th className="text-left px-3 py-2">{t("analysis.climbs.header.index")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.climbs.header.start")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.climbs.header.length")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.climbs.header.elev")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.climbs.header.avgGrade")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.climbs.header.duration")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.climbs.header.entryTime")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.climbs.header.vam")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.climbs.header.avgPower")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.climbs.header.wPerKg")}</th>
                  <th className="text-left px-3 py-2 pl-4">{t("analysis.climbs.header.category")}</th>
                  {isOwner && activityId && <th className="text-right px-3 py-2">{t("analysis.climbs.header.action")}</th>}
                </tr>
              </thead>
              <tbody>
                {climbRows.map((c, i) => {
                  const grade = c.category?.replace("Cat", "") ?? null;
                  const gradeColor = grade === "HC" ? "var(--rose)" : grade === "1" ? "var(--amber)" : grade === "2" ? "var(--violet)" : grade != null ? "var(--aqua)" : "var(--ink-4)";
                  const entryTime = formatClimbEntryTime(startTime, c.entrySec, locale);
                  return (
                    <tr key={i} className="border-t" style={{ borderColor: 'var(--line-soft)' }}>
                      <td className="px-3 py-2" style={{ color: 'var(--ink-1)' }}>{i + 1}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>{(units === 'imperial' ? (c.startKm * 1000 / M_PER_MI).toFixed(1) : c.startKm.toFixed(1))} {distUnit}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-0)' }}>{distVal(c.lengthKm)} {distUnit}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-0)' }}>{elevValRound(c.elevationGain)} {elevUnit}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--amber)' }}>{c.avgGrade.toFixed(1)} %</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: c.durationSec != null ? 'var(--ink-0)' : 'var(--ink-4)' }}>{c.durationSec != null ? formatDuration(c.durationSec) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: entryTime != null ? 'var(--ink-0)' : 'var(--ink-4)' }}>{entryTime ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: c.vam != null ? 'var(--ink-0)' : 'var(--ink-4)' }}>{c.vam != null ? Math.round(c.vam) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: c.avgPower != null ? 'var(--ink-0)' : 'var(--ink-4)' }}>{c.avgPower != null ? Math.round(c.avgPower) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: c.wPerKg != null ? 'var(--ink-0)' : 'var(--ink-4)' }}>{c.wPerKg != null ? c.wPerKg.toFixed(1) : "—"}</td>
                      <td className="px-3 py-2 pl-4">
                        <Chip style={{ background: gradeColor, color: 'var(--ink-0)', fontSize: "var(--fs-xs)", padding: '2px 8px', borderRadius: "9999px" }}>
                          {grade === "HC" ? "HC" : grade != null ? t("analysis.climbs.category", { grade }) : t("analysis.climbs.uncategorized")}
                        </Chip>
                      </td>
                      {isOwner && activityId && (
                        <td className="px-3 py-2 text-right">
                          <Link
                            to={buildClimbSegmentProposalPath(activityId, {
                              startKm: c.startKm,
                              endKm: c.startKm + c.lengthKm,
                            })}
                            className="inline-flex whitespace-nowrap rounded-[var(--r-md)] px-2.5 py-1 text-[length:var(--fs-xs)] font-semibold"
                            style={{
                              color: "var(--aqua)",
                              border: "1px solid color-mix(in srgb, var(--aqua) 35%, transparent)",
                              background: "color-mix(in srgb, var(--aqua) 10%, transparent)",
                            }}
                          >
                            {t("analysis.climbs.promote")}
                          </Link>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="text-[length:var(--fs-xs)] mt-2" style={{ color: 'var(--ink-3)' }}>
            {t("analysis.climbs.footnote")}
          </div>
        </div>
      )}

      {/* 러닝 — 1km 스플릿 + GAP */}
      {sport === "run" && runSplits.length > 0 && (
        <div>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>
            {t("analysis.section.splits")}
            {overallGap != null && (
              <span className="ml-3 text-[length:var(--fs-xs)] font-normal" style={{ color: 'var(--ink-3)' }}>
                {t("analysis.splits.overallGap", { pace: formatPace(overallGap) })}
              </span>
            )}
          </h3>
          <div className="rounded-[var(--r-lg)] overflow-x-auto" style={{ background: 'var(--bg-2)', border: '1px solid var(--line-soft)' }}>
            <table className="w-full text-[length:var(--fs-sm)]">
              <thead>
                <tr className="text-[length:var(--fs-xs)] uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
                  <th className="text-left px-3 py-2">{t("analysis.splits.header.km")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.splits.header.pace")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.splits.header.gap")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.splits.header.elev")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.splits.header.hr")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.splits.header.cadence")}</th>
                </tr>
              </thead>
              <tbody>
                {runSplits.map((s) => (
                  <tr key={s.km} className="border-t" style={{ borderColor: 'var(--line-soft)' }}>
                    <td className="px-3 py-2" style={{ color: 'var(--ink-1)' }}>{s.km}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-0)' }}>{formatPace(s.paceSecPerKm)}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--lime)' }}>
                      {s.gapSecPerKm != null ? formatPace(s.gapSecPerKm) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>
                      {s.elevationGain > 0 || s.elevationLoss > 0
                        ? `+${Math.round(s.elevationGain)} / -${Math.round(s.elevationLoss)}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--rose)' }}>
                      {s.avgHr != null ? Math.round(s.avgHr) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--violet)' }}>
                      {s.avgCadence != null ? Math.round(s.avgCadence) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[length:var(--fs-xs)] mt-2" style={{ color: 'var(--ink-3)' }}>
            {t("analysis.splits.footnote")}
          </div>
        </div>
      )}

      {/* 랩 분석 */}
      {laps && laps.length > 0 && (
        <LapTable laps={laps} ftp={ftp} />
      )}
    </div>
  );
}

function LapTable({ laps, ftp }: { laps: LapData[]; ftp: number }) {
  const { t } = useTranslation("activity");
  const { units } = useLocale();
  const M_PER_MI = 1609.344;
  const distVal = (km: number) => units === 'imperial' ? (km * 1000 / M_PER_MI).toFixed(2) : km.toFixed(2);
  const distUnit = units === 'imperial' ? 'mi' : 'km';
  const speedVal = (kph: number) => units === 'imperial' ? (kph * 1000 / M_PER_MI).toFixed(1) : kph.toFixed(1);
  const speedUnit = units === 'imperial' ? 'mph' : 'km/h';
  return (
    <div>
      <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>{t("analysis.section.lapAnalysis")}</h3>
      <div className="rounded-[var(--r-lg)] overflow-x-auto" style={{ background: 'var(--bg-2)' }}>
        <table className="w-full text-[length:var(--fs-sm)]">
          <thead>
            <tr className="text-[length:var(--fs-xs)] uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
              <th className="text-left px-3 py-2">{t("analysis.lap.header.lap")}</th>
              <th className="text-right px-3 py-2">{t("analysis.lap.header.time")}</th>
              <th className="text-right px-3 py-2">{t("analysis.lap.header.distance")}</th>
              <th className="text-right px-3 py-2">{t("analysis.lap.header.speed")}</th>
              <th className="text-right px-3 py-2">{t("analysis.lap.header.power")}</th>
              <th className="text-right px-3 py-2">{t("analysis.lap.header.ftpPercent")}</th>
              <th className="text-right px-3 py-2">{t("analysis.lap.header.hr")}</th>
              <th className="text-right px-3 py-2">{t("analysis.lap.header.rpm")}</th>
            </tr>
          </thead>
          <tbody>
            {laps.map((l) => {
              const sec = l.durationMs / 1000;
              const pacePerKm = l.distanceKm > 0 ? sec / l.distanceKm : 0;
              return (
                <tr key={l.number} className="border-t" style={{ borderColor: 'var(--bg-3)' }}>
                  <td className="px-3 py-2" style={{ color: 'var(--ink-1)' }}>{l.number}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-0)' }}>{formatDuration(sec)}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>{distVal(l.distanceKm)} {distUnit}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>
                    {l.avgSpeed > 0 ? `${speedVal(l.avgSpeed * 3.6)} ${speedUnit}` : pacePerKm > 0 ? `${formatPace(pacePerKm)}/km` : "-"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-0)' }}>
                    {l.avgPower > 0 ? `${Math.round(l.avgPower)}W` : "-"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>
                    {l.avgPower > 0 ? `${Math.round((l.avgPower / ftp) * 100)}%` : "-"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>
                    {l.avgHeartRate > 0 ? `${Math.round(l.avgHeartRate)}` : "-"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>
                    {l.avgCadence > 0 ? `${Math.round(l.avgCadence)}` : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
