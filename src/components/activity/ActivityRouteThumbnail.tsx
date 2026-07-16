import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { doc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useAuth } from "../../contexts/AuthContext";
import { firestore, storage } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { lazyWithRetry as lazy } from "../../utils/lazyWithRetry";
import { LocalizedLink as Link } from "../LocalizedLink";

const RouteMap = lazy(() => import("../RouteMap"));

interface ActivityRouteThumbnailProps {
  activityId: string;
  userId: string;
  polyline: string;
  mapImageUrl?: string | null;
  priority?: boolean;
  layout?: "desktop" | "mobile";
}

/**
 * 저장된 클라이언트 캡처는 이미지로 표시하고, 이전 서버 썸네일은 현재 RouteMap으로
 * 다시 렌더링한다. 인증된 viewer가 이전 썸네일을 보면 새 WebP를 캡처해 교체한다.
 */
export default function ActivityRouteThumbnail({
  activityId,
  userId,
  polyline,
  mapImageUrl,
  priority = false,
  layout = "desktop",
}: ActivityRouteThumbnailProps) {
  const { t } = useTranslation("activity");
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(mapImageUrl ?? null);
  const captured = useRef(false);

  useEffect(() => { setImageUrl(mapImageUrl ?? null); }, [mapImageUrl]);

  const needsCapture = !!user && !isClientCapturedUrl(imageUrl);

  useEffect(() => {
    if (imageUrl && !needsCapture) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [imageUrl, needsCapture]);

  const handleMapLoad = useCallback(async () => {
    if (captured.current || !needsCapture) return;
    captured.current = true;

    const canvas = containerRef.current?.querySelector("canvas");
    if (!canvas) return;

    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.85),
      );
      if (!blob) return;

      const storageRef = ref(storage, `map_thumbnails/${userId}/${activityId}.webp`);
      await uploadBytes(storageRef, blob, { contentType: "image/webp" });
      const url = await getDownloadURL(storageRef);

      await updateDoc(doc(firestore, "activities", activityId), { mapImageUrl: url });
      setImageUrl(url);
    } catch (err) {
      if (shouldReportMapCaptureError(err)) {
        logClientError("ActivityRouteThumbnail.captureMap", err, { activityId });
      }
    }
  }, [activityId, userId, needsCapture]);

  const isMobile = layout === "mobile";
  const frameClassName = "block relative group overflow-hidden w-full aspect-[var(--feed-thumb-aspect)]";
  const frameStyle = { background: "var(--bg-2)" };
  const hoverDim = !isMobile && (
    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
  );

  let content;
  if (imageUrl && !needsCapture) {
    content = (
      <>
        <img
          src={imageUrl}
          alt={isMobile ? "" : t("card.routeMapAlt")}
          className="w-full h-full object-cover"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
        />
        {hoverDim}
      </>
    );
  } else {
    content = (
      <>
        {visible ? (
          <Suspense fallback={<div className="w-full h-full" style={frameStyle} />}>
            <RouteMap
              polyline={polyline}
              height="w-full h-full"
              fitPadding={16}
              interactive={false}
              rounded={false}
              preserveDrawingBuffer={needsCapture}
              pixelRatio={needsCapture ? 2 : undefined}
              onLoad={needsCapture ? handleMapLoad : undefined}
            />
          </Suspense>
        ) : (
          <div className="w-full h-full" style={frameStyle} />
        )}
        {hoverDim}
      </>
    );
  }

  if (isMobile) {
    return (
      <div
        ref={containerRef}
        className={frameClassName}
        style={{ ...frameStyle, margin: "0 -16px 10px", width: "calc(100% + 32px)" }}
      >
        {content}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="px-4 pb-3">
      <Link
        to={`/activity/${activityId}`}
        className={`${frameClassName} rounded-[var(--r-md)]`}
        style={frameStyle}
      >
        {content}
      </Link>
    </div>
  );
}

export function isClientCapturedUrl(url: string | null | undefined): boolean {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "firebasestorage.googleapis.com" &&
      (parsed.port === "" || parsed.port === "443")
    );
  } catch {
    return false;
  }
}

export function shouldReportMapCaptureError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code === "storage/unauthorized" || code === "permission-denied") return false;

  const message = error instanceof Error ? error.message : String(error);
  return !(
    message.includes("storage/unauthorized") ||
    message.includes("does not have permission") ||
    message.includes("Missing or insufficient permissions")
  );
}

function getErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}
