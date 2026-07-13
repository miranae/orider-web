/**
 * TodayConclusion — "오늘의 결론" (#400 §1·§2).
 *
 * 경고/회복 상태/주간 해석/워크아웃 추천이 흩어진 개별 카드로 표시되면 사용자가 서로 다른
 * 결론을 조합해야 하는 문제(#400)를 해소하기 위해, buildTodayConclusion() 이 판정한 단일
 * 케이스를 모순 없는 한 문장으로 렌더링한다. Primary CTA 는 이 컴포넌트가 아니라 바로 아래
 * 배치되는 TodaysWorkoutCard 가 담당 — 여기서는 "왜" 만 설명한다.
 */
import { useTranslation } from "react-i18next";
import { Text } from "../../theme/components";
import { buildTodayConclusion, type TodayConclusionInput } from "../../features/fitness/fitnessPageUtils";

export default function TodayConclusion(props: TodayConclusionInput) {
  const { t } = useTranslation("fitness");
  const conclusion = buildTodayConclusion(props);

  const text = (() => {
    switch (conclusion.case) {
      case "fatiguedRest":
        return t("conclusion.fatiguedRest");
      case "recoveredLongRest":
        return t("conclusion.recoveredLongRest", { restDays: conclusion.restDays });
      case "recoveredLowRecentLoad":
        return t("conclusion.recoveredLowRecentLoad", { loadPct: conclusion.loadPct });
      case "balancedFollowPlan":
      default:
        return t("conclusion.balancedFollowPlan");
    }
  })();

  return (
    <div style={{ marginBottom: "var(--space-3)" }}>
      <Text as="div" variant="eyebrow" style={{ marginBottom: "var(--space-1)", color: "var(--ink-4)" }}>
        {t("conclusion.title")}
      </Text>
      <Text as="p" variant="bodyLarge" style={{ margin: 0, maxWidth: 720, color: "var(--ink-0)" }}>
        {text}
      </Text>
    </div>
  );
}
