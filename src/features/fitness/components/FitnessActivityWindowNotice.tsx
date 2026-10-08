import type { FitnessModel } from "../../../hooks/useFitnessModel";
import { Text } from "../../../theme/components";

/** 서버가 잘라 저장한 활동 윈도는 완전한 기간 합계로 표시하지 않는다. */
export default function FitnessActivityWindowNotice({ incomplete, t }: {
  incomplete: boolean;
  t: FitnessModel["t"];
}) {
  if (!incomplete) return null;
  return (
    <Text as="p" variant="caption" tone="secondary" role="status"
      data-testid="fitness-activity-window-notice"
      style={{ margin: "var(--space-3) var(--space-4)" }}>
      {t("history.partial")}
    </Text>
  );
}
