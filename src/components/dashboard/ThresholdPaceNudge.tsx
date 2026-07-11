/**
 * 임계 페이스 설정 유도 (설계 문서 §3.1 — `regular` 러너 대상).
 *
 * 꾸준히 달리는 사람인데 임계 페이스를 설정하지 않으면, 오늘의 워크아웃 목표 페이스도
 * rTSS 해석도 계산되지 않는다 — 이 앱이 줄 수 있는 것의 절반이 잠겨 있는 상태다.
 * 반대로 가끔 달리는 사람에게 이 배너를 띄우면 잔소리가 된다. 그래서 레벨로 게이트한다.
 *
 * 서버가 러닝 임계 페이스 제안을 emit 하게 되면(R3) 이 배너는 기존
 * `ThresholdSuggestionBanner` 의 "원탭 수락" 흐름으로 승격된다.
 */
import { useTranslation } from "react-i18next";
import { Card, Text } from "../../theme/components";
import { LocalizedLink } from "../LocalizedLink";

export interface ThresholdPaceNudgeProps {
  /** 표시 여부는 호출부가 레벨·임계값 보유 여부로 결정한다. */
  visible: boolean;
}

export default function ThresholdPaceNudge({ visible }: ThresholdPaceNudgeProps) {
  const { t } = useTranslation("dashboard");
  if (!visible) return null;

  return (
    <Card style={{ borderColor: "var(--accent-soft-border)", background: "var(--accent-soft-bg)" }}>
      <Text as="p" variant="bodySmall" tone="primary" style={{ margin: 0 }}>
        {t("thresholdNudge.body")}{" "}
        <LocalizedLink
          to="/settings?section=training"
          style={{ color: "var(--accent)", fontWeight: 600 }}
        >
          {t("thresholdNudge.cta")}
        </LocalizedLink>
      </Text>
    </Card>
  );
}
