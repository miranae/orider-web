import type { CanonicalFitnessSummaryState } from "../../../hooks/useCanonicalFitnessSummary";
import type { FitnessModel } from "../../../hooks/useFitnessModel";
import { buttonClass } from "../../../theme/components";

interface CanonicalFitnessNoticeProps {
  state: CanonicalFitnessSummaryState;
  t: FitnessModel["t"];
}

/** 정본 상태만 기존 Fitness 화면 안에 덧붙인다. 별도 화면이나 제목은 만들지 않는다. */
export default function CanonicalFitnessNotice({ state, t }: CanonicalFitnessNoticeProps) {
  if (!state.enabled || (state.display === "value" && !state.showingLastGood)) return null;
  const key = state.display === "error" ? "failed" : state.status ?? "processing";
  return (
    <div
      role={key === "failed" ? "alert" : "status"}
      data-testid="canonical-fitness-notice"
      style={{
        padding: "var(--space-3) var(--space-4)",
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--r-md)",
        background: "var(--bg-1)",
        color: "var(--ink-2)",
        marginBottom: "var(--space-4)",
      }}
    >
      <strong style={{ color: "var(--ink-0)" }}>{t(`canonical.status.${key}`)}</strong>
      {state.showingLastGood && <span> · {t("canonical.lastGood")}</span>}
      {(key === "failed" || key === "processing") && (
        <button
          type="button"
          className={buttonClass({ variant: "ghost", size: "sm" })}
          onClick={state.retry}
          style={{ marginLeft: "var(--space-3)" }}
        >
          {t("canonical.retry")}
        </button>
      )}
    </div>
  );
}
