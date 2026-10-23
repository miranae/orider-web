import PlanDayLoadComparison from "./PlanDayLoadComparison";
import PlanPeriodReturn from "./PlanPeriodReturn";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { planDayKey } from "@shared/training/planDate";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { Text, buttonClass } from "../../../theme/components";
import { presentPlanRecord, type PlanRecordEntry } from "./planRecordPresentation";

export type { PlanRecordEntry } from "./planRecordPresentation";

/** Saved plan/execution evidence only: this view cannot reserve, link, confirm, or write an outcome. */
export default function PlanRecordEvidence({ date, plans, today = planDayKey(Date.now()) }: {
  date: string; plans: readonly PlanRecordEntry[]; today?: string;
}) {
  const { t } = useTranslation("training");
  const location = useLocation();
  if (!plans.length) return <PlanPeriodReturn />;
  const evidence = location.state?.periodEvidence;
  const rows = plans.map(plan => ({ plan, view: presentPlanRecord(plan, { date, today }),
    loadRow: evidence?.date === date && evidence.discipline === plan.discipline && evidence.row?.date === date ? evidence.row : undefined }));
  return <section aria-label={t("planRecords.comparison")} style={{ display: "grid", maxWidth: "70ch", gap: "var(--space-3)", padding: "var(--space-4)" }}>
    <Text as="h3" variant="subtitle">{t("planRecords.comparison")}</Text>
    <PlanPeriodReturn />
    {rows.map(({ plan, view, loadRow }, index) => <div key={index} style={{ display: "grid", gap: "var(--space-1)" }}>
      <Text as="p" variant="bodySmall" style={{ margin: 0 }}>{t("planRecords.prescription", { workout: `${t(`discipline.${plan.discipline}`)} · ${t(`workouts.${plan.workout}`)}`, load: view.plannedLoad ?? "—", minutes: view.plannedDurationMin ?? "—" })}</Text>
      {loadRow && <PlanDayLoadComparison day={{ ...plan, date: Date.parse(`${date}T00:00:00+09:00`) }} row={loadRow} state="ready" />}
      <Text as="p" variant={loadRow ? "caption" : "bodyMedium"} style={{ margin: 0 }}>{loadRow ? t("loadComparison.fulfillment.executionFact", { state: t(`planRecords.state.${view.outcome}`) }) : t(`planRecords.state.${view.outcome}`)}</Text>
      {!(view.outcome === "rest" && view.linkage === "none") && <Text as="p" variant="caption" tone="secondary" style={{ margin: 0 }}>{t(`planRecords.basis.${view.linkage}`)}</Text>}
      {view.actualLoad != null && <Text as="p" variant="caption" tone="secondary" style={{ margin: 0 }}>{t("planRecords.actualLoad", { value: view.actualLoad })}</Text>}
      {view.activityLinks.some(link => link.kind === "record") && view.actualLoad == null && <Text as="p" variant="caption" tone="secondary" style={{ margin: 0 }}>{t("planRecords.loadUnavailable")}</Text>}
      {view.candidateLoad != null && <Text as="p" variant="caption" tone="secondary" style={{ margin: 0 }}>{t("planRecords.candidateLoad", { value: view.candidateLoad })}</Text>}
      {(view.actualLoad != null || view.candidateLoad != null) && <Text as="p" variant="bodySmall" tone="secondary">{t("planRecords.loadSnapshotBasis")}</Text>}
      {view.linkage !== "confirmed" && view.outcome !== "rest" && <Text as="p" variant="caption" tone="secondary">{t("planRecords.notComparable")}</Text>}
      {view.postponedToLocalDate && <Text as="p" variant="caption" tone="secondary" style={{ margin: 0 }}>{t("planRecords.postponedDate", { date: view.postponedToLocalDate })}</Text>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        {view.activityLinks.map(link => <LocalizedLink key={link.id} className={buttonClass({ variant: "ghost", size: "sm" })} to={`/activity/${encodeURIComponent(link.id)}`}>{link.kind === "candidate" ? t("planRecords.viewCandidate") : t("today.viewActivity")}</LocalizedLink>)}
        <LocalizedLink className={buttonClass({ variant: "secondary", size: "sm" })} state={{ periodEvidence: location.state?.periodEvidence, periodReturn: location.state?.periodReturn, comparisonReturn: { pathname: location.pathname, search: location.search, hash: location.hash } }} to={`/coach/plan?sport=${plan.discipline}${view.localDate ? `&date=${view.localDate}` : ""}`}>{t("planRecords.reviewPlan")}</LocalizedLink>
      </div>
    </div>)}
    {rows.some(({ view }) => view.linkage !== "confirmed" && !(view.outcome === "rest" && view.linkage === "none")) && <Text as="p" variant="caption" tone="secondary" style={{ margin: 0 }}>{t("planRecords.matchingNote")}</Text>}
  </section>;
}
