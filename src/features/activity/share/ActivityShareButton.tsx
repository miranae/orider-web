import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../theme/components";
import { logClientError } from "../../../services/errorLogger";
import { track } from "../../../services/analytics";
import { canvasToPng, downloadShareCard, drawActivityShareCard, type ActivityShareCardInput } from "./activityShareCard";

type Props = {
  card: ActivityShareCardInput;
  filename: string;
  url: string;
  activityId: string;
  visibility: string;
  onFeedback: (message: string) => void;
};

export function ActivityShareButton({ card, filename, url, activityId, visibility, onFeedback }: Props) {
  const { t } = useTranslation("activity");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
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
      const canvas = await drawActivityShareCard(card, abortController.signal);
      if (!mounted.current || currentGeneration !== generation.current) return;
      const blob = await canvasToPng(canvas);
      if (!mounted.current || currentGeneration !== generation.current) return;
      if (!blob) throw new Error("canvas.toBlob returned null");
      const file = typeof File === "undefined" ? null : new File([blob], filename, { type: "image/png" });
      let canShareFile = false;
      const payload: ShareData | null = file
        ? { title: card.title, text: card.footer, url, files: [file] }
        : null;
      if (file && typeof navigator.share === "function") {
        try {
          canShareFile = typeof navigator.canShare !== "function" || navigator.canShare(payload!);
        } catch {
          canShareFile = false;
        }
      }
      if (payload && canShareFile) {
        try {
          await navigator.share(payload);
          if (!mounted.current || currentGeneration !== generation.current) return;
          track("activity_share_native", context);
          onFeedback(t("page.share.shared"));
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            if (!mounted.current || currentGeneration !== generation.current) return;
            track("activity_share_cancel", context);
            return;
          }
          if (!mounted.current || currentGeneration !== generation.current) return;
          track("activity_share_fail", { ...context, stage: "native" });
          logClientError("ActivityShareButton.nativeShare", error, context);
        }
      }
      if (!mounted.current || currentGeneration !== generation.current) return;
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
  );
}
