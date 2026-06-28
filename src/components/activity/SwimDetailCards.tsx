/**
 * 수영 활동 상세 카드 — ActivityPage 오버뷰 탭에 삽입
 * 시안: activity-swim.html 참조
 */
import { useTranslation } from "react-i18next";
import type { ActivitySummary } from "@shared/types";
import type { ActivityStreams, LapData } from "@shared/types";
import { Card, Text } from "../../theme/components";

// ── 세트 타입 분류 헬퍼 ──────────────────────────────────────────────────────

function classifyLaps(laps: LapData[]) {
  return laps.map((lap, i) => {
    const type: 'WU' | 'MAIN' | 'CD' =
      i === 0 ? 'WU' : i === laps.length - 1 ? 'CD' : 'MAIN';
    return { ...lap, type };
  });
}

// ── 세트별 레인 시각화 ────────────────────────────────────────────────────────

function SwimLaneTimeline({ laps }: { laps?: ActivityStreams["laps"] }) {
  const { t } = useTranslation("activity");
  if (!laps || laps.length === 0) return null;

  const classified = classifyLaps(laps);
  const totalDist = classified.reduce((sum, l) => sum + (l.distanceKm ?? 0) * 1000, 0);
  if (totalDist === 0) return null;

  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, i) =>
    Math.round((i / (tickCount - 1)) * totalDist)
  );

  return (
    <Card padding="none" style={{ padding: 18 }}>
      <Text as="div" variant="label" tone="primary" style={{ marginBottom: 'var(--space-3)' }}>{t("swimCards.laneTimeline")}</Text>
      <div
        style={{
          height: 180,
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, color-mix(in oklch, var(--aqua) 12%, var(--bg-2)), var(--bg-2))',
          position: 'relative',
        }}
      >
        {/* 레인 가이드 라인 (0.25, 0.5, 0.75) */}
        {[0.25, 0.5, 0.75].map(pos => (
          <div
            key={pos}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 24,
              left: `${pos * 100}%`,
              width: 1,
              borderLeft: '1px dashed color-mix(in oklch, var(--aqua) 22%, var(--line-soft))',
            }}
          />
        ))}

        {/* 세트 바 */}
        <div style={{ position: 'absolute', top: 16, left: 8, right: 8, bottom: 28, display: 'flex', gap: 3, alignItems: 'flex-end' }}>
          {classified.map((lap, i) => {
            const distM = (lap.distanceKm ?? 0) * 1000;
            const widthPct = totalDist > 0 ? (distM / totalDist) * 100 : 0;
            const isMain = lap.type === 'MAIN';
            // MAIN: 80~95%, WU/CD: 40% (인덱스 기반 결정론적 변화)
            const mainHeightVariant = [80, 88, 95, 85, 90, 82, 93];
            const heightPct = isMain
              ? mainHeightVariant[i % mainHeightVariant.length]
              : 40;
            const color = isMain ? 'var(--aqua)' : 'color-mix(in oklch, var(--aqua) 55%, var(--ink-3))';
            return (
              <div
                key={i}
                style={{
                  width: `${widthPct}%`,
                  height: `${heightPct}%`,
                  background: color,
                  borderRadius: '4px 4px 0 0',
                  opacity: isMain ? 0.85 : 0.6,
                  flexShrink: 0,
                  position: 'relative',
                  minWidth: 4,
                }}
                title={`${lap.type} · ${Math.round(distM)}m`}
              >
                {widthPct > 5 && (
                  <span className="text-[length:var(--fs-xs)]" style={{
                    position: 'absolute',
                    top: -18,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    color: color,
                    fontFamily: 'var(--font-mono)',
                    whiteSpace: 'nowrap',
                  }}>
                    {lap.type}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* 하단 거리 눈금 */}
        <div style={{ position: 'absolute', bottom: 0, left: 8, right: 8, height: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {ticks.map((tk, i) => (
            <span key={i} className="text-[length:var(--fs-xs)]" style={{ fontFamily: 'var(--font-mono)', color: 'color-mix(in oklch, var(--aqua) 42%, var(--ink-3))' }}>
              {tk}m
            </span>
          ))}
        </div>
      </div>

      {/* 심박 추이 차트 */}
      {(() => {
        const hrs = laps.map(l => l.avgHeartRate ?? 0);
        if (hrs.every(v => v === 0)) return null;

        const totalMs = laps.reduce((s, l) => s + (l.durationMs ?? 0), 0);
        const validHrs = hrs.filter(v => v > 0);
        const minH = Math.min(...validHrs) - 5;
        const maxH = Math.max(...validHrs) + 5;

        const svgW = 800, svgH = 80;
        // 누적 시간 기준 x 좌표
        let cumMs = 0;
        const points = laps.map((lap, i) => {
          const x = totalMs > 0 ? (cumMs / totalMs) * svgW : (i / Math.max(laps.length - 1, 1)) * svgW;
          cumMs += lap.durationMs ?? 0;
          const hr = hrs[i] ?? 0;
          const y = hr > 0 && maxH > minH ? svgH - ((hr - minH) / (maxH - minH)) * svgH : svgH;
          return { x, y };
        });
        // 마지막 포인트 x를 끝까지
        if (points.length > 0) points[points.length - 1]!.x = svgW;

        const linePath = points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
        const fillPath = `M0 ${svgH} ${linePath.replace(/^M/, 'L')} L${svgW} ${svgH} Z`;

        // 시간 눈금
        const totalSec = totalMs / 1000;
        const timeLabels = [0, 0.25, 0.5, 0.75, 1].map(f => {
          const sec = Math.round(f * totalSec);
          return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
        });

        return (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
            <Text as="div" variant="caption" tone="quaternary" mono style={{ letterSpacing: '0.08em', marginBottom: 'var(--space-2)' }}>
              {t("swimCards.sessionHrTrend")}
            </Text>
            <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 80, display: 'block' }} preserveAspectRatio="none">
              <defs>
                <linearGradient id="swimHrFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="var(--rose)" stopOpacity="0.12" />
                  <stop offset="1" stopColor="var(--rose)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={fillPath} fill="url(#swimHrFill)" />
              <path d={linePath} stroke="var(--rose)" strokeWidth="1.8" fill="none" />
            </svg>
            <div className="text-[length:var(--fs-xs)]" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-1)', fontFamily: 'var(--font-mono)', color: 'var(--ink-4)' }}>
              {timeLabels.map((tl, i) => <span key={i}>{tl}</span>)}
            </div>
          </div>
        );
      })()}
    </Card>
  );
}

// ── 페이스 디케이 차트 ────────────────────────────────────────────────────────

function PaceDecayChart({ laps }: { laps?: ActivityStreams["laps"] }) {
  const { t } = useTranslation("activity");
  if (!laps || laps.length === 0) return null;

  const classified = classifyLaps(laps);
  const mainLaps = classified.filter(l => l.type === 'MAIN');
  if (mainLaps.length === 0) return null;

  const paces = mainLaps.map(lap => {
    const distM = (lap.distanceKm ?? 0) * 1000;
    const timeSec = (lap.durationMs ?? 0) / 1000;
    return distM > 0 ? (timeSec / distM) * 100 : 0;
  });

  const maxPace = Math.max(...paces);
  const decay = paces.length >= 2 ? paces[paces.length - 1]! - paces[0]! : 0;
  const decaySign = decay >= 0 ? '+' : '';
  const decayColor = decay <= 0 ? 'var(--aqua)' : 'var(--amber)';

  const formatPace = (sec: number) => {
    if (sec <= 0) return '-';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <Card padding="none" style={{ padding: 18 }}>
      <Text as="div" variant="label" tone="primary" style={{ marginBottom: 3 }}>{t("swimCards.paceDecayTitle")}</Text>
      <Text as="div" variant="bodySmall" tone="tertiary" style={{ marginBottom: 14 }}>{t("swimCards.paceDecayDesc")}</Text>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {paces.map((pace, i) => {
          const barWidth = maxPace > 0 ? (pace / maxPace) * 100 : 0;
          const opacity = 1 - (i / Math.max(paces.length - 1, 1)) * 0.5;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="text-[length:var(--fs-xs)]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)', width: 28, flexShrink: 0 }}>
                #{i + 1}
              </span>
              <div style={{ flex: 1, height: 8, background: 'var(--bg-3)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${barWidth}%`,
                    height: '100%',
                    background: 'var(--aqua)',
                    opacity,
                    borderRadius: 'var(--r-sm)',
                  }}
                />
              </div>
              <span className="text-[length:var(--fs-xs)]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-1)', width: 42, textAlign: 'right', flexShrink: 0 }}>
                {formatPace(pace)}
              </span>
            </div>
          );
        })}
      </div>

      {paces.length >= 2 && (
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Text variant="bodySmall" tone="tertiary">{t("swimCards.decayLabel")}</Text>
          <Text variant="dataMedium" mono style={{ color: decayColor }}>
            {decaySign}{Math.round(Math.abs(decay))}s
          </Text>
          <Text variant="caption" tone="quaternary">
            {decay <= 0 ? t("swimCards.decayStable") : t("swimCards.decayFading")}
          </Text>
        </div>
      )}
    </Card>
  );
}

// ── CSS 갱신 안내 카드 ────────────────────────────────────────────────────────

function CssUpdateCard({ summary }: { summary: ActivitySummary }) {
  const { t } = useTranslation("activity");
  const distM = summary.distance ?? 0;
  const timeSec = (summary.ridingTimeMillis ?? 0) / 1000;
  const pace100 = distM > 0 && timeSec > 0 ? (timeSec / distM) * 100 : null;

  if (pace100 == null) return null;

  const paceMin = Math.floor(pace100 / 60);
  const paceSec = Math.round(pace100 % 60);
  const paceStr = `${paceMin}:${String(paceSec).padStart(2, '0')}`;

  return (
    <Card padding="none"
      style={{
        padding: 18,
        background: 'color-mix(in oklch, var(--aqua) 8%, var(--bg-2))',
        border: '1px solid color-mix(in oklch, var(--aqua) 20%, transparent)',
      }}
    >
      <Text as="div" variant="label" tone="primary" style={{ marginBottom: 3 }}>{t("swimCards.cssUpdateTitle")}</Text>
      <Text as="div" variant="bodySmall" tone="tertiary" style={{ marginBottom: 14 }}>{t("swimCards.cssUpdateDesc")}</Text>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <Text variant="dataLarge" style={{ color: 'var(--aqua)' }}>{paceStr}</Text>
        <Text variant="unit" tone="tertiary">/100m</Text>
      </div>
      <Text as="div" variant="bodySmall" tone="secondary" style={{ marginTop: 'var(--space-2)' }}>
        {t("swimCards.cssUpdateNote")}
      </Text>
    </Card>
  );
}

// ── 세트별 스플릿 테이블 ─────────────────────────────────────────────────────

function SwimSplitTable({ laps }: { laps?: ActivityStreams["laps"] }) {
  const { t } = useTranslation("activity");
  if (!laps || laps.length === 0) return null;

  const headers = ['#', t("swimCards.colSet"), t("swimCards.colDist"), t("swimCards.colTime"), t("swimCards.colPace"), t("swimCards.colHr"), t("swimCards.colStroke")];

  const rows = laps.map((lap, i) => {
    const distKm = lap.distanceKm ?? 0;
    const distM = distKm * 1000;
    const timeMs = lap.durationMs ?? 0;
    const timeSec = timeMs / 1000;
    const pace100 = distM > 0 ? (timeSec / distM) * 100 : 0;
    const paceMin = Math.floor(pace100 / 60);
    const paceSec = Math.round(pace100 % 60);
    const paceStr = pace100 > 0 ? `${paceMin}:${String(paceSec).padStart(2, '0')}` : '-';
    const hr = lap.avgHeartRate ?? null;
    const cadence = lap.avgCadence > 0 ? lap.avgCadence : null;
    const timeStr = timeSec > 0
      ? `${Math.floor(timeSec / 60)}:${String(Math.round(timeSec % 60)).padStart(2, '0')}`
      : '-';
    // 세트 타입 추정: 첫 세트=WU, 마지막=CD, 나머지=MAIN
    const type = i === 0 ? 'WU' : i === laps.length - 1 ? 'CD' : 'MAIN';
    const typeColor = type === 'MAIN' ? 'var(--aqua)' : 'color-mix(in oklch, var(--aqua) 55%, var(--ink-3))';
    const name = type === 'WU' ? t("swimCards.setWarmup") : type === 'CD' ? t("swimCards.setCooldown") : t("swimCards.setName", { index: i });
    return { no: i + 1, type, name, dist: Math.round(distM), time: timeStr, pace: paceStr, pace100, hr, cadence, typeColor, isMain: type === 'MAIN' };
  });

  const setHeader = t("swimCards.colSet");

  return (
    <Card padding="none" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center' }}>
        <Text as="h3" variant="label" tone="primary" style={{ margin: 0 }}>{t("swimCards.splitTitle")}</Text>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="text-[length:var(--fs-xs)]" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-2)', color: 'var(--ink-3)' }}>
              {headers.map(h => (
                <th key={h} className="text-[length:var(--fs-xs)]" style={{ padding: 'var(--space-2) var(--space-3)', textAlign: h === setHeader ? 'left' : 'right', fontWeight: 500, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.no} style={{ borderTop: '1px solid var(--line-soft)', background: r.isMain ? 'color-mix(in oklch, var(--aqua) 3%, transparent)' : 'transparent' }}>
                <td className="text-[length:var(--fs-xs)]" style={{ padding: '10px 12px', color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: r.typeColor }}>●</span> {r.no}
                </td>
                <td style={{ padding: '10px 12px', color: 'var(--ink-0)' }}>{r.name}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.dist}m</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.time}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: r.isMain ? 'var(--aqua)' : 'var(--ink-1)', fontWeight: r.isMain ? 600 : 400 }}>{r.pace}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--rose)' }}>{r.hr ?? '-'}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>{r.cadence != null ? `${Math.round(r.cadence)}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── 스트로크 분석 카드 ───────────────────────────────────────────────────────

function StrokeAnalysisCard({ summary }: { summary: ActivitySummary }) {
  const { t } = useTranslation("activity");
  const swolf = summary.swolf;
  const cadence = summary.averageCadence;

  return (
    <Card padding="none" style={{ padding: 18 }}>
      <Text as="div" variant="label" tone="primary" style={{ marginBottom: 3 }}>{t("swimCards.strokeTitle")}</Text>
      <Text as="div" variant="bodySmall" tone="tertiary" style={{ marginBottom: 'var(--space-3)' }}>{t("swimCards.strokeDesc")}</Text>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {swolf != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', paddingBottom: 10, borderBottom: '1px solid var(--line-soft)' }}>
            <Text as="div" variant="bodySmall" tone="secondary" style={{ flex: 1 }}>{t("swimCards.avgSwolf")}</Text>
            <Text variant="dataMedium" tone="primary" mono>{Math.round(swolf)}</Text>
          </div>
        )}
        {cadence != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', paddingBottom: 10, borderBottom: '1px solid var(--line-soft)' }}>
            <Text as="div" variant="bodySmall" tone="secondary" style={{ flex: 1 }}>{t("swimCards.strokeRate")}</Text>
            <Text variant="dataMedium" tone="primary" mono>{Math.round(cadence)}</Text>
            <Text variant="unit" tone="tertiary">spm</Text>
          </div>
        )}
        {cadence != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', paddingBottom: 10, borderBottom: '1px solid var(--line-soft)' }}>
            <Text as="div" variant="bodySmall" tone="secondary" style={{ flex: 1 }}>{t("swimCards.dps")}</Text>
            <Text variant="dataMedium" mono style={{ color: 'var(--aqua)' }}>
              {summary.distance > 0 && cadence > 0
                ? (summary.distance / ((summary.ridingTimeMillis / 60000) * cadence)).toFixed(2)
                : '-'
              }
            </Text>
            <Text variant="unit" tone="tertiary">m</Text>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── sTSS 부하 카드 ──────────────────────────────────────────────────────────

function SwimLoadCard({ tss }: { tss: number | null }) {
  const { t } = useTranslation("activity");
  if (tss == null) return null;
  const pct = Math.min(100, (tss / 150) * 100);
  const color = tss < 30 ? 'var(--aqua)' : tss < 60 ? 'var(--lime)' : tss < 100 ? 'var(--amber)' : 'var(--rose)';

  return (
    <Card padding="none" style={{ padding: 18 }}>
      <Text as="div" variant="label" tone="primary" style={{ marginBottom: 3 }}>{t("swimCards.swimLoadTitle")}</Text>
      <Text as="div" variant="bodySmall" tone="tertiary" style={{ marginBottom: 'var(--space-3)' }}>{t("swimCards.swimLoadDesc")}</Text>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 'var(--space-3)' }}>
        <Text variant="dataHero" mono style={{ color }}>{Math.round(tss)}</Text>
        <Text variant="unit" tone="secondary" mono>sTSS</Text>
      </div>
      <div style={{ height: 4, background: 'var(--bg-3)', borderRadius: 'var(--r-sm)', marginBottom: 'var(--space-2)', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: `linear-gradient(90deg, var(--aqua), ${color})`, borderRadius: 'var(--r-sm)' }} />
        {[30, 60, 100].map(n => (
          <div key={n} style={{ position: 'absolute', left: `${(n / 150) * 100}%`, top: -2, bottom: -2, width: 1, background: 'var(--bg-0)' }} />
        ))}
      </div>
      <div className="text-[length:var(--fs-xs)]" style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', color: 'var(--ink-4)' }}>
        <span>{t("swimCards.swimLoadLight")}</span>
        <span>{t("swimCards.swimLoadDrill")}</span>
        <span>{t("swimCards.swimLoadCss")}</span>
        <span>{t("swimCards.swimLoadHigh")}</span>
      </div>
    </Card>
  );
}

// ── 메인 export ──────────────────────────────────────────────────────────────

/** 수영 활동 상세 — 좌측 컬럼용 테이블 */
export function SwimLeftCards({ streams }: { streams?: ActivityStreams | null }) {
  return (
    <>
      <SwimLaneTimeline laps={streams?.laps} />
      <SwimSplitTable laps={streams?.laps} />
    </>
  );
}

/** 수영 활동 상세 — 우측 사이드바용 카드 */
export function SwimRightCards({ summary, streams }: { summary: ActivitySummary; streams?: ActivityStreams | null }) {
  return (
    <>
      <SwimLoadCard tss={summary.tss} />
      <StrokeAnalysisCard summary={summary} />
      <PaceDecayChart laps={streams?.laps} />
      <CssUpdateCard summary={summary} />
    </>
  );
}
