/**
 * 마일스톤 그리드 (설계 문서 §3.4b, 시안 6) — 거리 완주 배지.
 *
 * 카탈로그(첫 5km/10km/하프/풀) 전체를 보여주고, 달성 여부로 상태를 나눈다:
 *  - 달성: 실색 배지 + 달성일
 *  - 소급 조용 달성(celebrated:true 이지만 배포 전 달성): 동일하게 표시(구분 안 함 — 이미 달성)
 *  - 미달성: 점선 잠금 + 다음 목표 제시
 *
 * 판정·celebrated 정책은 서버·모달이 담당. 이 컴포넌트는 read-only 표시만.
 */
import { useTranslation } from "react-i18next";
import { Card, Text } from "../../theme/components";
import { MILESTONE_DISTANCES, DISTANCE_MILESTONE_ID } from "@shared/types/milestone";
import type { Milestone, MilestoneId } from "@shared/types/milestone";

const MEDAL: Record<MilestoneId, string> = {
  first_5km: "🏅",
  first_10km: "🎖️",
  first_half: "🥈",
  first_full: "🏆",
  cumulative_100km: "💯",
  cumulative_500km: "🔥",
  cumulative_1000km: "👑",
};

/** 표시 순서 — 거리 완주 4종 다음 누적 3종. */
const CUMULATIVE_IDS: MilestoneId[] = ["cumulative_100km", "cumulative_500km", "cumulative_1000km"];

export interface MilestonesGridProps {
  achieved: Map<MilestoneId, Milestone>;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export default function MilestonesGrid({ achieved }: MilestonesGridProps) {
  const { t } = useTranslation("fitness");

  const distanceItems = MILESTONE_DISTANCES.map((dist) => DISTANCE_MILESTONE_ID[dist]!);
  const items = [...distanceItems, ...CUMULATIVE_IDS].map((id) => ({
    id,
    milestone: achieved.get(id) ?? null,
  }));

  return (
    <Card>
      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-3)" }}>
        {t("milestones.title")}
      </Text>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-2)" }}>
        {items.map(({ id, milestone }) => {
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
              <div
                style={{ fontSize: "var(--fs-lg)", filter: done ? "none" : "grayscale(1)" }}
                aria-hidden="true"
              >
                {MEDAL[id]}
              </div>
              <Text as="div" variant="caption" tone={done ? "primary" : "tertiary"} weight={done ? 600 : 400}>
                {t(`milestones.label.${id}`)}
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
    </Card>
  );
}
