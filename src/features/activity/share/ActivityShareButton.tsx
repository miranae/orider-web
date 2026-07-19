import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../theme/components";
import { logClientError } from "../../../services/errorLogger";
import { track } from "../../../services/analytics";
import { canvasToPng, downloadShareCard, drawActivityShareCard, type ActivityShareCardInput } from "./activityShareCard";
import { ActivityShareMapCapture, type ActivityShareMapCaptureHandle } from "./ActivityShareMapCapture";

type Props = {
  card: ActivityShareCardInput;
  filename: string;
  url: string;
  activityId: string;
  visibility: string;
  routeTrack?: string | null;
  onFeedback: (message: string) => void;
};

export function ActivityShareButton({ card, filename, url, activityId, visibility, routeTrack, onFeedback }: Props) {
  const { t } = useTranslation("activity");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const mapCapture = useRef<ActivityShareMapCaptureHandle>(null);
  useEffect(() => () => {
    mounted.current = false;
    generation.current += 1;
    controller.current?.abort();
  }, []);

  const context = { activityId, visibility };

  const handleShare = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const currentGeneration = ++generation.current;
    controller.current?.abort();
    const abortController = new AbortController();
    controller.current = abortController;
    track("activity_share_attempt", context);
    try {
      const routeCanvas = card.includeRouteImage
        ? await mapCapture.current?.capture(abortController.signal) ?? null
        : null;
      if (!mounted.current || currentGeneration !== generation.current) return;
      const canvas = await drawActivityShareCard({ ...card, routeCanvas }, abortController.signal);
      if (!mounted.current || currentGeneration !== generation.current) return;
      const blob = await canvasToPng(canvas);
      if (!mounted.current || currentGeneration !== generation.current) return;
      if (!blob) throw new Error("canvas.toBlob returned null");
      downloadShareCard(blob, filename);
      track("activity_share_download", context);
      onFeedback(t("page.share.downloaded"));
    } catch (error) {
      if (abortController.signal.aborted) return;
      track("activity_share_fail", { ...context, stage: "generate" });
      logClientError("ActivityShareButton.generate", error, context);
      try {
        await navigator.clipboard.writeText(url);
        if (!mounted.current || currentGeneration !== generation.current) return;
        track("activity_share_link", context);
        onFeedback(t("page.share.linkCopied"));
      } catch (clipboardError) {
        if (!mounted.current || currentGeneration !== generation.current) return;
        track("activity_share_fail", { ...context, stage: "clipboard" });
        logClientError("ActivityShareButton.clipboard", clipboardError, context);
        onFeedback(t("page.share.failed"));
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
      <ActivityShareMapCapture ref={mapCapture} enabled={card.includeRouteImage} track={routeTrack} />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        aria-busy={busy}
        aria-label={busy ? t("page.share.generating") : t("page.share.button")}
        onClick={() => void handleShare()}
      >
        {busy ? t("page.share.generating") : t("page.share.button")}
      </Button>
    </>
  );
}
