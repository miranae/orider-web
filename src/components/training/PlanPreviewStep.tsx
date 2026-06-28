import { useTranslation } from "react-i18next";
import type { EventType, FeasibilityLabel } from '@shared/types/goal';
import { FEAS_COLORS, FEAS_LABEL_KEYS } from './constants';

// ─── Props ───────────────────────────────────────────────────────────────────
export interface PlanPreviewStepProps {
  goal: {
    courseName: string;
    courseDist: number;
    courseElev: number;
    eventType: EventType;
    eventDate: string;       // YYYY-MM-DD
    targetDurationMin?: number;
    weeklySessions: 1 | 2 | 3 | 4 | 5 | 6;
  };
  feasibility: {
    label: FeasibilityLabel;
    requiredWkg?: number;
    sustainableWkg?: number;
    gapWkg?: number;
  };
  loading: boolean;
  /** 서버에서 계산된 목표일 예상 CTL 변화량. 없으면 "—" 표시 */
  projectedCtl?: number;
}

// ─── 컴포넌트 ────────────────────────────────────────────────────────────────
export default function PlanPreviewStep({ goal, feasibility, loading, projectedCtl }: PlanPreviewStepProps) {
  const { t } = useTranslation("training");
  const { courseName, eventDate, weeklySessions } = goal;

  // 남은 주수 계산
  const today = new Date();
  const eventDateObj = eventDate ? new Date(eventDate) : today;
  const weeksLeft = Math.max(1, Math.round(
    (eventDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 7),
  ));

  // 기간별 분배
  const buildW = Math.round(weeksLeft * 0.6);
  const peakW = Math.round(weeksLeft * 0.25);
  const taperW = Math.max(1, weeksLeft - buildW - peakW);

  // KPI 계산
  const totalSessions = weeksLeft * weeklySessions;
  const avgWeeklyTss = weeklySessions * 82;
  const totalTss = weeksLeft * avgWeeklyTss;

  const feasColor = FEAS_COLORS[feasibility.label];

  // ── 로딩 상태 ──
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-4)',
          padding: '60px 24px',
          background: 'var(--bg-1)',
          borderRadius: "var(--r-lg)",
          border: '1px solid var(--line-soft)',
        }}
      >
        {/* 스피너 */}
        <div
          style={{
            width: 36,
            height: 36,
            border: '3px solid var(--line-soft)',
            borderTopColor: 'var(--lime)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <div style={{ fontSize: "var(--fs-sm)", color: 'var(--ink-2)' }}>
          {t('planPreview.loading')}
        </div>
        <div style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)' }}>
          {t('planPreview.loadingDetail', { courseName, weeks: weeksLeft })}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* ── KPI 스트립 ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 10,
        }}
      >
        {(
          [
            [t('planPreview.kpi.totalWeeks'), String(weeksLeft), t('phase.weeksUnit')],
            [t('planPreview.kpi.totalSessions'), String(totalSessions), null],
            [t('planPreview.kpi.avgWeeklyTss'), avgWeeklyTss.toLocaleString(), null],
            [t('planPreview.kpi.projectedCtl'), projectedCtl != null ? (projectedCtl >= 0 ? `+${projectedCtl}` : String(projectedCtl)) : '—', null],
          ] as const
        ).map(([k, v, u]) => (
          <div
            key={k}
            style={{
              padding: 14,
              background: 'var(--bg-2)',
              borderRadius: "var(--r-md)",
              border: '1px solid var(--line-soft)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: "var(--fs-xs)",
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-2)',
                fontWeight: 500,
                marginBottom: 6,
              }}
            >
              {k}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
              <span
                style={{
                  fontSize: "var(--fs-3xl)",
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--ink-0)',
                  letterSpacing: '-0.02em',
                }}
              >
                {v}
              </span>
              {u != null && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: "var(--fs-sm)",
                    color: 'var(--ink-2)',
                    fontWeight: 400,
                  }}
                >
                  {u}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── 기간별 구성 바 ── */}
      <div
        style={{
          padding: 22,
          background: 'var(--bg-1)',
          borderRadius: "var(--r-lg)",
          border: '1px solid var(--line-soft)',
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: "var(--fs-sm)",
              fontWeight: 600,
              color: 'var(--ink-0)',
              marginBottom: 2,
            }}
          >
            {t('planPreview.phasesTitle')}
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-3)' }}>{t('planPreview.phasesSubtitle')}</div>
        </div>

        {/* 분배 바 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `${buildW}fr ${peakW}fr ${taperW}fr`,
            gap: 1,
            border: '1px solid var(--line-soft)',
            borderRadius: "var(--r-md)",
            overflow: 'hidden',
          }}
        >
          {(
            [
              ['buildup', buildW, 'var(--aqua)'] as const,
              ['peak', peakW, 'var(--lime)'] as const,
              ['taper', taperW, 'var(--amber)'] as const,
            ]
          ).map(([key, weeks, color]) => (
            <div
              key={key}
              style={{
                padding: 'var(--space-4)',
                background: 'var(--bg-2)',
                borderLeft: `3px solid ${color}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 'var(--space-2)',
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: 'var(--ink-0)' }}>
                  {t(`planPreview.phase.${key}`)}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: "var(--fs-xs)",
                    color: 'var(--ink-3)',
                  }}
                >
                  {weeks}{t('phase.weeksUnit')}
                </span>
              </div>
              <div style={{ fontSize: "var(--fs-xs)", color: 'var(--ink-2)', lineHeight: 1.5 }}>{t(`planPreview.phaseDesc.${key}`)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feasibility 요약 배지 ── */}
      <div
        style={{
          padding: 'var(--space-4)',
          background: 'var(--bg-1)',
          borderRadius: "var(--r-lg)",
          border: '1px solid var(--line-soft)',
          borderLeft: `3px solid ${feasColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: "var(--fs-xs)",
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-2)',
              fontWeight: 500,
              marginBottom: 'var(--space-1)',
            }}
          >
            {t('planPreview.feasibilityLabel')}
          </div>
          <div style={{ fontSize: "var(--fs-xl)", fontWeight: 700, color: feasColor }}>
            {t(FEAS_LABEL_KEYS[feasibility.label] ?? 'feasLabels.on_track')}
          </div>
        </div>
        {feasibility.requiredWkg != null && feasibility.sustainableWkg != null && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
              fontSize: "var(--fs-xs)",
              fontFamily: 'var(--font-mono)',
              textAlign: 'right',
            }}
          >
            <div>
              <span style={{ color: 'var(--ink-3)' }}>{t('planPreview.required')} </span>
              <span style={{ color: feasColor, fontWeight: 600 }}>
                {feasibility.requiredWkg} W/kg
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--ink-3)' }}>{t('planPreview.current')} </span>
              <span style={{ color: 'var(--ink-1)' }}>
                {feasibility.sustainableWkg} W/kg
              </span>
            </div>
            {feasibility.gapWkg != null && (
              <div>
                <span style={{ color: 'var(--ink-3)' }}>{t('planPreview.gap')} </span>
                <span style={{ color: feasColor, fontWeight: 600 }}>
                  {feasibility.gapWkg >= 0 ? '+' : ''}
                  {feasibility.gapWkg.toFixed(2)} W/kg
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 계획 요약 ── */}
      <div
        style={{
          padding: 'var(--space-4)',
          background: 'color-mix(in oklch, var(--lime) 6%, var(--bg-1))',
          border: '1px solid color-mix(in oklch, var(--lime) 25%, var(--line-soft))',
          borderRadius: "var(--r-lg)",
          fontSize: "var(--fs-xs)",
          color: 'var(--ink-1)',
          lineHeight: 1.6,
          display: 'flex',
          gap: 'var(--space-3)',
        }}
      >
        {/* 체크 아이콘 */}
        <svg
          width={18}
          height={18}
          viewBox="0 0 18 18"
          fill="none"
          style={{ color: 'var(--lime)', flexShrink: 0, marginTop: 2 }}
        >
          <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M5.5 9l2.5 2.5 4.5-4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div>
          <strong style={{ color: 'var(--ink-0)' }}>
            {t('planPreview.summaryTitle')}
          </strong>{' '}
          {t('planPreview.summaryBody', { weeks: weeksLeft, sessions: totalSessions, tss: totalTss.toLocaleString() })}
        </div>
      </div>
    </div>
  );
}
