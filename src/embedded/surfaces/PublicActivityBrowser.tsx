import ActivitySubscriptionButton from "../../components/profile/ActivitySubscriptionButton";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useTranslation } from "react-i18next";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { loadActivityDiscovery, type DiscoveryActivity } from "../../services/activityDiscovery";
import { Button, Section, Stack, Text } from "../../theme/components";
import Avatar from "../../components/Avatar";
import PublicActivitySurface from "./PublicActivitySurface";

type Props = React.ComponentProps<typeof PublicActivitySurface>;
type Destination = { kind: "activity"; id: string } | { kind: "profile"; id: string };

/** Public-only navigation within the authorized account; never mounts owner profile tools. */
export default function PublicActivityBrowser(props: Props) {
  const services = useFirebaseServices();
  const viewer = services.auth.currentUser;
  const { t } = useTranslation("activity");
  const [history, setHistory] = useState<Destination[]>([]);
  const visitedChild = useRef(false);
  const [unsupported, setUnsupported] = useState(false);
  const [generation, setGeneration] = useState(0);
  const identity = useRef({ services, viewer, activityId: props.activityId });
  const current = identity.current.services === services && identity.current.viewer === viewer && identity.current.activityId === props.activityId;
  useEffect(() => {
    identity.current = { services, viewer, activityId: props.activityId };
    setHistory([]); setUnsupported(false);
    return onAuthStateChanged(services.auth, () => {
      if (services.auth.currentUser !== viewer) { setHistory([]); setUnsupported(false); setGeneration(n => n + 1); }
    });
  }, [services, viewer, props.activityId]);
  const destination = current ? history[history.length - 1] : undefined;
  const navigate = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    event.preventDefault(); event.stopPropagation();
    const url = new URL(anchor.href, window.location.href);
    const match = url.origin === window.location.origin && !url.search && !url.hash
      ? /^\/(?:ko|en)\/(athlete|activity)\/([A-Za-z0-9_-]{1,200})$/.exec(url.pathname) : null;
    if (!match || !match[2]) { setUnsupported(true); return; }
    setUnsupported(false);
    visitedChild.current = true;
    const id = match[2];
    setHistory(items => [...items, { kind: match[1] === "athlete" ? "profile" : "activity", id }]);
  };
  return <div data-embedded-public-browser onClickCapture={navigate}>
    <Stack gap="var(--dim-section-gap)">
      {!!destination && <Button variant="secondary" onClick={() => { setHistory(items => items.slice(0, -1)); setUnsupported(false); }}>{t("embeddedProfile.back")}</Button>}
      {unsupported && <Text role="status">{t("embeddedProfile.unsupported")}</Text>}
      {destination?.kind === "profile" ? <PublicProfile key={`${destination.id}:${generation}`} userId={destination.id}
        onActivity={id => setHistory(items => [...items, { kind: "activity", id }])} />
        : <PublicActivitySurface {...props} key={`${destination?.id ?? props.activityId}:${generation}`}
          onReady={visitedChild.current ? () => {} : props.onReady} onError={visitedChild.current ? () => {} : props.onError}
          initialDetail={destination || visitedChild.current ? undefined : props.initialDetail} activityId={destination?.id ?? props.activityId} />}
    </Stack>
  </div>;
}

function PublicProfile({ userId, onActivity }: { userId: string; onActivity: (id: string) => void }) {
  const services = useFirebaseServices();
  const viewer = services.auth.currentUser;
  const { t } = useTranslation("activity");
  const epoch = useRef(0);
  const [rows, setRows] = useState<DiscoveryActivity[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const scope = useRef({ services, viewer, userId });
  const valid = scope.current.services === services && scope.current.viewer === viewer && scope.current.userId === userId;
  const load = async (next?: string) => {
    const request = ++epoch.current;
    setBusy(true); setFailed(false);
    try {
      const page = await loadActivityDiscovery(services, { scope: "athlete", targetUid: userId, limit: 20, ...(next ? { cursor: next } : {}) });
      if (request !== epoch.current || services.auth.currentUser !== viewer || document.hidden) return;
      setRows(previous => next ? [...new Map([...previous, ...page.items].map(row => [row.id, row])).values()] : page.items);
      setCursor(page.nextCursor);
    } catch {
      if (request !== epoch.current) return;
      setRows([]); setCursor(null); setFailed(true);
    } finally { if (request === epoch.current) setBusy(false); }
  };
  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => {
    scope.current = { services, viewer, userId };
    setRows([]); setCursor(null);
    void loadRef.current();
    const clear = () => { epoch.current++; setRows([]); setCursor(null); };
    const visibility = () => { clear(); if (!document.hidden) void loadRef.current(); };
    const off = onAuthStateChanged(services.auth, () => { if (services.auth.currentUser !== viewer) clear(); });
    const timer = window.setInterval(() => { if (!document.hidden) { clear(); void loadRef.current(); } }, 30000);
    document.addEventListener("visibilitychange", visibility);
    return () => { clear(); off(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [services, viewer, userId]);
  const visible = valid ? rows : [];
  const author = visible[0];
  return <Section title={t("embeddedProfile.title")}><Stack gap="var(--dim-section-gap)">
    {author && <><Avatar name={author.nickname?.trim() || t("embeddedProfile.rider")} imageUrl={author.profileImage} /><Text weight={600}>{author.nickname?.trim() || t("embeddedProfile.rider")}</Text></>}
    <Text>{t("embeddedProfile.scope")}</Text>
    <ActivitySubscriptionButton targetUid={userId} services={services} />
    {busy && <Text role="status">{t("embeddedProfile.loading")}</Text>}
    {failed && <Text role="alert">{t("embeddedProfile.unavailable")}</Text>}
    {!busy && !failed && !visible.length && <Text>{t("embeddedProfile.empty")}</Text>}
    {visible.map(row => <Button key={row.id} variant="secondary" onClick={() => onActivity(row.id)}>{row.description || t("publicDetail.title")}</Button>)}
    {cursor && <Button disabled={busy} onClick={() => void loadRef.current(cursor)}>{t("embeddedProfile.more")}</Button>}
  </Stack></Section>;
}
