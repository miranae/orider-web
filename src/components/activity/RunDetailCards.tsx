/**
 * 러닝 활동 상세 카드 — ActivityPage 오버뷰 탭 좌측/우측에 삽입
 * 시안: activity-run.html 참조
 */
import { useTranslation } from "react-i18next";
import type { Activity, ActivitySummary } from "@shared/types";
import type { ActivityStreams } from "@shared/types";
import { Card, Text } from "../../theme/components";

// ── 유틸리티 ─────────────────────────────────────────────────────────────────

function formatPace(kmh: number): string {
  if (kmh <= 0) return "-";
  const minPerKm = 60 / kmh;
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

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
    return distKm > 0 ? timeSec / distKm : 300;
  });

  const minP = Math.min(...paces) - 15;
  const maxP = Math.max(...paces) + 15;
  const xScale = (i: number) => (i / (paces.length - 1)) * w;
  const yScale = (p: number) => ((p - minP) / (maxP - minP)) * h;

  const path = paces.map((p, i) => `${i ? 'L' : 'M'}${xScale(i)} ${yScale(p)}`).join(' ');
  const fill = `M0 ${h} ${path.replace(/^M/, 'L')} L${w} ${h} Z`;

  return (
    <Card padding="none" style={{ padding: 18 }}>
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <Text as="div" variant="label" tone="primary" style={{ marginBottom: 2 }}>{t("runCards.paceProfile")}</Text>
        <Text as="div" variant="bodySmall" tone="tertiary">
          {t("runCards.paceProfileDesc", { count: laps.length })}
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
        <path d={fill} fill="url(#paceFill)" />
        <path d={path} stroke="var(--amber)" strokeWidth="1.8" fill="none" />
      </svg>
      <div className="text-[length:var(--fs-xs)]" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-2)', fontFamily: 'var(--font-mono)', color: 'var(--ink-4)' }}>
        {laps.map((_, i) => i === 0 || i === laps.length - 1 || i === Math.floor(laps.length / 2) ? (
          <span key={i}>{i + 1} km</span>
        ) : null).filter(Boolean)}
      </div>
    </Card>
  );
}

// ── km 스플릿 테이블 ─────────────────────────────────────────────────────────

function SplitTable({ laps }: { laps?: ActivityStreams["laps"] }) {
  const { t } = useTranslation("activity");
  if (!laps || laps.length === 0) return null;

  const rows = laps.map((lap, i) => {
    const distKm = lap.distanceKm ?? 0;
    const timeMs = lap.durationMs ?? 0;
    const timeSec = timeMs / 1000;
    const paceSec = distKm > 0 ? timeSec / distKm : 0;
    const paceStr = paceSec > 0 ? `${Math.floor(paceSec / 60)}:${String(Math.round(paceSec % 60)).padStart(2, '0')}` : '-';
    const hr = lap.avgHeartRate ?? null;
    const cad = lap.avgCadence ?? null;
    const zone = paceSec < 250 ? 'Z5' : paceSec < 270 ? 'Z4' : paceSec < 295 ? 'Z3' : 'Z2';
    const zoneColor = zone === 'Z5' ? 'var(--rose)' : zone === 'Z4' ? 'var(--lime)' : zone === 'Z3' ? 'var(--amber)' : 'var(--aqua)';
    return { km: i + 1, pace: paceStr, paceSec, hr, cad, zone, zoneColor, partial: distKm < 0.9 };
  });

  const fastestSec = Math.min(...rows.map(r => r.paceSec).filter(p => p > 0));

  return (
    <Card padding="none" style={{ padding: 0 }}>
      <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center' }}>
        <div>
          <Text as="h3" variant="label" tone="primary" style={{ margin: 0, marginBottom: 3 }}>{t("runCards.kmSplit")}</Text>
          <Text as="div" variant="bodySmall" tone="tertiary">{t("runCards.lapCount", { count: laps.length })}</Text>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="text-[length:var(--fs-xs)]" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr className="text-[length:var(--fs-xs)]" style={{ color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}>
              <th style={{ textAlign: 'left', padding: '10px 18px', fontWeight: 500 }}>km</th>
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
              const barPct = r.paceSec > 0 ? Math.max(10, ((350 - r.paceSec) / 100) * 100) : 0;
              return (
                <tr key={r.km} style={{ borderTop: '1px solid var(--line-soft)', opacity: r.partial ? 0.7 : 1 }}>
                  <td style={{ padding: '10px 18px', color: 'var(--ink-0)', fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{r.km}</td>
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

const HR_ZONES = [
  { label: 'Z1', color: 'oklch(0.7 0.1 200)',  test: (hr: number) => hr < 120 },
  { label: 'Z2', color: 'oklch(0.75 0.12 160)', test: (hr: number) => hr >= 120 && hr < 140 },
  { label: 'Z3', color: 'oklch(0.80 0.14 120)', test: (hr: number) => hr >= 140 && hr < 160 },
  { label: 'Z4', color: 'oklch(0.78 0.15 60)',  test: (hr: number) => hr >= 160 && hr < 175 },
  { label: 'Z5', color: 'oklch(0.72 0.16 30)',  test: (hr: number) => hr >= 175 },
];

function HRCard({ laps }: { laps?: ActivityStreams["laps"] }) {
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
  const total = hrs.length;
  const zones = HR_ZONES.map(z => {
    const count = hrs.filter(z.test).length;
    return { ...z, pct: total > 0 ? (count / total) * 100 : 0 };
  });

  return (
    <Card padding="none" style={{ padding: 18 }}>
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <Text as="div" variant="label" tone="primary" style={{ marginBottom: 2 }}>{t("runCards.hrTitle")}</Text>
        <Text as="div" variant="bodySmall" tone="tertiary">
          {t("runCards.hrDesc", { count: hrs.length })}
        </Text>
      </div>

      {/* 심박 꺾은선 차트 */}
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 100, display: 'block' }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="hrFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="oklch(0.72 0.16 30)" stopOpacity="0.4" />
            <stop offset="1" stopColor="oklch(0.72 0.16 30)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(p => (
          <line key={p} x1="0" x2={w} y1={h * p} y2={h * p} stroke="var(--grid-soft)" />
        ))}
        <path d={fill} fill="url(#hrFill)" />
        <path d={path} stroke="oklch(0.72 0.16 30)" strokeWidth="1.8" fill="none" />
      </svg>

      {/* 존 분포 세로 막대 */}
      <div style={{ marginTop: 14, display: 'flex', gap: 6, alignItems: 'flex-end', height: 56 }}>
        {zones.map(z => (
          <div key={z.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div className="text-[length:var(--fs-xs)]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-4)' }}>
              {z.pct > 0 ? `${Math.round(z.pct)}%` : ''}
            </div>
            <div style={{ width: '100%', height: `${z.pct * 1.6}%`, minHeight: z.pct > 0 ? 2 : 0, background: z.color, borderRadius: '2px 2px 0 0' }} />
            <div className="text-[length:var(--fs-xs)]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', marginTop: 2 }}>{z.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── 케이던스 차트 ────────────────────────────────────────────────────────────

function CadenceCard({ laps }: { laps?: ActivityStreams["laps"] }) {
  const { t } = useTranslation("activity");
  if (!laps || laps.length === 0) return null;

  const cadences = laps.map(l => l.avgCadence ?? 0);
  if (cadences.every(c => c === 0)) return null;

  const avg = Math.round(cadences.filter(c => c > 0).reduce((a, b) => a + b, 0) / cadences.filter(c => c > 0).length);
  const max = Math.max(...cadences);

  const w = 800, h = 100;
  const maxC = Math.max(max + 5, 185);
  const minC = Math.max(0, Math.min(...cadences.filter(c => c > 0)) - 5);
  const barW = Math.floor(w / cadences.length) - 2;

  // 보폭 추정: avgSpeed(km/h) * 1000 / 60 / avgCadence m/step
  // 대표 랩 (MAIN 랩들 평균)
  const validLaps = laps.filter(l => (l.avgCadence ?? 0) > 0);
  const avgSpeed = validLaps.length > 0
    ? validLaps.reduce((s, l) => s + (l.avgSpeed ?? 0), 0) / validLaps.length
    : 0;
  const strideM = avg > 0 && avgSpeed > 0
    ? ((avgSpeed * 1000) / 60 / avg).toFixed(2)
    : '-';
  const groundMs = avg > 0
    ? Math.round((60000 / avg) * 0.4)
    : null;

  // 180 spm 기준선의 y 좌표
  const refY = maxC > minC ? h - ((180 - minC) / (maxC - minC)) * h : h / 2;

  const stats = [
    { label: t("runCards.cadenceAvg"), value: `${avg}`, unit: 'spm' },
    { label: t("runCards.cadenceMax"), value: `${max}`, unit: 'spm' },
    { label: t("runCards.strideEst"), value: strideM !== '-' ? strideM : '-', unit: strideM !== '-' ? 'm' : '' },
    { label: t("runCards.groundEst"), value: groundMs != null ? `${groundMs}` : '-', unit: groundMs != null ? 'ms' : '' },
  ];

  return (
    <Card padding="none" style={{ padding: 18 }}>
      <div style={{ marginBottom: 'var(--space-3)' }}>
        <Text as="div" variant="label" tone="primary" style={{ marginBottom: 2 }}>{t("runCards.cadenceTitle")}</Text>
        <Text as="div" variant="bodySmall" tone="tertiary">
          {t("runCards.cadenceDesc", { avg })}
        </Text>
      </div>

      {/* 수직 바 차트 */}
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 100, display: 'block' }} preserveAspectRatio="none">
        {/* 180 spm 기준 점선 */}
        {refY > 0 && refY < h && (
          <line
            x1="0" x2={w}
            y1={refY} y2={refY}
            stroke="var(--lime)"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity="0.6"
          />
        )}
        {cadences.map((c, i) => {
          const barH = maxC > minC ? ((c - minC) / (maxC - minC)) * h : 0;
          const x = i * (barW + 2);
          return (
            <rect
              key={i}
              x={x}
              y={h - barH}
              width={barW}
              height={barH}
              fill="var(--aqua)"
              opacity={c >= 180 ? 0.85 : 0.5}
              rx={2}
            />
          );
        })}
      </svg>

      {/* 4칸 stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 'var(--space-2)', marginTop: 14 }}>
        {stats.map(stat => (
          <div key={stat.label} style={{ background: 'var(--bg-3)', borderRadius: 'var(--r-md)', padding: '8px 10px' }}>
            <Text as="div" variant="caption" tone="quaternary" mono style={{ marginBottom: 'var(--space-1)', letterSpacing: '0.05em' }}>{stat.label}</Text>
            <Text as="div" variant="dataSmall" tone="primary" mono>
              {stat.value}
              {stat.unit && <Text variant="unit" tone="tertiary" style={{ marginLeft: 2 }}>{stat.unit}</Text>}
            </Text>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── GAP 패널 ─────────────────────────────────────────────────────────────────

function GapCard({ summary }: { summary: ActivitySummary }) {
  const { t } = useTranslation("activity");
  const avgPace = summary.averageSpeed > 0 ? formatPace(summary.averageSpeed) : '-';
  // GAP 추정: 평지 보정 (고도 영향 근사)
  const distKm = summary.distance / 1000;
  const elevGain = summary.elevationGain;
  const gainPctAdj = distKm > 0 ? (elevGain / distKm) * 0.033 : 0; // 고도 보정 계수
  const avgSpeedKmh = summary.averageSpeed;
  const gapSpeedKmh = avgSpeedKmh * (1 + gainPctAdj);
  const gapPace = gapSpeedKmh > 0 ? formatPace(gapSpeedKmh) : '-';

  return (
    <Card padding="none" style={{ padding: 18 }}>
      <Text as="div" variant="label" tone="primary" style={{ marginBottom: 3 }}>{t("runCards.gapTitle")}</Text>
      <Text as="div" variant="bodySmall" tone="tertiary" style={{ marginBottom: 'var(--space-3)' }}>{t("runCards.gapDesc")}</Text>
      <div className="text-[length:var(--fs-xs)]" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--ink-3)' }}>{t("runCards.avgPace")}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)' }}>{avgPace}/km</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--ink-3)' }}>{t("runCards.gapPace")}</span>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--lime)', fontWeight: 600 }}>{gapPace}/km</span>
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
    <Card padding="none" style={{ padding: 18 }}>
      <Text as="div" variant="label" tone="primary" style={{ marginBottom: 3 }}>{t("runCards.runLoadTitle")}</Text>
      <Text as="div" variant="bodySmall" tone="tertiary" style={{ marginBottom: 'var(--space-3)' }}>{t("runCards.runLoadDesc")}</Text>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 'var(--space-3)' }}>
        <Text variant="dataHero" mono style={{ color }}>{Math.round(tss)}</Text>
        <Text variant="unit" tone="secondary" mono>rTSS</Text>
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
export function RunLeftCards({ streams }: { streams?: ActivityStreams | null }) {
  return (
    <>
      <PaceChart laps={streams?.laps} />
      <HRCard laps={streams?.laps} />
      <CadenceCard laps={streams?.laps} />
      <SplitTable laps={streams?.laps} />
    </>
  );
}

// ── 환경 카드 ────────────────────────────────────────────────────────────────

function WeatherCard({ weather }: { weather?: Activity["weather"] }) {
  const { t } = useTranslation("activity");
  if (!weather) return null;
  const rows: [string, string][] = [];
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
  if (rows.length === 0) return null;

  return (
    <Card padding="none" style={{ padding: 18 }}>
      <Text as="div" variant="label" tone="primary" style={{ marginBottom: 'var(--space-3)' }}>{t("runCards.weatherTitle")}</Text>
      <div className="text-[length:var(--fs-xs)]" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
    <Card padding="none" style={{ padding: 18 }}>
      <Text as="div" variant="label" tone="primary" style={{ marginBottom: 'var(--space-3)' }}>{t("runCards.gearTitle")}</Text>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
export function RunRightCards({ summary, activity }: { summary: ActivitySummary; activity?: Activity }) {
  return (
    <>
      <RunLoadCard tss={summary.tss} />
      <GapCard summary={summary} />
      <WeatherCard weather={activity?.weather} />
      <GearCard gear={activity?.gear} />
    </>
  );
}
