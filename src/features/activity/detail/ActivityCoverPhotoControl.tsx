import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import { loadNativeActivityCover, setNativeActivityCover, type NativeActivityCover } from "../../../services/nativeActivityPhoto";
import { RefreshCw, Star } from "lucide-react";
import { IconButton, Text } from "../../../theme/components";
import { ICON_SIZE } from "../../../theme/tokens/icon";

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
  const selected = cover?.photoId === photoId;
  // 사진 보기 아이콘 줄(지도 위치·삭제·숨기기)에 들어가는 별 버튼 — 선택되면 채운 별, 상태는 aria-pressed·title 로.
  return <>
    <IconButton variant="ghost" loading={busy} disabled={!cover || busy} aria-pressed={selected}
      icon={<Star size={ICON_SIZE.md} fill={selected ? "currentColor" : "none"} />}
      aria-label={t(selected ? "coverPhoto.clear" : "coverPhoto.select")} title={t(selected ? "coverPhoto.current" : "coverPhoto.select")} onClick={() => void save()} />
    {failed && <><Text as="p" role="alert" variant="bodySmall" className="activity-cover-photo-message">{t("coverPhoto.failed")}</Text>
      <IconButton variant="ghost" size="sm" icon={<RefreshCw size={ICON_SIZE.sm} />} aria-label={t("page.retry")} title={t("page.retry")} onClick={() => setAttempt(value => value + 1)} /></>}
    {saved && <Text as="p" role="status" variant="bodySmall" className="activity-cover-photo-message">{t("coverPhoto.saved")}</Text>}
  </>;
}
