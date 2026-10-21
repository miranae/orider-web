import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Modal from "../Modal";
import { buttonClass, IconButton } from "../../theme/components";
import { LocalizedLink as Link } from "../LocalizedLink";

export interface AthletePhoto { id: string; url: string; caption: string | null; activityId: string }
export default function AthletePhotoGallery({ photos, cover = false }: { photos: AthletePhoto[]; cover?: boolean }) {
  const { t } = useTranslation("athlete");
  const [selected, setSelected] = useState<string | null>(null);
  const index = photos.findIndex(photo => `${photo.activityId}-${photo.id}` === selected);
  const photo = photos[index];
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
      {photos.map(item => <button key={`${item.activityId}-${item.id}`} className="athlete-photo-trigger" type="button" onClick={() => setSelected(`${item.activityId}-${item.id}`)} aria-label={t("profile.openPhoto")}><img src={item.url} alt={item.caption ?? ""} loading="lazy" /></button>)}
      {!cover && !photos.length && <p>{t("profile.noPhotos")}</p>}
    </div>
    <Modal open={!!photo} onClose={() => setSelected(null)} title={t("profile.recentPhotos")} maxWidth="max-w-4xl">
      {photo && <div className="athlete-photo-viewer">
        <img src={photo.url} alt={photo.caption ?? ""} />
        {photo.caption && <p>{photo.caption}</p>}
        <div className="athlete-photo-viewer-controls">
          <IconButton variant="neutral" aria-label={t("profile.previousPhoto")} disabled={index === 0} icon={<ChevronLeft size={18} />} onClick={() => move(index - 1)} />
          <span aria-live="polite">{index + 1} / {photos.length}</span>
          <IconButton variant="neutral" aria-label={t("profile.nextPhoto")} disabled={index === photos.length - 1} icon={<ChevronRight size={18} />} onClick={() => move(index + 1)} />
          <Link className={buttonClass({ variant: "ghost" })} to={`/activity/${photo.activityId}?tab=overview`}>{t("profile.openActivity")}</Link>
        </div>
      </div>}
    </Modal>
  </>;
}
