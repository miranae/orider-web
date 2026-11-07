import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RouteTabNav } from "../../components/TabNav";
import { LocalizedLink } from "../../components/LocalizedLink";
import "./detail/event-profile.css";
export default function EventDetailNavigation({ eventId, live = false, results = live }: { eventId: string; live?: boolean; results?: boolean }) {
  const { t } = useTranslation("event");
  const location = useLocation();
  return <div data-testid="D4-T" className="event-detail-navigation">
    <RouteTabNav state={location.state} tabs={[{ to: `/event/${eventId}`, label: t("detail.overviewTab"), end: true }, { to: `/event/${eventId}/register`, label: t("detail.participationTab") }, ...(results ? [{ to: `/event/${eventId}/results`, label: t("resultsTitle") }] : [])]} />
    <LocalizedLink to={`/live/${eventId}`} state={location.state} className={`event-detail-navigation__live${live ? " font-bold text-[var(--lime)]" : ""}`}>{t("detail.liveSpectator")}</LocalizedLink>
  </div>;
}
