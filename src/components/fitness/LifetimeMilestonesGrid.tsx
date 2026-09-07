/**
 * 킬로미터스톤 배지 그리드 (이슈 #360) — 누적 거리 이정표 + 최장 라이드.
 *
 * 달성 판정은 **서버**(`users/{uid}/milestones` 의 cumulative_* 문서)만 한다 — 예전엔 이
 * 그리드가 클라 재계산 결과를 받아 서버 판정과 갈릴 수 있었다(#2237). 카탈로그를 넓히는 일
 * (5000/10000km 등)은 서버 판정 추가가 선행돼야 한다.
 *
 * 누적 합계·최장 라이드는 서버에 대응 필드가 없어 화면 집계값을 그대로 쓴다
 * (`utils/lifetimeMilestones.ts` 참조). 배지와 섞지 않고 별도 줄에 둔다.
 */
import { useTranslation } from "react-i18next";
import { Card, Text } from "../../theme/components";
import { CUMULATIVE_MILESTONE_M } from "@shared/types/milestone";
import type { Milestone, MilestoneId } from "@shared/types/milestone";
import type { LifetimeTotals } from "../../utils/lifetimeMilestones";

const MEDAL: Record<string, string> = {
  cumulative_100km: "💯",
  cumulative_500km: "🔥",
  cumulative_1000km: "👑",
};

/** 표시 순서 — 짧은 누적 거리 순. */
const CUMULATIVE_IDS = (Object.keys(CUMULATIVE_MILESTONE_M) as Array<keyof typeof CUMULATIVE_MILESTONE_M>)
  .sort((a, b) => CUMULATIVE_MILESTONE_M[a] - CUMULATIVE_MILESTONE_M[b]);

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export interface LifetimeMilestonesGridProps {
  /** 서버가 판정한 달성 마일스톤 (`useMilestones`). */
  achieved: Map<MilestoneId, Milestone>;
  totals: LifetimeTotals;
  /** 구독 응답 전 — 미달성(점선 잠금)으로 그리면 모름을 없음으로 그리는 셈이라 배지를 숨긴다. */
  loading?: boolean;
}

export default function LifetimeMilestonesGrid({ achieved, totals, loading = false }: LifetimeMilestonesGridProps) {
  const { t } = useTranslation("fitness");

  return (
    <Card>
      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-3)" }}>
        {t("lifetimeMilestones.title")}
      </Text>
      <Text as="div" variant="bodySmall" tone="tertiary" style={{ marginBottom: "var(--space-3)" }}>
        {t("lifetimeMilestones.total", { km: Math.round(totals.totalDistanceMeters / 1000).toLocaleString() })}
      </Text>

      {loading ? (
        <Text as="div" variant="bodySmall" tone="tertiary" data-testid="lifetime-milestones-loading">
          {t("lifetimeMilestones.loading")}
        </Text>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${CUMULATIVE_IDS.length}, 1fr)`, gap: "var(--space-2)" }}>
          {CUMULATIVE_IDS.map((id) => {
            const milestone = achieved.get(id) ?? null;
            const done = milestone != null;
            return (
              <div
                key={id}
                style={{
                  textAlign: "center",
                  border: "1px solid var(--line-soft)",
                  borderRadius: "var(--r-md)",
                  padding: "var(--space-3) var(--space-1) var(--space-2)",
                  borderStyle: done ? "solid" : "dashed",
                  background: done ? "var(--accent-soft-bg)" : "transparent",
                  borderColor: done ? "var(--accent-soft-border)" : "var(--line-soft)",
                  opacity: done ? 1 : 0.55,
                }}
              >
                <div style={{ fontSize: "var(--fs-lg)", filter: done ? "none" : "grayscale(1)" }} aria-hidden="true">
                  {MEDAL[id]}
                </div>
                <Text as="div" variant="caption" tone={done ? "primary" : "tertiary"} weight={done ? 600 : 400}>
                  {t("lifetimeMilestones.label", { km: (CUMULATIVE_MILESTONE_M[id] / 1000).toLocaleString() })}
                </Text>
                {done && milestone && (
                  <Text as="div" variant="caption" tone="tertiary" mono>
                    {formatDate(milestone.achievedAt)}
                  </Text>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totals.longestRide && (
        <div style={{ marginTop: "var(--space-3)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="bodySmall" tone="secondary">{t("lifetimeMilestones.longestRide")}</Text>
          <Text weight={700} mono>
            {(totals.longestRide.distanceMeters / 1000).toFixed(1)} km
          </Text>
        </div>
      )}
    </Card>
  );
}
