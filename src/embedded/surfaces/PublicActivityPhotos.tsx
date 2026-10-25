import { NativeActivityPhotoImage } from "../../components/activity/NativeActivityPhotoImage";
import { isNativePhotoReference, isLegacyActivityPhotoUrl } from "../../services/nativeActivityPhoto";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Stack, Text } from "../../theme/components";
import { isPublicActivityAccessError, type PublicActivityDetail, type createPublicActivityClient } from "../../services/publicActivityDetail";

type Photos = NonNullable<PublicActivityDetail["content"]["photos"]>;
export default function PublicActivityPhotos({ activityId, initialPhotos, truncated, client, onAccessRevoked }: {
  activityId: string; initialPhotos: Photos; truncated: boolean;
  client: ReturnType<typeof createPublicActivityClient>; onAccessRevoked: () => void;
}) {
  const { t } = useTranslation("activity");
  const [photos, setPhotos] = useState(initialPhotos);
  const [expanded, setExpanded] = useState(false);
  const [remaining, setRemaining] = useState(truncated);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    generation.current += 1; inFlight.current = false;
    setPhotos(initialPhotos); setExpanded(false); setRemaining(truncated); setBusy(false); setFailed(false);
    return () => { generation.current += 1; };
  }, [activityId, initialPhotos, truncated, client]);
  async function expand() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setFailed(false);
    const request = generation.current;
    try {
      const result = await client.photos(activityId);
      if (request !== generation.current) return;
      setPhotos(result.photos); setExpanded(true); setRemaining(result.truncated);
    } catch (reason) {
      if (request !== generation.current) return;
      if (isPublicActivityAccessError(reason)) onAccessRevoked();
      else setFailed(true);
    } finally { if (request === generation.current) { inFlight.current = false; setBusy(false); } }
  }
  return <Stack gap="var(--space-3)">
    {photos.filter(photo => isNativePhotoReference(photo.nativePhoto) || (/^https:\/\//i.test(photo.url) && !isLegacyActivityPhotoUrl(photo.url))).map(photo => photo.nativePhoto ? <NativeActivityPhotoImage key={photo.id} nativePhoto={photo.nativePhoto} retryable onAccessRevoked={onAccessRevoked} alt={photo.caption || t("page.photoPreview")} loading="lazy" className="public-activity-photo" /> : <img key={photo.id} src={photo.url} alt={photo.caption || t("page.photoPreview")} loading="lazy" className="public-activity-photo" />)}
    {remaining && <Text variant="caption">{t("publicDetail.photoPreview")}</Text>}
    {failed && <Text role="alert">{t("publicDetail.photosFailed")}</Text>}
    {truncated && (!expanded || failed) && <Button variant="outline" loading={busy} disabled={busy} onClick={() => void expand()}>{t("publicDetail.morePhotos")}</Button>}
  </Stack>;
}
