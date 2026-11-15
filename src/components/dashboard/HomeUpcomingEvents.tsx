import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";
import { functions, ensureAppCheckReady } from "../../services/firebase";
import { useAuth } from "../../contexts/AuthContext";
import { LocalizedLink } from "../LocalizedLink";
import { Card, Text, buttonClass } from "../../theme/components";
import { logClientError } from "../../services/errorLogger";
import { Resolvable } from "../redesign/states/Resolvable";

interface RegisteredEvent { eventId: string; name: string; startTime: number }
export default function HomeUpcomingEvents({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { t, i18n } = useTranslation("dashboard");
  const [state, setState] = useState<{ uid: string; events: RegisteredEvent[]; failed?: boolean } | null>(null);
  // 「잠시 불러올 수 없어요」를 누르면 다시 읽는다. 읽는 동안은 불러오는 중으로 바뀌어 거듭 누를 수 없다.
  const [attempt, setAttempt] = useState(0);
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
  }, [user, attempt]);
  const current = state?.uid === user?.uid ? state : null;
  if (!user || user.isAnonymous || compact && current && !current.failed && !current.events.length) return null;
  if (compact && !current) return <Text as="p" variant="caption" tone="tertiary" role="status">{t("todayStrip.events")} · {t("todayStrip.loading")}</Text>;
  return <Card padding={compact ? "compact" : "card"} data-testid="H2-4-1" data-home-slot="events" className="flex flex-col gap-3" header={<div className="home-today-header"><Text as="h2" variant="subtitle">{t("todayStrip.events")}</Text>{current?.failed && <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} to="/explore/events">{t("todayStrip.findEvents")}</LocalizedLink>}</div>}>
    {!current ? <Text variant="bodySmall">{t("todayStrip.loading")}</Text> : current.failed ? <Text as="p" variant="bodySmall" role="alert"><Resolvable resolve={{ onClick: () => { setState(null); setAttempt(value => value + 1); } }}>{t("todayStrip.unavailable")}</Resolvable></Text> : current.events.length ? current.events.map((event) => <LocalizedLink className={buttonClass({ variant: "ghost", size: "sm" })} key={event.eventId} to={`/event/${event.eventId}`}><Text variant="bodySmall">{event.name} · {new Date(event.startTime).toLocaleDateString(i18n.language)}</Text></LocalizedLink>) : <Text variant="bodySmall" tone="tertiary">{t("todayStrip.noEvents")}</Text>}
  </Card>;
}
