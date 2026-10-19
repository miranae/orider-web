import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";
import { functions, ensureAppCheckReady } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { LocalizedLink } from "../LocalizedLink";
import { Card, Text, buttonClass } from "../../theme/components";
import { logClientError } from "../../services/errorLogger";

interface RegisteredEvent { eventId: string; name: string; startTime: number }
export default function HomeUpcomingEvents({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation("dashboard");
  const [state, setState] = useState<{ uid: string; events: RegisteredEvent[]; failed?: boolean } | null>(null);
  useEffect(() => {
    if (!user || user.isAnonymous) return;
    let cancelled = false;
    void ensureAppCheckReady().then(() => {
      if (cancelled) return;
      return httpsCallable<void, { events: RegisteredEvent[] }>(functions, "listMyRegisteredEvents")();
    }).then((result) => {
      if (!cancelled && result) setState({ uid: user.uid, events: result.data.events.filter((event) => event.startTime >= Date.now()).sort((a, b) => a.startTime - b.startTime).slice(0, 3) });
    }).catch((error) => { logClientError("HomeTodayStrip.events", error); if (!cancelled) setState({ uid: user.uid, events: [], failed: true }); });
    return () => { cancelled = true; };
  }, [user]);
  const current = state?.uid === user?.uid ? state : null;
  if (!user || user.isAnonymous || compact && current && !current.failed && !current.events.length) return null;
  if (compact && !current) return <Text as="p" variant="caption" tone="tertiary" role="status">{t("todayStrip.events")} · {t("todayStrip.loading")}</Text>;
  return <Card padding={compact ? "compact" : "card"} data-testid="H2-4-1" data-home-slot="events" className="flex flex-col gap-3" header={<div className="flex items-center justify-between gap-2" style={{ width: "100%" }}><Text as="h2" variant="subtitle">{t("todayStrip.events")}</Text>{current?.failed && <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} to="/explore/events">{t("todayStrip.findEvents")}</LocalizedLink>}</div>}>
    {!current ? <Text variant="bodySmall">{t("todayStrip.loading")}</Text> : current.failed ? <Text as="p" variant="bodySmall" role="alert">{t("todayStrip.unavailable")}</Text> : current.events.length ? current.events.map((event) => <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} key={event.eventId} to={`/event/${event.eventId}`}><Text variant="bodySmall">{event.name} · {new Date(event.startTime).toLocaleDateString(i18n.language)}</Text></LocalizedLink>) : <Text variant="bodySmall" tone="tertiary">{t("todayStrip.noEvents")}</Text>}
  </Card>;
}
