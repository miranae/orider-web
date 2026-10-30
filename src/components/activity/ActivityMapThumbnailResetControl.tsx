import { useState } from "react";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady, functions } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { Button, Card, Stack, Text } from "../../theme/components";
import { invokeMapThumbnailCoordinatorWithRetry } from "./ActivityRouteThumbnail";

/**
 * 주인 전용: 지도 썸네일 지우기. 썸네일은 활동을 볼 수 있는 누구나 처음 캡처해 올리므로,
 * 잘못된 이미지는 주인이 지우고 다음 뷰어가 다시 캡처한다.
 */
export default function ActivityMapThumbnailResetControl({ activityId }: { activityId: string }) {
  const { t } = useTranslation("activity");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"done" | "failed" | null>(null);
  async function reset() {
    setBusy(true); setResult(null);
    try {
      await invokeMapThumbnailCoordinatorWithRetry(async forceRefresh => {
        await ensureAppCheckReady(forceRefresh);
        return (await httpsCallable<{ activityId: string }, { activityId: string; reset: true }>(functions, "resetActivityMapThumbnail")({ activityId })).data;
      });
      setResult("done");
    } catch (error) {
      logClientError("ActivityMapThumbnailResetControl.reset", error, { activityId });
      setResult("failed");
    } finally { setBusy(false); setConfirming(false); }
  }
  return <Card><Stack gap="var(--space-2)">
    <Text variant="bodySmall">{t("mapThumbnail.explanation")}</Text>
    {confirming ? <>
      <Text role="alert">{t("mapThumbnail.confirm")}</Text>
      <Stack direction="row" wrap gap="var(--space-2)">
        <Button variant="secondary" loading={busy} disabled={busy} onClick={() => void reset()}>{t("mapThumbnail.reset")}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>{t("kudosCard.cancel")}</Button>
      </Stack>
    </> : <Button variant="outline" onClick={() => { setResult(null); setConfirming(true); }}>{t("mapThumbnail.reset")}</Button>}
    {result && <Text role="status">{t(`mapThumbnail.${result}`)}</Text>}
  </Stack></Card>;
}
