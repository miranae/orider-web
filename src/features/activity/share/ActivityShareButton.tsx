import { flushSync } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageDown } from "lucide-react";
import { Button } from "../../../theme/components";
import { logClientError } from "../../../services/errorLogger";
import { track } from "../../../services/analytics";
import { canvasToPng, downloadShareCard, drawActivityShareCard, type ActivityShareCardInput } from "./activityShareCard";
import { ActivityShareMapCapture, type ActivityShareMapCaptureHandle } from "./ActivityShareMapCapture";
import { ICON_SIZE } from "../../../theme/tokens/icon";

export interface PublicShareMap { encodedPolyline: string | null; imageUrl: string | null; revision: string }

type Props = {
  compact?: boolean;
  menuItem?: boolean;
  card: ActivityShareCardInput;
  filename: string;
  url: string;
  activityId: string;
  visibility: string;
  routeTrack?: string | null;
  resolvePublicMap?: () => Promise<PublicShareMap>;
  shareContext?: object | null;
  shareRevision?: string;
  onFeedback: (message: string) => void;
};

export function ActivityShareButton({ compact = false, menuItem = false, card, filename, url, activityId, visibility, routeTrack, resolvePublicMap, shareContext, shareRevision, onFeedback }: Props) {
  const { t } = useTranslation("activity");
  const [busy, setBusy] = useState(false);
  const [verifiedMap, setVerifiedMap] = useState<PublicShareMap | null>(null);
  const lock = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const mapCapture = useRef<ActivityShareMapCaptureHandle>(null);
  const scope = useRef({ activityId, visibility, shareContext, shareRevision });
  if (scope.current.activityId !== activityId || scope.current.visibility !== visibility || scope.current.shareContext !== shareContext || scope.current.shareRevision !== shareRevision) scope.current = { activityId, visibility, shareContext, shareRevision };
  useEffect(() => {
    mounted.current = true; lock.current = false; setBusy(false); setVerifiedMap(null);
    return () => {
      mounted.current = false;
      generation.current += 1;
      controller.current?.abort();
    };
  }, [activityId, visibility, shareContext, shareRevision]);

  const context = { activityId, visibility };

  const handleShare = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const currentGeneration = ++generation.current;
    const currentScope = scope.current;
    controller.current?.abort();
    const abortController = new AbortController();
    controller.current = abortController;
    track("activity_share_attempt", context);
    try {
      const publicMap = resolvePublicMap ? await resolvePublicMap() : null;
      if (!mounted.current || currentGeneration !== generation.current || currentScope !== scope.current) return;
      if (resolvePublicMap) flushSync(() => setVerifiedMap(publicMap));
      const safeCard = resolvePublicMap ? { ...card, backgroundImageUrl: publicMap?.imageUrl ?? undefined,
        includeRouteImage: !!(publicMap?.encodedPolyline || publicMap?.imageUrl) } : card;
      const routeCanvas = safeCard.includeRouteImage
        ? await mapCapture.current?.capture(abortController.signal) ?? null
        : null;
      if (!mounted.current || currentGeneration !== generation.current || currentScope !== scope.current) return;
      const canvas = await drawActivityShareCard({ ...safeCard, routeCanvas }, abortController.signal);
      if (!mounted.current || currentGeneration !== generation.current || currentScope !== scope.current) return;
      const blob = await canvasToPng(canvas, abortController.signal);
      if (!mounted.current || currentGeneration !== generation.current || currentScope !== scope.current) return;
      if (!blob) throw new Error("canvas.toBlob returned null");
      if (resolvePublicMap && JSON.stringify(await resolvePublicMap()) !== JSON.stringify(publicMap)) throw new Error("public_map_changed");
      if (!mounted.current || currentGeneration !== generation.current || currentScope !== scope.current) return;
      downloadShareCard(blob, filename);
      track("activity_share_download", context);
      onFeedback(t("page.share.downloaded"));
    } catch (error) {
      if (abortController.signal.aborted || currentScope !== scope.current) return;
      track("activity_share_fail", { ...context, stage: "generate" });
      logClientError("ActivityShareButton.generate", error, context);
      let clipboardTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          navigator.clipboard.writeText(url),
          new Promise<never>((_, reject) => {
            clipboardTimeout = setTimeout(() => reject(new Error("clipboard timed out")), 3_000);
          }),
        ]);
        if (!mounted.current || currentGeneration !== generation.current || currentScope !== scope.current) return;
        track("activity_share_link", context);
        onFeedback(t("page.share.linkCopied"));
      } catch (clipboardError) {
        if (!mounted.current || currentGeneration !== generation.current || currentScope !== scope.current) return;
        track("activity_share_fail", { ...context, stage: "clipboard" });
        logClientError("ActivityShareButton.clipboard", clipboardError, context);
        onFeedback(t("page.share.failed"));
      } finally {
        clearTimeout(clipboardTimeout);
      }
    } finally {
      if (currentGeneration === generation.current) {
        lock.current = false;
        controller.current = null;
        if (mounted.current) setBusy(false);
      }
    }
  };

  return (
    <>
      <ActivityShareMapCapture ref={mapCapture} enabled={resolvePublicMap ? !!verifiedMap?.encodedPolyline : card.includeRouteImage} track={resolvePublicMap ? verifiedMap?.encodedPolyline : routeTrack} />
      <Button
        type="button"
        variant={menuItem ? "ghost" : "secondary"}
        className={menuItem ? "activity-management-row" : undefined}
        leadingIcon={menuItem ? <ImageDown size={ICON_SIZE.md} aria-hidden="true" /> : undefined}
        size="sm"
        disabled={busy}
        aria-busy={busy}
        aria-label={busy ? t("page.share.generating") : t("page.share.button")}
        onClick={() => void handleShare()}
      >
        {busy ? t("page.share.generating") : compact || menuItem ? t("detail.shareShort") : t("page.share.button")}
      </Button>
    </>
  );
}
