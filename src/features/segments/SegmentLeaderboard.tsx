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
  const [state, setState] = useState<{ key: string; result: SegmentLeaderboardResponse | null; loading: boolean; error: boolean } | null>(null);
  const key = JSON.stringify([segmentId, user?.uid, scope, clubId, from, to]);
  const epoch = useMemo(() => ({}), [key, services]);
  const current = useRef(epoch); current.current = epoch;
  const busy = useRef(false);
  useEffect(() => { current.current = epoch; busy.current = false; return () => { current.current = {}; }; }, [epoch]);
  const view = state?.key === key ? state : null;
  const fromMs = Date.parse(`${from}T00:00:00+09:00`);
  const toMs = Date.parse(`${to}T23:59:59.999+09:00`);
  const valid = Number.isFinite(fromMs) && Number.isFinite(toMs) && fromMs <= toMs && to <= date(Date.now()) && (scope !== "club" || !!clubId);
  async function load(cursor?: string) {
    if (!user || user.isAnonymous || !valid || busy.current) return;
    const token = epoch;
    busy.current = true;
    // Clear old records before revalidation; never retain a page after a denied refresh.
    setState({ key, result: null, loading: true, error: false });
    try {
      const result = await loadSegmentLeaderboard(services, user.uid, { segmentId, fromMs, toMs, scope, ...(scope === "club" ? { clubId } : {}), ...(cursor ? { cursor } : {}) });
      if (current.current === token) setState({ key, result, loading: false, error: false });
    } catch { if (current.current === token) setState({ key, result: null, loading: false, error: true }); }
    finally { if (current.current === token) busy.current = false; }
  }
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
      </Stack>)}
      {view.result.nextCursor && <Button variant="outline" onClick={() => void load(view.result!.nextCursor!)}>{t("nativeBoard.next")}</Button>}
      {!view.result.nextCursor && <Text>{t(view.result.limitReached ? "nativeBoard.limit" : "nativeBoard.end")}</Text>}
    </>}
  </Stack></Card>;
}
