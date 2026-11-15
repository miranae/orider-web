import type { CanonicalFitnessSummaryState } from "../../../hooks/useCanonicalFitnessSummary";
import type { FitnessModel } from "../../../hooks/useFitnessModel";
import { buttonClass } from "../../../theme/components";
import { Resolvable, type Resolve } from "../../../components/redesign/states/Resolvable";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";

interface CanonicalFitnessNoticeProps {
  state: CanonicalFitnessSummaryState;
  t: FitnessModel["t"];
}

/** 정본 상태만 기존 Fitness 화면 안에 덧붙인다. 별도 화면이나 제목은 만들지 않는다. */
export default function CanonicalFitnessNotice({ state, t }: CanonicalFitnessNoticeProps) {
  const webResolve = useFirebaseServices().scope !== "embedded";
  if (!state.enabled || (state.display === "value" && !state.showingLastGood)) return null;
  const key = state.display === "error" ? "failed" : state.status ?? "processing";
  // 「계산할 데이터 없음」은 기록을 들여오는 연결 화면, 「갱신 대기」는 다시 확인으로 푼다(실패·계산 중은 기존 버튼).
  const resolve: Resolve | undefined = key === "unavailable" ? webResolve ? { to: "/settings/connections" } : undefined : key === "stale" ? { onClick: state.retry } : undefined;
  return (
    <div
      role={key === "failed" ? "alert" : "status"}
      data-testid="K1-1-4"
      style={{
        padding: "var(--space-3) var(--space-4)",
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--r-md)",
        background: "var(--bg-1)",
        color: "var(--ink-2)",
        marginBottom: "var(--space-4)",
      }}
    >
      <strong style={{ color: "var(--ink-0)" }}><Resolvable resolve={resolve}>{t(`canonical.status.${key}`)}</Resolvable></strong>
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
