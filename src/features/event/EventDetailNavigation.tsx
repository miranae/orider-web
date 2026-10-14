import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RouteTabNav } from "../../components/TabNav";
import { LocalizedLink } from "../../components/LocalizedLink";
export default function EventDetailNavigation({ eventId, live = false, results = live }: { eventId: string; live?: boolean; results?: boolean }) {
  const { t } = useTranslation("event");
  const location = useLocation();
  return <div data-testid="D4-T" className="py-3">
    <RouteTabNav state={location.state} tabs={[{ to: `/event/${eventId}`, label: t("detail.overviewTab"), end: true }, { to: `/event/${eventId}/register`, label: t("detail.participationTab") }, ...(results ? [{ to: `/event/${eventId}/results`, label: t("resultsTitle") }] : [])]} />
    <LocalizedLink to={`/live/${eventId}`} state={location.state} className={live ? "font-bold text-[var(--lime)]" : undefined}>{t("detail.liveSpectator")}</LocalizedLink>
  </div>;
}
