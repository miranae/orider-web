import { isSportUiEnabled } from "../../../config/sportFeatures";
import { useTranslation } from "react-i18next";
import { useLocation, useSearchParams } from "react-router-dom";
import { RouteTabNav } from "../../../components/TabNav";

/** 하위 탭 이동 표시. 날짜 맥락은 들고 가되 받는 화면이 그날로 스크롤하지 않게 한다(PlanPage). */
const PLAN_RECORD_TAB_STATE = { planRecordTab: true } as const;
export function isPlanRecordTabState(state: unknown): boolean {
  return !!state && typeof state === "object" && (state as { planRecordTab?: unknown }).planRecordTab === true;
}

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
  return <nav aria-label={t("planRecords.title")} style={{ marginBottom: "var(--space-4)" }}><RouteTabNav state={PLAN_RECORD_TAB_STATE} tabs={[
    { to: `/coach/today${query(true, false)}`, label: t("planRecords.today"), end: true },
    { to: `/coach/plan${query(true)}`, label: t("planRecords.plan"), end: true },
    { to: `/athlete/me/activities${query(false)}`, label: t("planRecords.records"), end: true },
  ]} /></nav>;
}
