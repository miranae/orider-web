import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityStreams, ActivitySummary, LapData } from "@shared/types";
import { estimateRecoveryHours } from "@shared/training/recoveryTime";
import { calculateNP, calculateIF, calculateTSS, calculateVI } from "../utils/powerMetrics";
import { calculateHrZoneDistribution, calculatePowerZoneDistribution, calculateSeilerZones, polarizationIndex } from "../utils/zoneAnalysis";
import { calculatePowerCurve } from "../utils/powerCurve";
import { plausibleWatts } from "../utils/plausibleWatts";
import {
  avgMax,
  calculateWorkKj,
  calculateEF,
  calculateDecoupling,
  calculateHrDrift,
  calculateTRIMP,
  calculateElevationGain,
  calculateCriticalBands,
  calculateAvgSpeed,
  calculateXPower,
  analyzeMatches,
  estimateCriticalPower,
  detectClimbs,
  wPrimeBalanceSeries,
} from "../utils/advancedMetrics";
import { calculateRunSplits, calculateOverallGap } from "../utils/runMetrics";
import { useAuth } from "../contexts/AuthContext";
import { useLocale } from "../contexts/LocaleContext";
import ZoneDistributionChart from "./ZoneDistributionChart";
import PowerCurveChart from "./PowerCurveChart";
import MetabolismCard from "./MetabolismCard";
import InfoTip from "./InfoTip";
import { VirtualPowerBadge } from "./activity/VirtualPowerBadge";
import { Chip, Text } from "../theme/components";
import { useActivityMetrics } from "../hooks/useActivityMetrics";
import { useFitnessTimeseries } from "../hooks/useFitnessTimeseries";
import ServerMetricsBanner from "./activity/ServerMetricsBanner";

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
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent, flexShrink: 0 }} />
        <Text variant="eyebrow" style={{ fontSize: "var(--fs-xs)" }}>{label}</Text>
        {tooltip && <InfoTip content={tooltip} label={label} />}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 3, lineHeight: 1 }}>
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
  /** Phase A.7 (2026-05-28): activity_metrics 구독을 위한 id. null/undefined 시
   *  hook 이 loading 유지 → 배너 미표시. 기존 client 재계산 그대로 동작. */
  activityId?: string | null;
  /** 현재 사용자가 이 활동의 owner 인지. activity_metrics 는 owner 만 read 가능하므로
   *  false 면 구독을 막아 permission-denied 알림 노이즈를 없앤다(기본 false — 안전측). */
  isOwner?: boolean;
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

/** #458 W'bal 잔량 궤적 미니 차트 — amber 라인 + 최저점(rose) 마커. */
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

export default function AnalysisTab({ activityId, isOwner = false, streams, summary, sport, isVirtualPower, virtualPowerParams }: AnalysisTabProps) {
  // Phase A.7: server-computed metrics 구독 (있으면 배너로 표시).
  // 현재는 client 재계산 결과와 병렬 표시 — 향후 점진적으로 server 우선 + 폴백 패턴으로 전환.
  // owner 가 아니면 구독 차단(owner-only doc) → permission-denied 회피.
  const serverMetrics = useActivityMetrics(activityId ?? null, isOwner);
  const sm = serverMetrics.metrics; // ready 일 때만 non-null (서버 사전계산 doc)
  const { t } = useTranslation("activity");
  const { profile, user } = useAuth();
  // #463 회복시간 개인화: owner 의 정본 CTL 시계열에서 현재 CTL 을 끌어와 추정에 주입.
  //  owner 가 아니면(타인 공개활동) CTL 은 owner-only 라 미조회 → 기본값 폴백(기존 동작).
  const ctlDiscipline = sport === "run" ? "run" : sport === "swim" ? "swim" : "bike";
  const { timeseries: ctlTs } = useFitnessTimeseries(isOwner ? user?.uid : undefined, ctlDiscipline);
  const currentCtl = ctlTs?.points?.[ctlTs.points.length - 1]?.ctl;
  const { units } = useLocale();
  const M_PER_MI = 1609.344;
  const M_PER_FT = 0.3048;
  const distVal = (km: number) => units === 'imperial' ? (km * 1000 / M_PER_MI).toFixed(2) : km.toFixed(2);
  const distUnit = units === 'imperial' ? 'mi' : 'km';
  const speedVal = (kph: number) => units === 'imperial' ? (kph * 1000 / M_PER_MI).toFixed(1) : kph.toFixed(1);
  const speedUnit = units === 'imperial' ? 'mph' : 'km/h';
  const elevValRound = (m: number) => units === 'imperial' ? Math.round(m / M_PER_FT) : Math.round(m);
  const elevUnit = units === 'imperial' ? 'ft' : 'm';
  // 우선순위: 사용자 프로필(현재값) → 활동 스트림 스냅샷 → 기본값
  // 프로필을 우선해 임계값 변경이 과거 활동 분석에 즉시 반영되도록 한다.
  const ftp = profile?.ftp || streams.ftp || 200;
  const maxHr = profile?.maxHr || streams.maxHr || 190;
  const restHr = 60; // 기본 안정 심박. 향후 프로필에서
  const weightKg = profile?.weightKg ?? null;
  const hasFtp = !!profile?.ftp || !!streams.ftp;
  const hasMaxHr = !!profile?.maxHr || !!streams.maxHr;

  // 서버(activity-metrics)와 동일하게 plausibleWatts 로 정제(#532) — 비현실 파워(평균/5분>2×FTP)
  // 는 []→파워지표 미표시, 고립 스파이크는 2000W 클램프. 서버 사전계산값과 발산 방지.
  const watts = useMemo(() => {
    const raw = (streams.watts && streams.watts.length > 0 ? streams.watts : streams.watts_calc) ?? [];
    return plausibleWatts(raw, ftp) ?? [];
  }, [streams.watts, streams.watts_calc, ftp]);
  const hr = streams.heartrate ?? [];
  const hasPower = watts.length > 0;
  const hasHr = hr.length > 0;

  // 파워 메트릭
  const np = useMemo(() => hasPower ? calculateNP(watts) : null, [watts, hasPower]);
  const ifactor = useMemo(() => hasPower ? calculateIF(watts, ftp) : null, [watts, ftp, hasPower]);
  const tss = useMemo(() => hasPower ? calculateTSS(watts, ftp) : null, [watts, ftp, hasPower]);
  const vi = useMemo(() => hasPower ? calculateVI(watts) : null, [watts, hasPower]);
  const powerStats = useMemo(() => {
    const base = avgMax(watts, { ignoreZero: false });
    // 최대 파워는 3초 평활값으로 — 파워미터 단발 스파이크 제거
    if (watts.length >= 3) {
      let sum = watts[0]! + watts[1]! + watts[2]!;
      let smoothMax = sum / 3;
      for (let i = 3; i < watts.length; i++) {
        sum += watts[i]! - watts[i - 3]!;
        const a = sum / 3;
        if (a > smoothMax) smoothMax = a;
      }
      return { ...base, max: smoothMax };
    }
    return base;
  }, [watts]);
  const workKj = useMemo(() => hasPower ? calculateWorkKj(watts) : null, [watts, hasPower]);
  const durationSec = useMemo(() => {
    // 1Hz 스트림 길이를 기준으로 함 (가장 안정적)
    const sampleLen = Math.max(watts.length, hr.length, streams.cadence?.length ?? 0, streams.velocity_smooth?.length ?? 0);
    if (sampleLen > 0) return sampleLen;
    if (streams.time?.length) {
      const span = streams.time[streams.time.length - 1]! - streams.time[0]!;
      // ms로 저장된 경우 자동 보정 (샘플당 100ms 이상이면 ms로 간주)
      return span > 100000 ? Math.round(span / 1000) : span;
    }
    return 0;
  }, [streams.time, watts.length, hr.length, streams.cadence?.length, streams.velocity_smooth?.length]);
  const kjPerHr = useMemo(() => {
    if (workKj == null || durationSec <= 0) return null;
    return (workKj / durationSec) * 3600;
  }, [workKj, durationSec]);

  // 심박 메트릭
  const hrStats = useMemo(() => avgMax(hr, { ignoreZero: true }), [hr]);
  const hrDrift = useMemo(() => hasHr ? calculateHrDrift(hr) : null, [hr, hasHr]);
  const ef = useMemo(() => hasPower && hasHr ? calculateEF(watts, hr) : null, [watts, hr, hasPower, hasHr]);
  const decoupling = useMemo(() => hasPower && hasHr ? calculateDecoupling(watts, hr) : null, [watts, hr, hasPower, hasHr]);
  const trimp = useMemo(() => hasHr ? calculateTRIMP(hr, maxHr, restHr) : null, [hr, maxHr, restHr, hasHr]);
  // 회복시간 추정 — 세션 부하(TSS 우선, 없으면 TRIMP)를 만성 체력(CTL)에 상대화.
  // #463: owner 면 정본 CTL 주입(비개인화 DEFAULT_CTL=35 제거), 아니면 기본값 폴백.
  const recovery = useMemo(() => {
    const load = tss ?? trimp ?? null;
    return load != null ? estimateRecoveryHours({ load, ctl: currentCtl }) : null;
  }, [tss, trimp, currentCtl]);

  // 케이던스/속도/거리/고도
  const cadenceStats = useMemo(() => avgMax(streams.cadence, { ignoreZero: true }), [streams.cadence]);
  const speed = useMemo(() => {
    const stream = calculateAvgSpeed(streams);
    // 요약값(휠센서/FIT 우선)이 있으면 사용
    return {
      avgKph: summary?.averageSpeed && summary.averageSpeed > 0 ? summary.averageSpeed : stream.avgKph,
      maxKph: summary?.maxSpeed && summary.maxSpeed > 0 && summary.maxSpeed < 120 ? summary.maxSpeed : stream.maxKph,
    };
  }, [streams, summary?.averageSpeed, summary?.maxSpeed]);
  const distanceKm = useMemo(() => {
    if (!streams.distance?.length) return null;
    const last = streams.distance[streams.distance.length - 1]!;
    const first = streams.distance[0]!;
    return (last - first) / 1000;
  }, [streams.distance]);
  const elevGain = useMemo(() => calculateElevationGain(streams.altitude), [streams.altitude]);

  // 존 분포 + 임계 영역
  const hrZones = useMemo(() => hasHr ? calculateHrZoneDistribution(hr, maxHr) : null, [hr, maxHr, hasHr]);
  const powerZones = useMemo(() => hasPower ? calculatePowerZoneDistribution(watts, ftp) : null, [watts, ftp, hasPower]);
  // Seiler 3존 (자전거 + 파워 있을 때만)
  const seilerZones = useMemo(() => (hasPower && sport !== "run" && sport !== "swim") ? calculateSeilerZones(watts, ftp) : null, [watts, ftp, hasPower, sport]);
  const polarization = useMemo(() => seilerZones ? polarizationIndex(seilerZones) : null, [seilerZones]);
  const criticalBands = useMemo(() => hasPower ? calculateCriticalBands(watts, ftp) : null, [watts, ftp, hasPower]);
  const powerCurve = useMemo(() => hasPower ? calculatePowerCurve(watts) : [], [watts, hasPower]);
  const xPower = useMemo(() => hasPower ? calculateXPower(watts) : null, [watts, hasPower]);
  const matches = useMemo(() => hasPower ? analyzeMatches(watts, ftp, 30) : null, [watts, ftp, hasPower]);
  // 가상파워는 CP/W' fit 스킵(서버 activity-metrics 와 동일 게이트, #532) — 추정파워로 임계파워 산정 금지.
  const cp = useMemo(() => (hasPower && !isVirtualPower) ? estimateCriticalPower(powerCurve) : null, [powerCurve, hasPower, isVirtualPower]);
  // #458 W'bal 잔량 궤적 (Skiba 2015, 클라 계산). 1Hz 가정(AnalysisTab 다른 지표와 동일).
  const wbal = useMemo(
    () => (hasPower && cp ? wPrimeBalanceSeries(watts, cp.cp, cp.wPrime, 1) : null),
    [watts, cp, hasPower],
  );

  // 클라임 자동 탐지 (수영 제외)
  const climbs = useMemo(() => {
    if (sport === "swim") return [];
    return detectClimbs(streams.altitude, streams.distance, streams.time, 3, 500);
  }, [streams.altitude, streams.distance, streams.time, sport]);

  // 러닝 전용 — km 스플릿 + GAP
  const runSplits = useMemo(() => sport === "run" ? calculateRunSplits(streams) : [], [streams, sport]);
  const overallGap = useMemo(() => sport === "run" ? calculateOverallGap(streams) : null, [streams, sport]);

  // W/kg 베스트
  const peakKey = [5, 60, 300, 1200, 3600];
  const peakRows = useMemo(() => {
    return peakKey.map((d) => {
      const pt = powerCurve.find((p) => p.durationSeconds === d);
      return {
        duration: d,
        watts: pt?.maxPower ?? null,
        wkg: pt && weightKg ? pt.maxPower / weightKg : null,
      };
    });
  }, [powerCurve, weightKg]);

  // 랩 분석
  const laps = streams.laps;

  // 파워 존 뷰 토글: Coggan 7존 ↔ Seiler 3존
  const [powerZoneView, setPowerZoneView] = useState<"coggan" | "seiler">("coggan");

  if (!hasPower && !hasHr) {
    return (
      <div className="text-center py-12 text-[length:var(--fs-sm)]" style={{ color: 'var(--ink-3)' }}>
        {t("analysis.noData")}
      </div>
    );
  }

  // 디커플링 톤 (5% 미만 우수, 5-10% 보통, 10%+ 드리프트)
  const decoupTone = decoupling == null ? "default"
    : decoupling < 5 ? "good" : decoupling < 10 ? "warn" : "bad";

  return (
    <div className="space-y-6">
      {/* Phase A.7: 서버 메트릭 배너 (있으면 표시) */}
      <ServerMetricsBanner state={serverMetrics} />

      {/* FTP/maxHR 기본값 경고 */}
      {hasPower && !hasFtp && (
        <div className="rounded-[var(--r-lg)] px-4 py-2.5 text-[length:var(--fs-xs)]" style={{ background: 'rgba(232,176,74,0.12)', border: '1px solid rgba(232,176,74,0.3)', color: 'var(--amber)' }}>
          {t("analysis.ftpFallback", { ftp })}
        </div>
      )}
      {hasHr && !hasMaxHr && (
        <div className="rounded-[var(--r-lg)] px-4 py-2.5 text-[length:var(--fs-xs)]" style={{ background: 'rgba(232,176,74,0.12)', border: '1px solid rgba(232,176,74,0.3)', color: 'var(--amber)' }}>
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
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
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
      {hasPower && sport !== "run" && sport !== "swim" && watts.length >= 60 && (
        <MetabolismCard
          watts={watts}
          ftp={ftp}
          weightKg={weightKg}
          cp={cp?.cp ?? null}
          wPrime={cp?.wPrime ?? null}
          isVirtualPower={isVirtualPower}
        />
      )}

      {/* 존 분포 */}
      {(hrZones || powerZones) && (
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
                    ? { background: 'var(--bg-0)', color: 'var(--ink-0)', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }
                    : { color: 'var(--ink-3)' }}
                  aria-pressed={powerZoneView === "coggan"}
                >
                  {t("analysis.seiler.cogganTab")}
                </button>
                <button
                  onClick={() => setPowerZoneView("seiler")}
                  className="px-2.5 py-1 rounded-[var(--r-sm)] text-[length:var(--fs-xs)] font-medium transition-colors"
                  style={powerZoneView === "seiler"
                    ? { background: 'var(--bg-0)', color: 'var(--ink-0)', boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }
                    : { color: 'var(--ink-3)' }}
                  aria-pressed={powerZoneView === "seiler"}
                >
                  {t("analysis.seiler.seilerTab")}
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {hrZones && <ZoneDistributionChart title={t("analysis.zones.hr")} zones={hrZones} />}
            {powerZoneView === "coggan" && powerZones && (
              <div>
                <ZoneDistributionChart title={t("analysis.zones.power")} zones={powerZones} />
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
                        {polarization.descriptionKo}
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
                  <tr key={r.duration} className="border-t" style={{ borderColor: 'var(--bg-3, rgba(255,255,255,0.06))' }}>
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
      {powerCurve.length > 0 && (
        <div>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>{t("analysis.section.powerCurve")}</h3>
          <PowerCurveChart points={powerCurve} ftp={streams.ftp} />
        </div>
      )}

      {/* 클라임 자동 탐지 */}
      {climbs.length > 0 && (
        <div>
          <h3 className="text-[length:var(--fs-sm)] font-semibold mb-3" style={{ color: 'var(--ink-1)' }}>{t("analysis.section.climbs", { count: climbs.length })}</h3>
          <div className="rounded-[var(--r-lg)] overflow-x-auto" style={{ background: 'var(--bg-2)', border: '1px solid var(--line-soft)' }}>
            <table className="w-full text-[length:var(--fs-sm)]">
              <thead>
                <tr className="text-[length:var(--fs-xs)] uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
                  <th className="text-left px-3 py-2">{t("analysis.climbs.header.index")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.climbs.header.start")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.climbs.header.length")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.climbs.header.elev")}</th>
                  <th className="text-right px-3 py-2">{t("analysis.climbs.header.avgGrade")}</th>
                  <th className="text-left px-3 py-2 pl-4">{t("analysis.climbs.header.category")}</th>
                </tr>
              </thead>
              <tbody>
                {climbs.map((c, i) => {
                  const cat = c.avgGrade * c.lengthKm * 100;
                  const grade = cat > 800 ? "HC" : cat > 600 ? "1" : cat > 400 ? "2" : cat > 200 ? "3" : "4";
                  const gradeColor = grade === "HC" ? "var(--rose)" : grade === "1" ? "var(--amber)" : grade === "2" ? "var(--violet)" : "var(--aqua)";
                  return (
                    <tr key={i} className="border-t" style={{ borderColor: 'var(--line-soft)' }}>
                      <td className="px-3 py-2" style={{ color: 'var(--ink-1)' }}>{i + 1}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-2)' }}>{(units === 'imperial' ? (c.startKm * 1000 / M_PER_MI).toFixed(1) : c.startKm.toFixed(1))} {distUnit}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-0)' }}>{distVal(c.lengthKm)} {distUnit}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--ink-0)' }}>{elevValRound(c.elevationGain)} {elevUnit}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--amber)' }}>{c.avgGrade.toFixed(1)} %</td>
                      <td className="px-3 py-2 pl-4">
                        <Chip style={{ background: gradeColor, color: 'var(--ink-0)', fontSize: "var(--fs-xs)", padding: '2px 8px', borderRadius: "9999px" }}>
                          {grade === "HC" ? "HC" : t("analysis.climbs.category", { grade })}
                        </Chip>
                      </td>
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
                <tr key={l.number} className="border-t" style={{ borderColor: 'var(--bg-3, rgba(255,255,255,0.06))' }}>
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
