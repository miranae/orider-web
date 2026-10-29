import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { useMyGroups } from "../../hooks/useGroup";
import { loadSegmentLeaderboard } from "../../services/segmentLeaderboard";
import type { SegmentLeaderboardRequest, SegmentLeaderboardResponse } from "@shared/types/segment-leaderboard";
import { Button, Card, Input, Select, Stack, Text } from "../../theme/components";
import { LocalizedLink } from "../../components/LocalizedLink";
import { formatElapsedMillis } from "../leaderboard/leaderboardFormat";
import SegmentRankingReport from "./SegmentRankingReport";
const visible = () => document.visibilityState !== "hidden";
const date = (value: number) => new Date(value + 9 * 3600000).toISOString().slice(0, 10);
export default function SegmentLeaderboard({ segmentId }: { segmentId: string }) {
  const { t } = useTranslation("segment");
  const { user } = useAuth();
  const services = useFirebaseServices();
  const { groups, error: groupError, retry } = useMyGroups(user?.uid);
  const [scope, setScope] = useState<SegmentLeaderboardRequest["scope"]>("all");
  const [clubId, setClubId] = useState("");
  const [from, setFrom] = useState(() => date(Date.now() - 30 * 86400000));
  const [to, setTo] = useState(() => date(Date.now()));
  const [state, setState] = useState<{ token: object; key: string; result: SegmentLeaderboardResponse | null; loading: boolean; error: boolean } | null>(null);
  const key = JSON.stringify([segmentId, user?.uid, scope, clubId, from, to]);
  const sdk = services.auth.currentUser;
  const epoch = useMemo(() => ({}), [key, services, user, sdk, services.auth, services.auth.app, services.functions, services.functions.app]);
  const current = useRef(epoch); current.current = epoch;
  const request = useRef<{ token: object; controller: AbortController } | null>(null);
  const selection = useRef<{ epoch: object; cursor?: string } | null>(null);
  const pending = useRef(false);
  const lastFocus = useRef(0);
  const reload = useRef<() => void>(() => {});
  const view = state?.key === key && state.token === epoch && visible() ? state : null;
  const fromMs = Date.parse(`${from}T00:00:00+09:00`);
  const toMs = Date.parse(`${to}T23:59:59.999+09:00`);
  const valid = Number.isFinite(fromMs) && Number.isFinite(toMs) && fromMs <= toMs && to <= date(Date.now()) && (scope !== "club" || !!clubId);
  useEffect(() => {
    current.current = epoch; selection.current = null; pending.current = false; lastFocus.current = 0; setState(null);
    const clear = () => {
      current.current = {}; selection.current = null; pending.current = false;
      request.current?.controller.abort(); setState(null);
    };
    const unsubscribe = onAuthStateChanged(services.auth, () => { if (services.auth.currentUser !== sdk) clear(); });
    return () => { unsubscribe(); clear(); };
  }, [epoch, services, sdk]);
  async function load(cursor?: string) {
    if (!user || user.isAnonymous || !sdk || sdk.uid !== user.uid || services.auth.currentUser !== sdk || !valid || request.current || !visible()) return;
    const token = epoch, controller = new AbortController(), attempt = { token, controller };
    request.current = attempt; selection.current = { epoch, cursor }; pending.current = false;
    setState({ token, key, result: null, loading: true, error: false });
    const fresh = () => current.current === token && services.auth.currentUser === sdk && !controller.signal.aborted && visible();
    try {
      const result = await loadSegmentLeaderboard(services, user.uid, { segmentId, fromMs, toMs, scope, ...(scope === "club" ? { clubId } : {}), ...(cursor ? { cursor } : {}) }, controller.signal);
      if (fresh()) setState({ token, key, result, loading: false, error: false });
    } catch { if (fresh()) { selection.current = null; setState({ token, key, result: null, loading: false, error: true }); } }
    finally {
      if (request.current === attempt) request.current = null;
      if (pending.current && current.current === token && visible()) { pending.current = false; reload.current(); }
    }
  }
  reload.current = () => {
    const active = selection.current;
    if (!active || active.epoch !== epoch || !visible()) return;
    setState(null);
    if (request.current) { pending.current = true; return; }
    void load(active.cursor);
  };
  useEffect(() => {
    const recheck = () => { const now = Date.now(); if (now - lastFocus.current < 500 || request.current && !request.current.controller.signal.aborted) return; lastFocus.current = now; reload.current(); };
    const visibility = () => {
      if (!visible()) { lastFocus.current = 0; setState(null); request.current?.controller.abort(); }
      else recheck();
    };
    window.addEventListener("focus", recheck); document.addEventListener("visibilitychange", visibility);
    const timer = state?.result ? setTimeout(() => reload.current(), 30000) : undefined;
    return () => { window.removeEventListener("focus", recheck); document.removeEventListener("visibilitychange", visibility); clearTimeout(timer); };
  }, [epoch, state?.result]);
  return <Card><Stack gap="var(--space-3)">
    <Text as="h2" variant="title">{t("nativeBoard.title")}</Text>
    <Text as="p">{t("nativeBoard.intro")}</Text>
    <details><summary>{t("nativeBoard.criteria")}</summary><Text as="p">{t("nativeBoard.policy")}</Text></details>
    <label>{t("nativeBoard.scope")}<Select value={scope} onChange={e => setScope(e.target.value as typeof scope)}>
      <option value="all">{t("nativeBoard.all")}</option><option value="following">{t("nativeBoard.following")}</option><option value="club">{t("nativeBoard.club")}</option>
    </Select></label>
    {scope === "club" && <><label>{t("nativeBoard.club")}<Select value={clubId} onChange={e => setClubId(e.target.value)}><option value="">{t("nativeBoard.chooseClub")}</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></label>{!!groupError && <Button onClick={retry}>{t("nativeBoard.retryClubs")}</Button>}</>}
    <fieldset><legend>{t("nativeBoard.period")}</legend><Stack direction="row" wrap gap="var(--space-3)">
      <label>{t("nativeBoard.from")}<Input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label>
      <label>{t("nativeBoard.to")}<Input type="date" value={to} min={from} max={date(Date.now())} onChange={e => setTo(e.target.value)} /></label>
    </Stack></fieldset>
    {!user || user.isAnonymous ? <Text role="status">{t("empty.loginRequired")}</Text> : <Button disabled={!valid || view?.loading} loading={view?.loading} onClick={() => void load()}>{t("nativeBoard.load")}</Button>}
    {view?.error && <Text role="alert">{t("nativeBoard.error")}</Text>}
    {view?.result && <>
      <Text role="status">{t("nativeBoard.coverage", { count: view.result.entries.length })}{view.result.scopeMemberCount !== null && <> · {t("nativeBoard.members", { count: view.result.scopeMemberCount })}</>}</Text>
      {view.result.entries.map(e => <Stack key={e.id} gap="var(--space-1)">
        <LocalizedLink to={`/activity/${e.activityId}`}>{e.nickname || t("nativeBoard.rider")} · {formatElapsedMillis(e.elapsedTime)}</LocalizedLink>
        <Text variant="caption">{e.averageSpeed.toFixed(1)} km/h · {new Date(e.startDate).toLocaleDateString(undefined, { timeZone: "Asia/Seoul" })}</Text>
        <SegmentRankingReport activityId={e.activityId} segmentId={segmentId} />
      </Stack>)}
      {view.result.nextCursor && <Button variant="outline" onClick={() => void load(view.result!.nextCursor!)}>{t("nativeBoard.next")}</Button>}
      {!view.result.nextCursor && <Text>{t(view.result.limitReached ? "nativeBoard.limit" : "nativeBoard.end")}</Text>}
    </>}
  </Stack></Card>;
}
