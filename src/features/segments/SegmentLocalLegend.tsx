import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { loadSegmentLocalLegend } from "../../services/segmentLocalLegend";
import type { SegmentLocalLegend as Legend } from "@shared/types/segment-local-legend";
import { Button, Card, Stack, Text } from "../../theme/components";
export default function SegmentLocalLegend({ segmentId }: { segmentId: string }) {
  const { t } = useTranslation("segment");
  const { user } = useAuth();
  const services = useFirebaseServices();
  const [result, setResult] = useState<Legend | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const token = useRef(0);
  useEffect(() => { ++token.current; setResult(null); setLoading(false); setError(false); return () => { ++token.current; }; }, [segmentId, user?.uid, services]);
  async function load() {
    if (!user || user.isAnonymous || loading) return;
    const request = ++token.current;
    setLoading(true); setError(false); setResult(null);
    try { const response = await loadSegmentLocalLegend(services, user.uid, segmentId); if (request === token.current) setResult(response); }
    catch { if (request === token.current) setError(true); }
    finally { if (request === token.current) setLoading(false); }
  }
  return <Card><Stack gap="var(--space-3)">
    <Text as="h2" variant="title">{t("safeLegend.title")}</Text>
    <Text>{t("safeLegend.intro")}</Text>
    <details><summary>{t("nativeBoard.criteria")}</summary><Text as="p">{t("safeLegend.criteria")}</Text></details>
    {user && !user.isAnonymous ? <Button disabled={loading} loading={loading} onClick={() => void load()}>{t("safeLegend.load")}</Button> : <Text>{t("empty.loginRequired")}</Text>}
    {error && <Text role="alert">{t("safeLegend.error")}</Text>}
    {result && <>
      <Text role="status">{t(result.coverage === "partial" ? "safeLegend.partial" : "safeLegend.complete", { count: result.scannedCount, total: result.totalEfforts, riders: result.riderCount })}</Text>
      <Text variant="caption">{new Date(result.windowStartMs).toLocaleDateString(undefined, { timeZone: "Asia/Seoul" })} – {new Date(result.windowEndMs).toLocaleDateString(undefined, { timeZone: "Asia/Seoul" })}</Text>
      {result.leader ? <Text>{t("safeLegend.leader", { name: result.leader.nickname || t("nativeBoard.rider"), count: result.leader.effortCount })}</Text> : result.coverage === "complete" && <Text>{t("safeLegend.minimum")}</Text>}
    </>}
  </Stack></Card>;
}
