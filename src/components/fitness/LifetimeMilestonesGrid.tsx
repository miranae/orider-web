/**
 * 킬로미터스톤 배지 그리드 (이슈 #360) — 종목 무관 누적 거리 이정표 + 최장 라이드.
 *
 * `src/utils/lifetimeMilestones.ts` 참조: 서버 트리거 없이 클라이언트가 이미 로드한 활동
 * 목록에서 순수 함수로 재계산한다(영속 없음, 항상 재계산 가능). 표시 스타일은
 * `MilestonesGrid`(러닝 전용 서버 마일스톤)와 통일 — 달성: 실색 배지, 미달성: 점선 잠금.
 */
import { useTranslation } from "react-i18next";
import { Card, Text } from "../../theme/components";
import type { LifetimeMilestonesSummary } from "../../utils/lifetimeMilestones";

const MEDAL: Record<number, string> = {
  100: "💯",
  500: "🔥",
  1000: "👑",
  5000: "🚀",
  10000: "🌍",
};

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export interface LifetimeMilestonesGridProps {
  summary: LifetimeMilestonesSummary;
}

export default function LifetimeMilestonesGrid({ summary }: LifetimeMilestonesGridProps) {
  const { t } = useTranslation("fitness");

  return (
    <Card>
      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-3)" }}>
        {t("lifetimeMilestones.title")}
      </Text>
      <Text as="div" variant="bodySmall" tone="tertiary" style={{ marginBottom: "var(--space-3)" }}>
        {t("lifetimeMilestones.total", { km: Math.round(summary.totalDistanceMeters / 1000).toLocaleString() })}
      </Text>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "var(--space-2)" }}>
        {summary.milestones.map(({ km, achieved, achievedAt }) => (
          <div
            key={km}
            style={{
              textAlign: "center",
              border: "1px solid var(--line-soft)",
              borderRadius: "var(--r-md)",
              padding: "var(--space-3) var(--space-1) var(--space-2)",
              borderStyle: achieved ? "solid" : "dashed",
              background: achieved ? "var(--accent-soft-bg)" : "transparent",
              borderColor: achieved ? "var(--accent-soft-border)" : "var(--line-soft)",
              opacity: achieved ? 1 : 0.55,
            }}
          >
            <div style={{ fontSize: "var(--fs-lg)", filter: achieved ? "none" : "grayscale(1)" }} aria-hidden="true">
              {MEDAL[km]}
            </div>
            <Text as="div" variant="caption" tone={achieved ? "primary" : "tertiary"} weight={achieved ? 600 : 400}>
              {t("lifetimeMilestones.label", { km: km.toLocaleString() })}
            </Text>
            {achieved && achievedAt != null && (
              <Text as="div" variant="caption" tone="tertiary" mono>
                {formatDate(achievedAt)}
              </Text>
            )}
          </div>
        ))}
      </div>

      {summary.longestRide && (
        <div style={{ marginTop: "var(--space-3)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="bodySmall" tone="secondary">{t("lifetimeMilestones.longestRide")}</Text>
          <Text weight={700} mono>
            {(summary.longestRide.distanceMeters / 1000).toFixed(1)} km
          </Text>
        </div>
      )}
    </Card>
  );
}
