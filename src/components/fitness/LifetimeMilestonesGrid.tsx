/**
 * 킬로미터스톤 배지 그리드 (이슈 #360) — 누적 거리 이정표 + 최장 라이드.
 *
 * 판정 주체는 `canonicalConsumerEnabled("milestones")` 로 갈린다 (#2237):
 *
 * - **꺼짐(기본)** — 클라가 활동 목록에서 판정한다(`computeLifetimeMilestones`, 5단 카탈로그).
 *   서버 누적 원장(personal-records 트리거)은 `run_lifetime` 만 누적해 **러닝 전용**이라,
 *   자전거 사용자에게는 서버 문서가 영영 생기지 않는다. 그 상태로 서버 판정을 소비하면 모든
 *   배지가 잠금으로 그려져 "모름"이 "미달성"이라는 거짓 확정값이 된다.
 * - **켜짐** — 서버 판정을 정본으로 쓴다. 단 서버 원장이 아직 판정할 수 없는 단계
 *   (해당 종목의 누적 문서가 없는 경우)는 잠금이 아니라 "집계 준비 중"으로 그린다.
 *
 * 누적 합계·최장 라이드는 서버에 대응 필드가 없어 플래그와 무관하게 화면 집계값을 쓴다
 * (`utils/lifetimeMilestones.ts` 참조). 배지와 섞지 않고 별도 줄에 둔다.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, Text } from "../../theme/components";
import { CUMULATIVE_MILESTONE_M } from "@shared/types/milestone";
import type { Activity } from "@shared/types";
import type { Milestone, MilestoneId } from "@shared/types/milestone";
import { canonicalConsumerEnabled } from "../../config/canonicalConsumers";
import { getDiscipline } from "../../utils/disciplineFilter";
import { computeLifetimeMilestones, computeLifetimeTotals } from "../../utils/lifetimeMilestones";

const MEDAL: Record<number, string> = {
  100: "💯",
  500: "🔥",
  1000: "👑",
  5000: "🚀",
  10000: "🌍",
};

/** 배지 한 칸의 상태 — `pending` 은 "서버가 아직 판정할 수 없음"(잠금 아님). */
type BadgeState = "achieved" | "locked" | "pending";

interface Badge {
  km: number;
  state: BadgeState;
  achievedAt: number | null;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/**
 * 서버 누적 원장이 이 활동 목록을 판정할 수 있는가.
 *
 * 트리거는 `run_lifetime` 만 누적한다 — 러닝이 아닌 거리가 섞여 있으면 누적 문서가 그 거리를
 * 담지 못하므로, 미달성 배지를 잠금으로 확정할 근거가 없다.
 */
function serverLedgerCovers(activities: Activity[]): boolean {
  return (activities ?? []).every((a) => getDiscipline(a?.type) === "run");
}

export interface LifetimeMilestonesGridProps {
  /** 전체 활동(연도 필터 이전) — 누적 합계·최장 라이드·(플래그 꺼짐일 때) 클라 판정의 입력. */
  activities: Activity[];
  /** 서버가 판정한 달성 마일스톤 (`useMilestones`). 플래그 켜짐일 때만 쓰인다. */
  achieved: Map<MilestoneId, Milestone>;
  /** 구독 응답 전 — 미달성(점선 잠금)으로 그리면 모름을 없음으로 그리는 셈이라 배지를 숨긴다. */
  loading?: boolean;
}

export default function LifetimeMilestonesGrid({ activities, achieved, loading = false }: LifetimeMilestonesGridProps) {
  const { t } = useTranslation("fitness");
  const canonical = canonicalConsumerEnabled("milestones");

  const totals = useMemo(() => computeLifetimeTotals(activities), [activities]);
  const clientSummary = useMemo(
    () => (canonical ? null : computeLifetimeMilestones(activities)),
    [activities, canonical],
  );
  const ledgerCovers = useMemo(
    () => (canonical ? serverLedgerCovers(activities) : true),
    [activities, canonical],
  );

  const badges: Badge[] = useMemo(() => {
    if (!canonical) {
      return (clientSummary?.milestones ?? []).map((m) => ({
        km: m.km,
        state: m.achieved ? "achieved" : "locked",
        achievedAt: m.achievedAt,
      }));
    }
    return (Object.keys(CUMULATIVE_MILESTONE_M) as Array<keyof typeof CUMULATIVE_MILESTONE_M>)
      .sort((a, b) => CUMULATIVE_MILESTONE_M[a] - CUMULATIVE_MILESTONE_M[b])
      .map((id) => {
        const milestone = achieved.get(id) ?? null;
        if (milestone != null) return { km: CUMULATIVE_MILESTONE_M[id] / 1000, state: "achieved" as const, achievedAt: milestone.achievedAt };
        // 서버 원장이 못 미치는 종목이면 잠금이 아니라 "집계 준비 중" — 모름을 미달성으로 확정하지 않는다.
        return { km: CUMULATIVE_MILESTONE_M[id] / 1000, state: ledgerCovers ? ("locked" as const) : ("pending" as const), achievedAt: null };
      });
  }, [achieved, canonical, clientSummary, ledgerCovers]);

  // 배지 숨김은 서버 구독을 기다리는 동안만 의미가 있다 — 클라 판정은 즉시 확정된다.
  const hideBadges = canonical && loading;

  return (
    <Card>
      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-3)" }}>
        {t("lifetimeMilestones.title")}
      </Text>
      <Text as="div" variant="bodySmall" tone="tertiary" style={{ marginBottom: "var(--space-3)" }}>
        {t("lifetimeMilestones.total", { km: Math.round(totals.totalDistanceMeters / 1000).toLocaleString() })}
      </Text>

      {hideBadges ? (
        <Text as="div" variant="bodySmall" tone="tertiary" data-testid="lifetime-milestones-loading">
          {t("lifetimeMilestones.loading")}
        </Text>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${badges.length}, 1fr)`, gap: "var(--space-2)" }}>
          {badges.map(({ km, state, achievedAt }) => {
            const done = state === "achieved";
            return (
              <div
                key={km}
                data-testid={`lifetime-milestone-${state}`}
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
                  {MEDAL[km]}
                </div>
                <Text as="div" variant="caption" tone={done ? "primary" : "tertiary"} weight={done ? 600 : 400}>
                  {t("lifetimeMilestones.label", { km: km.toLocaleString() })}
                </Text>
                {done && achievedAt != null && (
                  <Text as="div" variant="caption" tone="tertiary" mono>
                    {formatDate(achievedAt)}
                  </Text>
                )}
                {state === "pending" && (
                  <Text as="div" variant="caption" tone="tertiary">
                    {t("lifetimeMilestones.pending")}
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
