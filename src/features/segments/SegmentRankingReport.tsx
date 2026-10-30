import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { reportSegmentRankingEligibility, SEGMENT_REPORT_REASONS, type SegmentReportReason, type SegmentReportResult } from "../../services/segmentLeaderboard";
import { Button, Select, Stack, Text } from "../../theme/components";

export default function SegmentRankingReport({ activityId, segmentId }: { activityId: string; segmentId: string }) {
  const { t } = useTranslation("segment"), { user } = useAuth(), services = useFirebaseServices();
  const sdk = services.auth.currentUser;
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const [reason, setReason] = useState<SegmentReportReason>("gps_anomaly");
  const [result, setResult] = useState<SegmentReportResult | null>(null);
  const generation = useRef(0), request = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLButtonElement>(null), select = useRef<HTMLSelectElement>(null);
  const cancel = useCallback(() => { generation.current++; request.current?.abort(); request.current = null; setOpen(false); setBusy(false); setFailed(false); setResult(null); }, []);
  useEffect(() => {
    cancel();
    const unsubscribe = onAuthStateChanged(services.auth, () => { if (services.auth.currentUser !== sdk) cancel(); });
    return () => { unsubscribe(); generation.current++; request.current?.abort(); };
  }, [activityId, segmentId, user, sdk, services, cancel]);
  useEffect(() => { if (open) select.current?.focus(); }, [open]);
  async function submit() {
    if (busy || request.current || !user || user.isAnonymous || !sdk || sdk.uid !== user.uid || services.auth.currentUser !== sdk) return;
    const own = ++generation.current, controller = new AbortController(); request.current = controller;
    setBusy(true); setFailed(false); setResult(null);
    try {
      const value = await reportSegmentRankingEligibility(services, user.uid, { activityId, segmentId, reason }, controller.signal);
      if (generation.current === own && services.auth.currentUser === sdk) { setResult(value); setOpen(false); trigger.current?.focus(); }
    } catch { if (generation.current === own && services.auth.currentUser === sdk) setFailed(true); }
    finally { if (generation.current === own) { setBusy(false); request.current = null; } }
  }
  return <Stack gap="var(--space-2)">
    <Button ref={trigger} variant="ghost" size="sm" aria-expanded={open} onClick={() => { setResult(null); setOpen(true); }}>{t("rankingReport.open")}</Button>
    {open && <form onSubmit={event => { event.preventDefault(); void submit(); }}><Stack gap="var(--space-2)">
      <Text>{t("rankingReport.explanation")}</Text>
      <label>{t("rankingReport.reason")}<Select ref={select} value={reason} disabled={busy} onChange={event => setReason(event.target.value as SegmentReportReason)}>{SEGMENT_REPORT_REASONS.map(value => <option key={value} value={value}>{t(`rankingReport.reasons.${value}`)}</option>)}</Select></label>
      <Stack direction="row" wrap gap="var(--space-2)"><Button type="submit" loading={busy} disabled={busy}>{t("rankingReport.submit")}</Button><Button type="button" variant="outline" onClick={() => { cancel(); trigger.current?.focus(); }}>{t("rankingReport.cancel")}</Button></Stack>
      {failed && <Text role="alert">{t("rankingReport.error")}</Text>}
    </Stack></form>}
    {result && <Text role="status">{t(`rankingReport.status.${result.status}`)}</Text>}
  </Stack>;
}
