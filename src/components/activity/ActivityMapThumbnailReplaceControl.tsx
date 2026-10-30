import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady, functions } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { lazyWithRetry as lazy } from "../../utils/lazyWithRetry";
import { Button, Stack, Text } from "../../theme/components";
import {
  MAP_THUMBNAIL_PIXEL_RATIO,
  MAP_THUMBNAIL_VIEWPORT_HEIGHT,
  MAP_THUMBNAIL_VIEWPORT_WIDTH,
  blobToBase64,
  copyCanonicalMapThumbnailCanvas,
  createCanonicalMapThumbnailBlob,
  invokeMapThumbnailCoordinatorWithRetry,
  resolveActivityMapThumbnailRevision,
} from "./ActivityRouteThumbnail";

const RouteMap = lazy(() => import("../RouteMap"));
const CAPTURE_TIMEOUT_MS = 20_000;

interface Props {
  activityId: string;
  polyline: string;
  contentRevision?: unknown;
  contentSelectedRevision?: unknown;
}

/**
 * 주인 전용: 지도 썸네일 다시 만들기. 주인 브라우저가 피드 썸네일과 같은 규격으로 새로 캡처하고,
 * 서버가 한 번에 정본을 새 이미지로 바꾼다. 썸네일이 비는 순간이 없다.
 */
export default function ActivityMapThumbnailReplaceControl({ activityId, polyline, contentRevision, contentSelectedRevision }: Props) {
  const { t } = useTranslation("activity");
  const [capturing, setCapturing] = useState(false);
  const [result, setResult] = useState<{ kind: "done"; mapImageUrl: string } | { kind: "failed" } | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const handled = useRef(false);
  const revision = resolveActivityMapThumbnailRevision(contentRevision, contentSelectedRevision);

  const fail = useCallback((error: unknown, phase: string) => {
    logClientError("ActivityMapThumbnailReplaceControl.replace", error, { activityId, phase });
    setResult({ kind: "failed" });
    setCapturing(false);
  }, [activityId]);

  useEffect(() => {
    if (!capturing) return;
    const timer = globalThis.setTimeout(() => {
      if (handled.current) return;
      handled.current = true;
      fail(new Error("map-thumbnail/replace-capture-timeout"), "capture");
    }, CAPTURE_TIMEOUT_MS);
    return () => globalThis.clearTimeout(timer);
  }, [capturing, fail]);

  const handleMapLoad = useCallback(async () => {
    if (handled.current) return;
    handled.current = true;
    let phase = "capture";
    try {
      const canvas = captureRef.current?.querySelector("canvas");
      if (!canvas) throw new Error("map-thumbnail/canvas-not-found");
      const snapshot = copyCanonicalMapThumbnailCanvas(canvas);
      phase = "encode";
      const imageBase64 = await blobToBase64(await createCanonicalMapThumbnailBlob(snapshot));
      phase = "replace";
      const payload = { activityId, imageBase64, ...(revision.kind === "managed" ? { expectedHeadRevision: revision.headRevision } : {}) };
      const data = await invokeMapThumbnailCoordinatorWithRetry(async forceRefresh => {
        await ensureAppCheckReady(forceRefresh);
        return (await httpsCallable<typeof payload, { mapImageUrl: string }>(functions, "replaceActivityMapThumbnail")(payload)).data;
      });
      if (!data?.mapImageUrl) throw new Error("map-thumbnail/replace-missing-url");
      setResult({ kind: "done", mapImageUrl: data.mapImageUrl });
      setCapturing(false);
    } catch (error) {
      fail(error, phase);
    }
  }, [activityId, fail, revision]);

  function start() {
    handled.current = false;
    setResult(null);
    setCapturing(true);
  }

  return <Stack gap="var(--space-2)">
    <Text variant="bodySmall">{t("mapThumbnail.explanation")}</Text>
    <Button variant="outline" loading={capturing} disabled={capturing || revision.kind === "invalid"} onClick={start}>{t("mapThumbnail.replace")}</Button>
    {result && <Text role="status">{t(`mapThumbnail.${result.kind}`)}</Text>}
    {result?.kind === "done" && <img src={result.mapImageUrl} alt={t("mapThumbnail.preview")} className="w-full rounded-[var(--r-md)]" />}
    {capturing && <div ref={captureRef} aria-hidden="true" data-testid="map-thumbnail-replace-capture" style={{
      position: "fixed", top: 0, left: 0, width: MAP_THUMBNAIL_VIEWPORT_WIDTH, height: MAP_THUMBNAIL_VIEWPORT_HEIGHT,
      opacity: 0, pointerEvents: "none", overflow: "hidden",
    }}>
      <Suspense fallback={null}>
        <RouteMap polyline={polyline} height="w-full h-full" fitPadding={16} interactive={false} rounded={false}
          preserveDrawingBuffer pixelRatio={MAP_THUMBNAIL_PIXEL_RATIO} onLoad={() => void handleMapLoad()} />
      </Suspense>
    </div>}
  </Stack>;
}
