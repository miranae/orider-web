import { NativeActivityPhotoImage } from "../activity/NativeActivityPhotoImage";
import { useNativeActivityPhoto } from "../../hooks/useNativeActivityPhoto";
import { isNativePhotoReference, isLegacyActivityPhotoUrl, type NativePhotoReference } from "../../services/nativeActivityPhoto";
import { logClientError } from "../../services/errorLogger";
import { useFirebaseServices } from "../../contexts/FirebaseServicesContext";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Modal from "../Modal";
import { buttonClass, IconButton, Button, Text } from "../../theme/components";
import { LocalizedLink as Link } from "../LocalizedLink";
import { ICON_SIZE } from "../../theme/tokens/icon";

export interface AthletePhoto { id: string; url: string; caption: string | null; activityId: string; nativePhoto?: NativePhotoReference }
export function athletePhotoIdentity(photo: Pick<AthletePhoto, "url" | "nativePhoto">) {
  return isNativePhotoReference(photo.nativePhoto) ? JSON.stringify([photo.nativePhoto.activityId, photo.nativePhoto.photoId]) : photo.url;
}

function GalleryPhotoImage({ src, caption, thumbnail = false, native = false }: {
  src: string; caption: string | null; thumbnail?: boolean; native?: boolean;
}) {
  const { t } = useTranslation("athlete");
  const services = useFirebaseServices();
  const viewer = services.auth?.currentUser;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (failedUrl === src) return <Text as="span" variant="caption" role="status">{t("profile.mediaError")}</Text>;
  return <img
    src={src}
    alt={caption ?? ""}
    loading={thumbnail ? "lazy" : undefined}
    onError={() => {
      setFailedUrl(src);
      logClientError("AthletePhotoGallery.image", new Error(native ? "athlete-photo/image-decode-failed" : "athlete-photo/image-load-failed"),
        { placement: thumbnail ? "thumbnail" : "viewer" }, services, viewer);
    }}
  />;
}

export default function AthletePhotoGallery({ photos: inputPhotos, cover = false }: { photos: AthletePhoto[]; cover?: boolean }) {
  const { t } = useTranslation("athlete");
  const { t: activityT } = useTranslation("activity");
  const photos = inputPhotos.filter(photo => isNativePhotoReference(photo.nativePhoto) || (/^https:\/\//i.test(photo.url) && !isLegacyActivityPhotoUrl(photo.url)));
  const [selected, setSelected] = useState<string | null>(null);
  const index = photos.findIndex(photo => `${photo.activityId}-${photo.id}` === selected);
  const photo = photos[index];
  const nativePreview = useNativeActivityPhoto(photo?.nativePhoto);
  const move = (next: number) => { const item = photos[next]; if (item) setSelected(`${item.activityId}-${item.id}`); };
  useEffect(() => {
    if (!photo) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const next = photos[index + (event.key === "ArrowLeft" ? -1 : 1)];
      if (next) setSelected(`${next.activityId}-${next.id}`);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, photo, photos]);
  return <>
    <div className={cover ? `athlete-cover${photos.length ? ` athlete-cover--photos athlete-cover--${photos.length}` : ""}` : "athlete-photo-strip"} aria-label={t("profile.recentPhotos")}>
      {photos.map(item => <button key={`${item.activityId}-${item.id}`} className="athlete-photo-trigger" type="button" onClick={() => setSelected(`${item.activityId}-${item.id}`)} aria-label={t("profile.openPhoto")}>{item.nativePhoto ? <NativeActivityPhotoImage nativePhoto={item.nativePhoto} alt={item.caption ?? ""} loading="lazy" /> : <GalleryPhotoImage src={item.url} caption={item.caption} thumbnail />}</button>)}
      {!cover && !photos.length && <p>{t("profile.noPhotos")}</p>}
    </div>
    <Modal open={!!photo} onClose={() => setSelected(null)} title={t("profile.recentPhotos")} maxWidth="max-w-4xl">
      {photo && <div className="athlete-photo-viewer">
        {!photo.nativePhoto ? <GalleryPhotoImage key={photo.url} src={photo.url} caption={photo.caption} />
          : nativePreview.url ? <GalleryPhotoImage key={nativePreview.url} src={nativePreview.url} caption={photo.caption} native />
          : <Text role="status">{activityT(nativePreview.error ? "publicDetail.photosFailed" : "detail.loadingData")}</Text>}
        {photo.nativePhoto && nativePreview.error != null && <Button size="sm" onClick={nativePreview.retry}>{activityT("page.retry")}</Button>}
        {photo.caption && <p>{photo.caption}</p>}
        <div className="athlete-photo-viewer-controls">
          <IconButton variant="neutral" aria-label={t("profile.previousPhoto")} disabled={index === 0} icon={<ChevronLeft size={ICON_SIZE.md} />} onClick={() => move(index - 1)} />
          <span aria-live="polite">{index + 1} / {photos.length}</span>
          <IconButton variant="neutral" aria-label={t("profile.nextPhoto")} disabled={index === photos.length - 1} icon={<ChevronRight size={ICON_SIZE.md} />} onClick={() => move(index + 1)} />
          <Link className={buttonClass({ variant: "ghost", size: "sm" })} to={`/activity/${photo.activityId}?tab=overview`}>{t("profile.openActivity")}</Link>
        </div>
      </div>}
    </Modal>
  </>;
}
