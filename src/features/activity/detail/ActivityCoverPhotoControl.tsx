import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { loadNativeActivityCover, setNativeActivityCover, type NativeActivityCover } from "../../../services/nativeActivityPhoto";
import { Button, Stack, Text } from "../../../theme/components";

/** Mounted only for an authenticated native activity owner and keyed by viewer/activity. */
export function ActivityCoverPhotoControl({ activityId, photoId }: { activityId: string; photoId: string }) {
  const services = useFirebaseServices();
  const { t } = useTranslation("activity");
  const [cover, setCover] = useState<NativeActivityCover | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true; alive.current = true;
    setCover(null); setBusy(true); setFailed(false); setSaved(false);
    void loadNativeActivityCover(services, activityId).then(value => { if (active) setCover(value); })
      .catch(() => { if (active) setFailed(true); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; alive.current = false; };
  }, [services, activityId, attempt]);
  const save = async () => {
    if (!cover || busy || pending.current) return;
    pending.current = true; setBusy(true); setFailed(false); setSaved(false);
    try {
      const result = await setNativeActivityCover(services, activityId, cover.photoId === photoId ? null : photoId, cover.coverRevision);
      if (alive.current) { setCover(result); setSaved(true); }
    } catch {
      // Refresh the CAS revision before retrying; never silently overwrite another editor.
      if (alive.current) { setCover(null); setFailed(true); }
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  return <Stack gap="var(--space-2)">
    {cover?.photoId === photoId && <Text variant="caption">{t("coverPhoto.current")}</Text>}
    <Button variant="outline" loading={busy} disabled={!cover || busy} aria-pressed={cover?.photoId === photoId} onClick={() => void save()}>
      {t(cover?.photoId === photoId ? "coverPhoto.clear" : "coverPhoto.select")}
    </Button>
    {failed && <><Text role="alert">{t("coverPhoto.failed")}</Text><Button variant="ghost" onClick={() => setAttempt(value => value + 1)}>{t("page.retry")}</Button></>}
    {saved && <Text role="status">{t("coverPhoto.saved")}</Text>}
  </Stack>;
}
