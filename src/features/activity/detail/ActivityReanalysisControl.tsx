import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { createActivityReanalysisClient, type SavedActivityAnalysis, type ActivityAnalysisHistory, type ActivityReanalysisState } from "../../../services/activityReanalysis";
import { Button, Stack, Text } from "../../../theme/components";
import { logClientError } from "../../../services/errorLogger";

/** This control never edits or clears displayed metrics; publication remains server-owned. */
export function ActivityReanalysisControl({ activityId, selectedRevision, onSelect, canReanalyze = true, onAccessRevoked }: { canReanalyze?: boolean; onAccessRevoked?: () => void; activityId: string; selectedRevision?: string; onSelect: (value: SavedActivityAnalysis | null) => void }) {
  const services = useFirebaseServices(), viewer = services.auth.currentUser;
  const client = useMemo(() => createActivityReanalysisClient(services), [services, viewer]);
  const identity = useMemo(() => ({ client, activityId }), [client, activityId]);
  const scope = useRef({ identity, generation: 0 });
  if (scope.current.identity !== identity) scope.current = { identity, generation: scope.current.generation + 1 };
  return <ReanalysisSession key={scope.current.generation} activityId={activityId} client={client} selectedRevision={selectedRevision} onSelect={onSelect} canReanalyze={canReanalyze && !!viewer && !viewer.isAnonymous} onAccessRevoked={onAccessRevoked} />;
}
function ReanalysisSession({ activityId, client, selectedRevision, onSelect, canReanalyze, onAccessRevoked }: { canReanalyze: boolean; onAccessRevoked?: () => void; activityId: string; client: ReturnType<typeof createActivityReanalysisClient>; selectedRevision?: string; onSelect: (value: SavedActivityAnalysis | null) => void }) {
  const [stored, setStored] = useState<{ client: typeof client; activityId: string; data: ActivityReanalysisState } | null>(null);
  const [history, setHistory] = useState<ActivityAnalysisHistory | null>(null);
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState<"request" | "history" | null>(null);
  const [result, setResult] = useState<"queued" | "completed" | null>(null);
  const generation = useRef(0), pending = useRef(false);
  const request = useRef<{ id: string; revision: string | null } | null>(null);
  const { t } = useTranslation("activity");
  const state = stored?.client === client && stored.activityId === activityId ? stored.data : null;
  useEffect(() => {
    generation.current++; pending.current = false; request.current = null;
    setStored(null); setBusy(false); setFailed(null); setResult(null);
    return () => { generation.current++; };
  }, [client, activityId]);
  const load = async () => {
    if (!canReanalyze || pending.current) return;
    const token = generation.current; pending.current = true; setBusy(true); setFailed(null);
    try {
      const data = await client.load(activityId, request.current?.id);
      if (token !== generation.current) return;
      setStored({ client, activityId, data }); setResult(data.lastRequest?.status === "completed" ? "completed" : data.pending ? "queued" : null);
      if (data.lastRequest?.status === "completed") request.current = null;
      if (data.lastRequest?.status === "failed" || data.lastRequest?.status === "superseded") { request.current = null; setFailed("request"); }
    } catch (error) {
      if (token === generation.current) { setFailed("request"); logClientError("ActivityReanalysisControl.load", error, { activityId }); }
    }
    finally { if (token === generation.current) { pending.current = false; setBusy(false); } }
  };
  const submit = async () => {
    if (!canReanalyze || !state?.canReanalyze || state.pending || pending.current) return;
    const token = generation.current; pending.current = true; setBusy(true); setFailed(null);
    request.current ??= { id: crypto.randomUUID(), revision: state.metricsRevision };
    try {
      const response = await client.request(activityId, request.current.id, request.current.revision);
      if (token === generation.current) { setResult(response.status); setStored(current => current ? { ...current, data: { ...current.data, canReanalyze: false, pending: response.status === "queued" } } : null); }
    } catch (error) {
      if (token === generation.current) { setFailed("request"); logClientError("ActivityReanalysisControl.request", error, { activityId }); }
    }
    finally { if (token === generation.current) { pending.current = false; setBusy(false); } }
  };
  const readHistory = async (revisionId?: string, cursor?: string) => {
    if (pending.current) return;
    const token = generation.current; pending.current = true; setBusy(true); setFailed(null);
    try {
      const data = await client.history(activityId, revisionId, cursor);
      if (token !== generation.current) return;
      if (revisionId) { if (!data.selected) throw Error("missing_saved_analysis"); onSelect(data.selected); }
      else setHistory(previous => ({ ...data, items: cursor ? [...(previous?.items ?? []), ...data.items] : data.items }));
    } catch (error) {
      if (token === generation.current) {
        setFailed("history");
        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).replace(/^functions\//, "") : "";
        logClientError("ActivityReanalysisControl.history", error, { activityId, revisionId: revisionId ?? null, paged: !!cursor });
        if (["permission-denied", "unauthenticated", "not-found", "failed-precondition"].includes(code)) { setHistory(null); onSelect(null); onAccessRevoked?.(); }
      }
    }
    finally { if (token === generation.current) { pending.current = false; setBusy(false); } }
  };
  return <section aria-label={t("reanalysis.title")}>
    <Stack gap="sm">
      <Text as="p" variant="bodySmall" tone="secondary">{t("reanalysis.keepSaved")}</Text>
      {state && <Text as="p" variant="bodySmall">{t("reanalysis.versions", { saved: state.calculatorVersion ?? "—", latest: state.latestCalculatorVersion })}</Text>}
      {result && <Text as="p" role="status" variant="bodySmall">{t(`reanalysis.${result}`)}</Text>}
      {failed && <Text as="p" role="alert" variant="bodySmall">{t(failed === "history" ? "reanalysis.historyFailed" : "reanalysis.failed")}</Text>}
      {selectedRevision && <Text as="p" role="status" variant="bodySmall">{t("reanalysis.viewingSaved")}</Text>}
      <Stack direction="row" gap="sm">
        {canReanalyze && <Button variant="ghost" disabled={busy} onClick={() => { void load(); }}>{t("reanalysis.check")}</Button>}
        {canReanalyze && state?.canReanalyze && !state.pending && <Button variant="outline" disabled={busy} onClick={() => { void submit(); }}>{t("reanalysis.start")}</Button>}
        <Button variant="ghost" disabled={busy} onClick={() => { void readHistory(); }}>{t("reanalysis.history")}</Button>
        {selectedRevision && <Button variant="ghost" disabled={busy} onClick={() => onSelect(null)}>{t("reanalysis.current")}</Button>}
      </Stack>
      {history?.items.map(row => <Button key={row.revisionId} variant="outline" disabled={busy} onClick={() => { void readHistory(row.revisionId); }}>{t("reanalysis.savedVersion", { version: row.calculatorVersion ?? "—", time: row.calculatedAt === null ? "—" : new Date(row.calculatedAt).toLocaleString() })}</Button>)}
      {history && history.items.length === 0 && <Text variant="bodySmall">{t("reanalysis.noHistory")}</Text>}
      {history?.nextCursor && <Button variant="ghost" disabled={busy} onClick={() => { void readHistory(undefined, history.nextCursor!); }}>{t("reanalysis.more")}</Button>}
    </Stack>
  </section>;
}
