/**
 * 러닝 활동 상세 카드 — ActivityPage 오버뷰 탭 좌측/우측에 삽입
 * 시안: activity-run.html 참조
 */
import { runningCadenceSpm } from "../../utils/runningCadence";
import { useLocale } from "../../contexts/LocaleContext";
import { formatPace as formatPaceSec } from "../../utils/units";
import { useTranslation } from "react-i18next";
import type { Activity, ActivitySummary } from "@shared/types";
import type { ActivityStreams } from "@shared/types";
import { Card, Chip, Text } from "../../theme/components";
import { paceToZone } from "../../utils/workoutPace";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { useCanonicalSurfaceEnabled } from "../../hooks/useCanonicalRollout";
import { conditionFromMetricsValue, weatherConditionLabelKey } from "../../utils/weatherCondition";

// ── 유틸리티 ─────────────────────────────────────────────────────────────────

// ── 페이스 프로필 차트 ───────────────────────────────────────────────────────

function PaceChart({ laps }: { laps?: ActivityStreams["laps"] }) {
  const { t } = useTranslation("activity");
  if (!laps || laps.length === 0) return null;

  const w = 800, h = 160;
  // 랩별 페이스(sec/km) 계산
  const paces = laps.map(lap => {
    const distKm = lap.distanceKm ?? 0;
    const timeMs = lap.durationMs ?? 0;
    const timeSec = timeMs / 1000;
    return Number.isFinite(distKm) && distKm > 0 && Number.isFinite(timeSec) && timeSec > 0 ? timeSec / distKm : null;
  });

  const measuredPaces = paces.filter((pace): pace is number => pace != null);
  if (!measuredPaces.length) return null;
  const minP = Math.min(...measuredPaces) - 15;
  const maxP = Math.max(...measuredPaces) + 15;
  const xScale = (i: number) => (i / Math.max(paces.length - 1, 1)) * w;
  const yScale = (p: number) => ((p - minP) / (maxP - minP)) * h;

  const path = paces.map((pace, i) => pace == null ? "" : `${i > 0 && paces[i - 1] != null ? "L" : "M"}${xScale(i)} ${yScale(pace)}`).join(" ");

  return (
    <Card padding="none" style={{ padding: "var(--space-4)" }}>
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <Text as="div" variant="label" tone="primary" style={{ marginBottom: "var(--space-0-5)" }}>{t("analysis.run.lapPace")}</Text>
        <Text as="div" variant="bodySmall" tone="tertiary">
          {t("runCards.lapCount", { count: measuredPaces.length })}
        </Text>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 160, display: 'block' }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="paceFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--amber)" stopOpacity="0" />
            <stop offset="1" stopColor="var(--amber)" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(p => (
          <line key={p} x1="0" x2={w} y1={h * p} y2={h * p} stroke="var(--grid-soft)" />
        ))}
        <path d={path} stroke="var(--amber)" strokeWidth="1.8" fill="none" />
      </svg>
      <div className="text-[length:var(--fs-xs)]" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)', color: 'var(--ink-4)' }}>
        {laps.map((_, i) => i === 0 || i === laps.length - 1 || i === Math.floor(laps.length / 2) ? (
          <span key={i}>{t("analysis.run.lap")} {i + 1}</span>
        ) : null).filter(Boolean)}
      </div>
    </Card>
  );
}

// ── km 스플릿 테이블 ─────────────────────────────────────────────────────────

function SplitTable({ laps, thresholdPaceSecPerKm }: { laps?: Array<Omit<NonNullable<ActivityStreams["laps"]>[number], "avgCadence"> & { avgCadence?: number }>; thresholdPaceSecPerKm?: number | null }) {
  const { t } = useTranslation("activity");
  if (!laps || laps.length === 0) return null;

  const rows = laps.map((lap, i) => {
    const distKm = lap.distanceKm ?? 0;
    const timeMs = lap.durationMs ?? 0;
    const timeSec = timeMs / 1000;
    const paceSec = distKm > 0 ? timeSec / distKm : 0;
    const roundedPace = Math.round(paceSec);
    const paceStr = Number.isFinite(paceSec) && paceSec > 0 ? `${Math.floor(roundedPace / 60)}:${String(roundedPace % 60).padStart(2, "0")}` : "—";
    const hr = lap.avgHeartRate ?? null;
    const cad = lap.avgCadence ?? null;
    // 존은 사용자 임계 페이스 상대값이다. 임계값이 없으면 표시하지 않는다 —
    // 과거의 절대 기준(250/270/295 sec/km)은 느린 러너의 모든 구간을 Z2 로 찍는 잘못된 값이었다.
    const zoneNum = paceToZone(paceSec, thresholdPaceSecPerKm);
    const zone = zoneNum == null ? '-' : `Z${zoneNum}`;
    const zoneColor = zoneNum == null ? 'var(--ink-4)'
      : zoneNum === 5 ? 'var(--rose)'
      : zoneNum === 4 ? 'var(--lime)'
      : zoneNum === 3 ? 'var(--amber)'
      : 'var(--aqua)';
    return { km: i + 1, pace: paceStr, paceSec, hr, cad, zone, zoneColor, distanceKm: distKm };
  });

  const validPaces = rows.map(row => row.paceSec).filter(pace => Number.isFinite(pace) && pace > 0);
  const fastestSec = Math.min(...validPaces);
  const slowestSec = Math.max(...validPaces);

  return (
    <Card padding="none" style={{ padding: 0 }}>
      <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center' }}>
        <div>
          <Text as="h3" variant="label" tone="primary" style={{ margin: 0, marginBottom: "var(--space-1)" }}>{t("analysis.run.lapPace")}</Text>
          <Text as="div" variant="bodySmall" tone="tertiary">{t("runCards.lapCount", { count: laps.length })}</Text>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="text-[length:var(--fs-xs)]" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr className="text-[length:var(--fs-xs)]" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
              <th style={{ textAlign: 'left', padding: '10px 18px', fontWeight: 500 }}>{t("analysis.run.lap")}</th>
              <th style={{ textAlign: 'right', padding: '10px 10px', fontWeight: 500 }}>{t("runCards.colPace")}</th>
              <th style={{ textAlign: 'left', padding: '10px 10px', fontWeight: 500, width: '25%' }}></th>
              <th style={{ textAlign: 'right', padding: '10px 10px', fontWeight: 500 }}>{t("runCards.colHr")}</th>
              <th style={{ textAlign: 'right', padding: '10px 10px', fontWeight: 500 }}>{t("runCards.colCadence")}</th>
              <th style={{ textAlign: 'right', padding: '10px 18px', fontWeight: 500 }}>{t("runCards.colZone")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isBest = r.paceSec === fastestSec && r.paceSec > 0;
              const barPct = Number.isFinite(r.paceSec) && r.paceSec > 0
                ? slowestSec === fastestSec ? 100 : 20 + 80 * (slowestSec - r.paceSec) / (slowestSec - fastestSec) : 0;
              return (
                <tr key={r.km} style={{ borderTop: '1px solid var(--line-soft)', opacity: 1 }}>
                  <td style={{ padding: '10px 18px', color: 'var(--ink-0)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{r.km} · {r.distanceKm > 0 ? `${r.distanceKm.toFixed(1)} km` : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '10px 10px', color: isBest ? 'var(--lime)' : 'var(--ink-0)', fontWeight: isBest ? 600 : 400, fontFamily: 'var(--font-mono)' }}>
                    {r.pace}{isBest && <span className="text-[length:var(--fs-xs)]" style={{ color: 'var(--lime)', marginLeft: 'var(--space-1)' }}>★</span>}
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <div style={{ height: 6, background: 'var(--bg-3)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                      <div style={{ width: `${barPct}%`, height: '100%', background: r.zoneColor }} />
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', padding: '10px 10px', color: 'var(--ink-1)', fontFamily: 'var(--font-mono)' }}>{r.hr ?? '-'}</td>
                  <td style={{ textAlign: 'right', padding: '10px 10px', color: 'var(--ink-2)', fontFamily: 'var(--font-mono)' }}>{r.cad ?? '-'}</td>
                  <td style={{ textAlign: 'right', padding: '10px 18px' }}>
                    <span className="text-[length:var(--fs-xs)]" style={{ padding: '2px 5px', borderRadius: 'var(--r-sm)', border: `1px solid ${r.zoneColor}`, color: r.zoneColor, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r.zone}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── 심박 차트 + 존 분포 ──────────────────────────────────────────────────────

const HR_ZONES = Array.from({ length: 5 }, (_, i) => ({ label: `Z${i + 1}`, color: `var(--zone-${i + 1})` }));

function HRCard({ laps, hrZoneSec }: { laps?: ActivityStreams["laps"]; hrZoneSec?: number[] }) {
  const { t } = useTranslation("activity");
  if (!laps || laps.length === 0) return null;

  const hrs = laps.map(l => l.avgHeartRate ?? 0).filter(v => v > 0);
  if (hrs.length === 0) return null;

  // ── HRChart SVG ───────────────────────────────────────────────────────────
  const w = 800, h = 160;
  const minH = Math.min(...hrs) - 5;
  const maxH = Math.max(...hrs) + 5;
  const xScale = (i: number) => hrs.length > 1 ? (i / (hrs.length - 1)) * w : w / 2;
  const yScale = (v: number) => h - ((v - minH) / (maxH - minH)) * h;

  const path = hrs.map((v, i) => `${i ? 'L' : 'M'}${xScale(i)} ${yScale(v)}`).join(' ');
  const fill = `M0 ${h} ${path.replace(/^M/, 'L')} L${w} ${h} Z`;

  // ── 존 분포 ───────────────────────────────────────────────────────────────
  const validZones = hrZoneSec?.length === 5 && hrZoneSec.every(value => Number.isFinite(value) && value >= 0);
  const total = validZones ? hrZoneSec!.reduce((sum, value) => sum + value, 0) : 0;
  const zones = total > 0 ? HR_ZONES.map((zone, i) => ({ ...zone, pct: hrZoneSec![i]! / total * 100 })) : [];


  return (
    <Card padding="none" style={{ padding: "var(--space-4)" }}>
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <Text as="div" variant="label" tone="primary" style={{ marginBottom: "var(--space-0-5)" }}>{t("analysis.run.lapHr")}</Text>
        <Text as="div" variant="bodySmall" tone="tertiary">
          {t("runCards.lapCount", { count: hrs.length })}
        </Text>
      </div>

      {/* 심박 꺾은선 차트 */}
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 100, display: 'block' }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="hrFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--chart-heart-rate)" stopOpacity="0.4" />
            <stop offset="1" stopColor="var(--chart-heart-rate)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(p => (
          <line key={p} x1="0" x2={w} y1={h * p} y2={h * p} stroke="var(--grid-soft)" />
        ))}
        <path d={fill} fill="url(#hrFill)" />
        <path d={path} stroke="var(--chart-heart-rate)" strokeWidth="1.8" fill="none" />
      </svg>

      {/* 존 분포 세로 막대 */}
      {zones.length > 0 && <div data-testid="run-canonical-hr-zones" style={{ marginTop: "var(--space-3)", display: 'flex', gap: "var(--space-1-5)", alignItems: 'flex-end', height: 56 }}>
        {zones.map(z => (
          <div key={z.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: "var(--space-1)" }}>
            <div className="text-[length:var(--fs-xs)]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-4)' }}>
              {z.pct > 0 ? `${Math.round(z.pct)}%` : ''}
            </div>
            <div style={{ width: '100%', height: `${z.pct * 1.6}%`, minHeight: z.pct > 0 ? 2 : 0, background: z.color, borderRadius: '2px 2px 0 0' }} />
            <div className="text-[length:var(--fs-xs)]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', marginTop: "var(--space-0-5)" }}>{z.label}</div>
          </div>
        ))}
      </div>}
    </Card>
  );
}

// ── 케이던스 차트 ────────────────────────────────────────────────────────────

function CadenceCard({ laps, cadenceUnit }: { laps?: ActivityStreams["laps"]; cadenceUnit?: ActivityMetrics["cadenceUnit"] }) {
  const { t } = useTranslation("activity");
  if (!laps || laps.length === 0 || (cadenceUnit !== "spm" && cadenceUnit !== "strides_per_minute")) return null;

  const cadences = laps.map(l => runningCadenceSpm(l.avgCadence, cadenceUnit) ?? 0);
  if (cadences.every(c => c === 0)) return null;

  const avg = Math.round(cadences.filter(c => c > 0).reduce((a, b) => a + b, 0) / cadences.filter(c => c > 0).length);
  const max = Math.max(...cadences);

  const w = 800, h = 100;
  const maxC = max + 5;
  const minC = Math.max(0, Math.min(...cadences.filter(c => c > 0)) - 5);
  const barW = Math.floor(w / cadences.length) - 2;


  const stats = [
    { label: t("runCards.cadenceAvg"), value: `${avg}`, unit: 'spm' },
    { label: t("runCards.cadenceMax"), value: `${max}`, unit: 'spm' },
  ];

  return (
    <Card padding="none" style={{ padding: "var(--space-4)" }}>
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <Text as="div" variant="label" tone="primary" style={{ marginBottom: "var(--space-0-5)" }}>{t("runCards.cadenceTitle")}</Text>
        <Text as="div" variant="bodySmall" tone="tertiary">
          {t("runCards.cadenceDesc", { avg })}
        </Text>
      </div>

      {/* 수직 바 차트 */}
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 100, display: 'block' }} preserveAspectRatio="none">
        {cadences.map((c, i) => {
          const barH = c > 0 && maxC > minC ? Math.max(0, ((c - minC) / (maxC - minC)) * h) : 0;
          const x = i * (barW + 2);
          return (
            <rect
              key={i}
              x={x}
              y={h - barH}
              width={barW}
              height={barH}
              fill="var(--aqua)"
              opacity={0.75}
              rx={2}
            />
          );
        })}
      </svg>

      {/* 4칸 stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 'var(--space-2)', marginTop: "var(--space-3)" }}>
        {stats.map(stat => (
          <div key={stat.label} style={{ background: 'var(--bg-3)', borderRadius: 'var(--r-md)', padding: '8px 10px' }}>
            <Text as="div" variant="caption" tone="quaternary" mono style={{ marginBottom: 'var(--space-1)', letterSpacing: '0.05em' }}>{stat.label}</Text>
            <Text as="div" variant="dataSmall" tone="primary" mono>
              {stat.value}
              {stat.unit && <Text variant="unit" tone="tertiary" style={{ marginLeft: "var(--space-0-5)" }}>{stat.unit}</Text>}
            </Text>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── GAP 패널 ─────────────────────────────────────────────────────────────────

function GapCard({ summary, gapSecPerKm }: { summary: ActivitySummary; gapSecPerKm?: number | null }) {
  const { t } = useTranslation("activity");
  const { units } = useLocale();
  const avgPace = summary.averageSpeed > 0 ? formatPaceSec(3600 / summary.averageSpeed, units) : "—";
  const gapPace = gapSecPerKm != null && gapSecPerKm > 0 ? formatPaceSec(gapSecPerKm, units) : "—";

  return (
    <Card padding="none" style={{ padding: "var(--space-4)" }}>
      <Text as="div" variant="label" tone="primary" style={{ marginBottom: "var(--space-1)" }}>{t("runCards.gapTitle")}</Text>
      <Text as="div" variant="bodySmall" tone="tertiary" style={{ marginBottom: 'var(--space-3)' }}>{t("runCards.gapDesc")}</Text>
      <div className="text-[length:var(--fs-xs)]" style={{ display: 'flex', flexDirection: 'column', gap: "var(--space-2)" }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--ink-3)' }}>{t("runCards.avgPace")}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>{avgPace}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--ink-3)' }}>{t("runCards.gapPace")}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--lime)', fontWeight: 600 }}>{gapPace}</span>
        </div>
      </div>
    </Card>
  );
}

// ── rTSS 부하 게이지 ─────────────────────────────────────────────────────────

function RunLoadCard({ tss }: { tss: number | null }) {
  const { t } = useTranslation("activity");
  if (tss == null) return null;
  const pct = Math.min(100, (tss / 200) * 100);
  const color = tss < 50 ? 'var(--aqua)' : tss < 100 ? 'var(--lime)' : tss < 150 ? 'var(--amber)' : 'var(--rose)';

  return (
    <Card padding="none" style={{ padding: "var(--space-4)" }}>
      <Text as="div" variant="label" tone="primary" style={{ marginBottom: "var(--space-1)" }}>{t("analysis.run.hrLoad")}</Text>
      <Text as="div" variant="bodySmall" tone="tertiary" style={{ marginBottom: 'var(--space-3)' }}>{t("analysis.run.hrLoadDesc")}</Text>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: "var(--space-1-5)", marginBottom: 'var(--space-3)' }}>
        <Text variant="dataHero" mono style={{ color }}>{Math.round(tss)}</Text>
        <Text variant="unit" tone="secondary" mono>hrTSS</Text>
      </div>
      <div style={{ height: 4, background: 'var(--bg-3)', borderRadius: 'var(--r-sm)', marginBottom: 'var(--space-2)', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: `linear-gradient(90deg, var(--lime), ${color})`, borderRadius: 'var(--r-sm)' }} />
        {[40, 100, 150].map(n => (
          <div key={n} style={{ position: 'absolute', left: `${(n / 200) * 100}%`, top: -2, bottom: -2, width: 1, background: 'var(--bg-0)' }} />
        ))}
      </div>
      <div className="text-[length:var(--fs-xs)]" style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', color: 'var(--ink-4)' }}>
        <span>{t("runCards.runLoadLight")}</span>
        <span>{t("runCards.runLoadModerate")}</span>
        <span>{t("runCards.runLoadLong")}</span>
        <span>{t("runCards.runLoadRace")}</span>
      </div>
    </Card>
  );
}

// ── 메인 export ──────────────────────────────────────────────────────────────

/** 러닝 활동 상세 — 좌측 컬럼용 차트/테이블 */
export function RunLeftCards({
  streams,
  cadenceUnit,
  thresholdPaceSecPerKm,
  hrZoneSec,
}: {
  streams?: ActivityStreams | null;
  cadenceUnit?: ActivityMetrics["cadenceUnit"];
  hrZoneSec?: number[];
  /** 스플릿 존 계산 기준. 없으면 존 열이 '-' 로 표시된다. */
  thresholdPaceSecPerKm?: number | null;
}) {
  return (
    <>
      <PaceChart laps={streams?.laps} />
      <HRCard laps={streams?.laps} hrZoneSec={hrZoneSec} />
      <CadenceCard laps={streams?.laps} cadenceUnit={cadenceUnit} />
      <SplitTable laps={streams?.laps?.map(lap => ({ ...lap, avgCadence: runningCadenceSpm(lap.avgCadence, cadenceUnit) ?? undefined }))} thresholdPaceSecPerKm={thresholdPaceSecPerKm} />
    </>
  );
}

// ── 환경 카드 ────────────────────────────────────────────────────────────────

/** 서버 활동 메트릭의 읽기 상태 — `useActivityMetrics` 의 status 와 같은 어휘. */
export type WeatherMetricsStatus = "loading" | "disabled" | "missing" | "stale" | "ready";

/**
 * 환경(날씨) 카드.
 *
 * ## 출처는 한 페이지에 하나뿐이다 (#887)
 *
 * 서버 활동 메트릭 v22 의 `weather`(tempC/humidity/windSpeed/condition) 가 정본이다.
 * 기기가 기록한 `activity.weather` 는 폴백이고, 그때는 **"기기 기록" 표식**을 붙여
 * 어느 출처를 보고 있는지 밝힌다. 두 출처를 같은 화면에 겹쳐 그리지 않는다 —
 * 같은 라이드의 기온이 두 개로 보이는 것이 지금 고치는 결함이다.
 *
 * 결측은 0 이 아니다. 서버가 `humidity: null` 을 주면 그 줄을 아예 그리지 않는다.
 *
 * 전환이 꺼져 있으면(`useCanonicalSurfaceEnabled("weather") === false`) 오늘과 똑같이
 * 기기 기록만 표식 없이 그린다.
 */
function WeatherCard({ weather, metricsWeather, metricsStatus }: {
  weather?: Activity["weather"];
  metricsWeather?: ActivityMetrics["weather"];
  metricsStatus?: WeatherMetricsStatus;
}) {
  const { t } = useTranslation("activity");
  const canonical = useCanonicalSurfaceEnabled("weather");
  const serverReady = canonical && (metricsStatus === "ready" || metricsStatus === "stale") && !!metricsWeather;

  // 계산 중이면 숫자를 지어내지 않고 계산 중임을 밝힌다.
  if (canonical && !serverReady && metricsStatus === "loading") {
    return (
      <Card padding="none" style={{ padding: "var(--space-4)" }}>
        <Text as="div" variant="label" tone="primary" style={{ marginBottom: "var(--space-3)" }}>{t("runCards.weatherTitle")}</Text>
        <Text as="div" variant="caption" tone="tertiary">{t("runCards.weatherProcessing")}</Text>
      </Card>
    );
  }

  const rows: [string, string][] = [];
  if (serverReady && metricsWeather) {
    rows.push([t("runCards.weatherTemp"), `${Math.round(metricsWeather.tempC)} °C`]);
    if (metricsWeather.windSpeed != null) rows.push([t("runCards.weatherWind"), `${metricsWeather.windSpeed} m/s`]);
    if (metricsWeather.humidity != null) rows.push([t("runCards.weatherHumidity"), `${metricsWeather.humidity}%`]);
    const condition = conditionFromMetricsValue(metricsWeather.condition);
    if (condition !== "UNKNOWN") {
      rows.push([t("runCards.weatherConditionLabel"), t(weatherConditionLabelKey(condition))]);
    }
  } else {
    if (!weather) return null;
    if (weather.temperature != null) rows.push([t("runCards.weatherTemp"), `${weather.temperature} °C`]);
    if (weather.feelsLike != null) rows.push([t("runCards.weatherFeelsLike"), `${weather.feelsLike} °C`]);
    if (weather.windSpeed != null) {
      const dirText = weather.windDirection != null
        ? ` (${['N','NE','E','SE','S','SW','W','NW'][Math.round(weather.windDirection / 45) % 8]})`
        : '';
      rows.push([t("runCards.weatherWind"), `${weather.windSpeed} m/s${dirText}`]);
    }
    if (weather.humidity != null) rows.push([t("runCards.weatherHumidity"), `${weather.humidity}%`]);
    if (weather.precipitation != null && weather.precipitation > 0) rows.push([t("runCards.weatherPrecip"), `${weather.precipitation} mm`]);
    if (weather.airQuality) rows.push([t("runCards.weatherAirQuality"), weather.airQuality]);
  }
  if (rows.length === 0) return null;

  const badge = serverReady
    ? (metricsStatus === "stale" ? t("runCards.weatherStale") : null)
    : (canonical ? t("runCards.weatherSourceDevice") : null);

  return (
    <Card padding="none" style={{ padding: "var(--space-4)" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: "var(--space-2)", marginBottom: 'var(--space-3)' }}>
        <Text as="div" variant="label" tone="primary">{t("runCards.weatherTitle")}</Text>
        {badge && <Chip variant="default">{badge}</Chip>}
      </div>
      <div className="text-[length:var(--fs-xs)]" style={{ display: 'flex', flexDirection: 'column', gap: "var(--space-2)" }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--ink-3)' }}>{k}</span>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>{v}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── 장비 카드 ────────────────────────────────────────────────────────────────

function GearCard({ gear }: { gear?: Activity["gear"] }) {
  const { t } = useTranslation("activity");
  if (!gear) return null;
  const icon = gear.type === 'shoes' ? '👟' : gear.type === 'watch' ? '⌚' : '🚴';
  const remaining = gear.maxDistanceKm ? gear.maxDistanceKm - gear.totalDistanceKm : null;

  return (
    <Card padding="none" style={{ padding: "var(--space-4)" }}>
      <Text as="div" variant="label" tone="primary" style={{ marginBottom: 'var(--space-3)' }}>{t("runCards.gearTitle")}</Text>
      <div style={{ display: 'flex', alignItems: 'center', gap: "var(--space-2)" }}>
        <div className="text-[length:var(--fs-base)]" style={{ width: 28, height: 28, borderRadius: 'var(--r-sm)', background: 'var(--bg-2)', display: 'grid', placeItems: 'center' }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <Text as="div" variant="bodySmall" tone="primary" weight={500}>{gear.name}</Text>
          <Text as="div" variant="caption" tone="tertiary" mono>
            {t("runCards.gearTotalDist", { dist: Math.round(gear.totalDistanceKm) })}
            {remaining != null && ` · ${t("runCards.gearRemaining", { dist: Math.round(remaining) })}`}
          </Text>
        </div>
      </div>
    </Card>
  );
}

/** 러닝 활동 상세 — 우측 사이드바용 카드 */
export function RunRightCards({ summary, activity, metricsWeather, metricsStatus, gapSecPerKm, hrLoad }: {
  summary: ActivitySummary;
  gapSecPerKm?: number | null;
  hrLoad?: number | null;
  activity?: Activity;
  metricsWeather?: ActivityMetrics["weather"];
  metricsStatus?: WeatherMetricsStatus;
}) {
  return (
    <>
      <RunLoadCard tss={hrLoad ?? null} />
      <GapCard summary={summary} gapSecPerKm={gapSecPerKm} />
      <WeatherCard weather={activity?.weather} metricsWeather={metricsWeather} metricsStatus={metricsStatus} />
      <GearCard gear={activity?.gear} />
    </>
  );
}
