import { ICON_SIZE } from '../../../theme/tokens/icon';
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Trash2 } from "lucide-react";
import type { Activity } from "@shared/types";
import Avatar from "../../../components/Avatar";
import { LocalizedLink as Link } from "../../../components/LocalizedLink";
import { Button, IconButton, MediaViewer, Text } from "../../../theme/components";
import { segmentHistoryPath } from "../../segments/segmentHistoryNavigation";
import "./activity-overview-social.css";

export interface OverviewPhoto { id: string; url: string; caption?: string | null; location?: [number, number] | null; uploadId?: string; ownerId?: string }
export interface OverviewAchievement { id: string; segmentId: string; name: string; badge: string; time: string; effortId?: number }
interface Props {
  activityId: string; memo: string | null; memoMono?: boolean; memoLoading?: boolean; memoError?: boolean; photosKnown?: boolean; memoTruncated?: boolean; photos: OverviewPhoto[]; totalPhotos: number;
  companions: Activity[]; achievements: OverviewAchievement[];
  owner: boolean; viewerId?: string; uploading: boolean; canUpload: boolean;
  loadingPhotos: boolean; photoError?: string | null; canLoadPhotos: boolean;
  onSignIn?: () => void; onLoadPhotos: () => void; onUpload: () => void; onDelete: (id: string) => void; onLocate: (location: [number, number]) => void;
  onShowResults: () => void;
  prioritizeResults?: boolean;
}
const safeImage = (url: string) => { try { const value = new URL(url); return value.protocol === "https:" && !value.username && !value.password; } catch { return false; } };

/** Overview-only composition; all content and mutations retain their existing parent authority. */
export default function ActivityOverviewSocial(props: Props) {
  const { t } = useTranslation("activity");
  const { activityId, memo, photos, companions, achievements } = props;
  const memoRef = useRef<HTMLParagraphElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const safePhotos = useMemo(() => photos.filter(photo => safeImage(photo.url)), [photos]);
  const index = safePhotos.findIndex(photo => photo.id === selected);
  const photo = safePhotos[index];
  const total = Math.max(props.totalPhotos, safePhotos.length);
  useEffect(() => {
    if (expanded) return;
    const paragraph = memoRef.current;
    if (!paragraph) { setOverflowing(false); return; }
    const measure = () => setOverflowing(paragraph.scrollHeight > paragraph.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure); observer.observe(paragraph);
    return () => observer.disconnect();
  }, [memo, expanded]);
  useEffect(() => { setExpanded(false); setSelected(null); }, [activityId]);
  const load = () => { if (props.canLoadPhotos && !props.loadingPhotos) props.onLoadPhotos(); };
  const results = (achievements.length > 0 && <div className="activity-overview-results">
      <section className="activity-overview-achievements" aria-label={t("page.topResults")}>
        <div className="activity-overview-section-heading"><Text as="h2" variant="bodyMedium" weight={600}>{t("page.topResults")}</Text>{achievements.length > 0 && <Button variant="ghost" size="sm" onClick={props.onShowResults}>{t("overviewSocial.allResults")}</Button>}</div>
        {<ul>{achievements.slice(0, 3).map(result => <li key={result.id}><span className="activity-overview-result-badge">{result.badge}</span><div><Link to={segmentHistoryPath(result.segmentId, result.effortId, activityId)}>{result.name}</Link><Text as="p" variant="caption" tone="secondary">{result.time}</Text></div></li>)}</ul>}
      </section>
    </div>);
  return <section className="activity-overview-social" data-has-results={achievements.length > 0} aria-label={t("overviewSocial.title")}>
    {props.prioritizeResults && results}
    <div className="activity-overview-story">
      {memo?.trim() ? <div className="activity-overview-memo">
        <Text as="p" variant="body" ref={memoRef} mono={props.memoMono} className={expanded ? undefined : "activity-overview-memo--collapsed"}>{memo}</Text>
        {overflowing && <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{t(expanded ? "card.memoLess" : "card.memoMore")}</Button>}
        {props.memoTruncated && <Text as="p" variant="caption" tone="secondary">{t("overviewSocial.memoPartial")}</Text>}
      </div> : <Text as="p" variant="bodyMedium" tone="tertiary" role={props.memoLoading ? "status" : undefined}>{t(props.memoLoading ? "detail.loadingData" : props.memoError ? "overviewSocial.memoUnavailable" : "overviewSocial.noMemo")}</Text>}
      <div className="activity-overview-photos" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(5, safePhotos.length))}, minmax(0, 1fr))` }} aria-label={t("page.photos")}>
        {safePhotos.slice(0, 5).map((item, position) => <button type="button" className="activity-overview-photo" key={item.id}
          aria-label={t("overviewSocial.openPhoto", { index: position + 1, count: total })}
          onClick={() => { setSelected(item.id); if (total > safePhotos.length) load(); }}>
          <img src={item.url} alt={item.caption ?? ""} loading="lazy" />
          {position === 4 && total > 5 && <span className="activity-overview-photo-more">+{total - 4}</span>}
        </button>)}
      </div>
      {!safePhotos.length && !props.photoError && (props.loadingPhotos || total > 0 || props.photosKnown === false) && <Text as="p" variant="bodySmall" tone="tertiary" role={props.loadingPhotos ? "status" : undefined}>{t(props.loadingPhotos ? "detail.loadingData" : total > 0 || props.photosKnown === false ? "overviewSocial.photosPending" : "overviewSocial.noPhotos")}</Text>}
      <div className="activity-overview-photo-actions">
        {(total > safePhotos.length || props.photosKnown === false) && props.canLoadPhotos && <Button variant="ghost" size="sm" disabled={props.loadingPhotos} onClick={load}>{t(props.loadingPhotos ? "detail.loadingData" : "overviewSocial.loadPhotos")}</Button>}
        {(total > safePhotos.length || props.photosKnown === false) && !props.canLoadPhotos && props.onSignIn && <Button variant="ghost" size="sm" onClick={props.onSignIn}>{t("overviewSocial.signInPhotos")}</Button>}
        {props.owner && props.canUpload && <Button variant="ghost" size="sm" disabled={props.uploading} onClick={props.onUpload}>{t(props.uploading ? "page.uploading" : "page.addPhoto")}</Button>}
      </div>
      {props.photoError && <div role="alert"><Text as="p" variant="bodySmall">{t("overviewSocial.photoError")}</Text>{props.canLoadPhotos && <Button variant="ghost" size="sm" onClick={load}>{t("page.retry")}</Button>}</div>}
      {companions.length > 0 && <div className="activity-overview-companions">
        <Text as="h2" variant="bodySmall" weight={600}>{t("page.coRiders", { count: companions.length })}</Text>
        {<div className="activity-overview-companion-list">{companions.map(rider => <Link key={rider.id} to={`/activity/${rider.id}`} aria-label={rider.nickname}><Avatar size="sm" name={rider.nickname} imageUrl={rider.profileImage}  /><Text variant="caption">{rider.nickname}</Text></Link>)}</div>}
      </div>}
    </div>
    {!props.prioritizeResults && results}
    <MediaViewer open={!!photo} item={photo ? { id: photo.id, url: photo.url, alt: photo.caption ?? t("page.photoPreview"), caption: photo.caption } : undefined}
      label={t("page.photos")} position={`${index + 1} / ${total}`} onClose={() => setSelected(null)}
      labels={{ previous: t("overviewSocial.previousPhoto"), next: t("overviewSocial.nextPhoto"), zoomIn: t("overviewSocial.zoomIn"), zoomOut: t("overviewSocial.zoomOut"), close: t("overviewSocial.closeViewer") }}
      onPrevious={index > 0 ? () => setSelected(safePhotos[index - 1]!.id) : safePhotos.length > 1 && safePhotos.length >= total && props.photosKnown !== false ? () => setSelected(safePhotos[safePhotos.length - 1]!.id) : undefined}
      onNext={index < safePhotos.length - 1 ? () => setSelected(safePhotos[index + 1]!.id) : safePhotos.length > 1 && safePhotos.length >= total && props.photosKnown !== false ? () => setSelected(safePhotos[0]!.id) : undefined}
      footer={<>
        <div className="activity-overview-viewer-controls">
          {photo?.location && <IconButton variant="ghost" icon={<MapPin size={ICON_SIZE.md} />} aria-label={t("page.photoMapFocus")} onClick={() => { props.onLocate(photo.location!); setSelected(null); }} />}
          {photo?.uploadId && photo.ownerId === props.viewerId && <IconButton variant="danger" icon={<Trash2 size={ICON_SIZE.md} />} aria-label={t("page.delete")} onClick={() => props.onDelete(photo.uploadId!)} />}
          {total > safePhotos.length && props.canLoadPhotos && <Button variant="ghost" size="sm" disabled={props.loadingPhotos} onClick={load}>{t(props.photoError ? "page.retry" : props.loadingPhotos ? "detail.loadingData" : "overviewSocial.loadPhotos")}</Button>}
        </div>
        {props.loadingPhotos && <Text as="p" variant="bodySmall" role="status">{t("detail.loadingData")}</Text>}
        {props.photoError && <Text as="p" variant="bodySmall" role="alert">{t("overviewSocial.photoError")}</Text>}
      </>} />
  </section>;
}
