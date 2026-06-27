/**
 * 적응(adaptation) 한 줄 요약 — `AdaptationBanner` 의 액션 없는 경량 버전.
 *
 * 용도: PlanPage 가 아닌 곳(FitnessPage / DashboardPage 등) 에서 현재 plan 의 실행
 * 상태를 가볍게 노출. 클릭 시 상세 페이지(/plan)로 이동해서 사용자가 액션 가능.
 *
 * 노출 조건 (AdaptationBanner 와 동일):
 *   - severity 가 warn 또는 critical
 *   - shouldRerollSuggested == true
 *   - snoozedUntil 이 만료된 상태 (사용자가 1주 미루기 안 누름)
 */
import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../LocalizedLink";
import type { AdaptationFlag } from "@shared/types/goal";

interface Props {
  flag: AdaptationFlag;
  /** 클릭 시 이동 경로. 기본 /plan. */
  href?: string;
  /** 외부 컨테이너 추가 스타일 (margin 조절용). */
  style?: React.CSSProperties;
}

const TONE: Record<"warn" | "critical", { bg: string; border: string; ink: string; icon: string }> = {
  warn: {
    bg: "color-mix(in srgb, var(--amber) 12%, transparent)",
    border: "color-mix(in srgb, var(--amber) 40%, transparent)",
    ink: "var(--amber)",
    icon: "⚠",
  },
  critical: {
    bg: "color-mix(in srgb, var(--rose) 12%, transparent)",
    border: "color-mix(in srgb, var(--rose) 40%, transparent)",
    ink: "var(--rose)",
    icon: "⚠",
  },
};

export default function AdaptationSummary({ flag, href = "/plan", style }: Props) {
  const { t } = useTranslation("training");

  // AdaptationBanner 와 동일한 노출 조건
  const now = Date.now();
  if (flag.severity === "info") return null;
  if (!flag.shouldRerollSuggested) return null;
  if (flag.snoozedUntil != null && flag.snoozedUntil > now) return null;

  const tone = TONE[flag.severity];

  return (
    <Link
      to={href}
      role="status"
      aria-label={`${flag.reason} — ${t("adaptation.cta", { defaultValue: "운동 계획에서 자세히 보기" })}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 8,
        textDecoration: "none",
        cursor: "pointer",
        transition: "background .12s, border-color .12s",
        ...style,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: tone.ink,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: tone.ink,
            marginBottom: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {tone.icon} {flag.reason}
        </div>
        {flag.recent4wRatio != null && (
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {t("adaptation.metricsLine", { pct: Math.round(flag.recent4wRatio * 100) })}
            {flag.streakWeeksOff != null && flag.streakWeeksOff > 0
              ? t("adaptation.streakSuffix", { count: flag.streakWeeksOff })
              : ""}
          </div>
        )}
      </div>
      <span
        aria-hidden
        style={{
          fontSize: 11,
          color: tone.ink,
          fontFamily: "var(--font-mono)",
          letterSpacing: ".06em",
          flexShrink: 0,
        }}
      >
        {t("adaptation.detailsArrow", { defaultValue: "운동 계획 →" })}
      </span>
    </Link>
  );
}
