import { isSportUiEnabled } from "../../../config/sportFeatures";
import { useTranslation } from "react-i18next";
import { useLocation, useSearchParams } from "react-router-dom";
import { RouteTabNav } from "../../../components/TabNav";

/** Existing execution views retain their canonical URLs and selected context. */
export default function PlanRecordNavigation({ date }: { date?: string | null }) {
  const { t } = useTranslation("training");
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const requestedSport = params.get("sport");
  // Records “all” is an activity filter; coach “tri” is a distinct load model.
  const sport = requestedSport === "run" || requestedSport === "bike" || requestedSport === "swim" && isSportUiEnabled(requestedSport) ? requestedSport : requestedSport === "tri" || requestedSport === "all" ? requestedSport : pathname.endsWith("/activities") && requestedSport == null ? "all" : "bike";
  const query = (plan: boolean, includeDate = true) => {
    const next = new URLSearchParams({ sport: plan ? (sport === "all" || sport === "tri" ? "bike" : sport) : (sport === "tri" ? "all" : sport) });
    if (includeDate && date) next.set("date", date);
    return `?${next}`;
  };
  return <nav aria-label={t("planRecords.title")} style={{ marginBottom: "var(--space-4)" }}><RouteTabNav tabs={[
    { to: `/coach/today${query(true, false)}`, label: t("planRecords.today"), end: true },
    { to: `/coach/plan${query(true)}`, label: t("planRecords.plan"), end: true },
  ]} /></nav>;
}
