import { coachRoute } from "../../utils/coachRoute";
import type { Goal } from "@shared/types/goal";
import { useTranslation } from "react-i18next";
import { LocalizedLink } from "../LocalizedLink";

/** 가정값 수치와 같은 위치에 칩과 입력 행동 하나를 함께 둔다. */
export function GoalInputNotice({ assumed, estimated = false, baseline = false, discipline = "bike" }: {
  assumed: boolean; estimated?: boolean; baseline?: boolean; discipline?: "bike" | "run" | "swim";
}) {
  const { t } = useTranslation("training");
  if (!assumed && !estimated && !baseline) return null;
  return <div data-testid="goal-input-source" style={{ fontSize: "var(--fs-xs)", color: "var(--ink-2)", marginBlock: "var(--space-2)" }}>
    <span>{t(baseline ? "assumptions.baseline" : assumed ? "assumptions.chip" : "assumptions.estimated")}</span>
    {baseline && assumed && <> · <span>{t("assumptions.chip")}</span></>}
    {assumed && <> · <span>{t("assumptions.basis")}</span></>}
    {(assumed || estimated || baseline) && <> · <LocalizedLink to={coachRoute("/coach/condition#thresholds", discipline)}>{t("assumptions.confirm")}</LocalizedLink></>}
  </div>;
}

export function GoalSourceNotice({ goal, discipline }: { goal: Goal | null; discipline: "bike" | "run" | "swim" }) {
  if (!goal) return null;
  const sources = goal.planInputSources ?? goal.snapshot;
  const intensity = discipline === "bike" ? sources?.ftpSource : discipline === "run" ? sources?.thresholdPaceSource : sources?.cssSource;
  return <GoalInputNotice discipline={discipline} baseline={goal.assumedBaseline} assumed={intensity === "assumed" || discipline === "bike" && sources?.weightSource === "assumed"}
    estimated={intensity === "pdc_estimate"} />;
}
