import { useTranslation } from "react-i18next";
import { Button, Stat, Text } from "../../../theme/components";
import type { goalLoadScope } from "./planScope";
import type { usePlanLoadComparison } from "./usePlanLoadComparison";
import "./PlanGoalLoadSummary.css";

export default function PlanGoalLoadSummary({ scope, load }: { scope: ReturnType<typeof goalLoadScope>; load: ReturnType<typeof usePlanLoadComparison> }) {
  const { t, i18n } = useTranslation("training");
  const summary = load.summary;
  const number = (value: number | null | undefined, signed = false) => scope.valid && value != null ? `${signed && value > 0 ? "+" : ""}${value.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}` : "—";
  return <section aria-label={t("goalLoad.title")} className="plan-goal-load">
    <Text as="p" variant="bodyMedium">{t("goalLoad.title")}</Text>
    <Text as="p" variant="caption" tone="secondary">{scope.valid ? t("goalLoad.range", scope.range) : t("goalLoad.invalid")}</Text>
    <div className="plan-goal-load__metrics">
      <Stat label={t("loadComparison.planned")} value={number(summary.plannedTss)} unit="TSS" />
      <Stat label={t("loadComparison.actual")} value={number(summary.actualTss)} unit="TSS" />
      <Stat label={t("goalLoad.attainment")} value={number(summary.ratioPct)} unit="%" />
      <Stat label={t("loadComparison.difference")} value={number(summary.deltaTss, true)} unit="TSS" />
    </div>
    <Text as="p" variant="caption" tone="secondary">{t("goalLoad.basis")}</Text>
    <Text as="p" variant="caption" tone="secondary">{scope.expired ? t("goalLoad.expired") : scope.remainingWeeks != null ? t("goalLoad.remaining", { count: scope.remainingWeeks }) : t("goalLoad.invalid")}</Text>
    {scope.valid && load.state === "loading" && <Text as="p" variant="caption" role="status">{t("loadComparison.loading")}</Text>}
    {scope.valid && summary.unknownCount > 0 && <Text as="p" variant="caption" tone="warning">{t("loadComparison.unknownLoads", { count: summary.unknownCount })}</Text>}
    {scope.valid && summary.estimated && <Text as="p" variant="caption" tone="secondary">{t("loadComparison.estimated")}</Text>}
    {scope.valid && ["error", "incomplete"].includes(load.state) && <div role="status"><Text as="p" variant="caption" tone="warning">{t("loadComparison.incomplete")}</Text><Button size="sm" variant="secondary" onClick={load.retry}>{t("loadComparison.retry")}</Button></div>}
  </section>;
}
