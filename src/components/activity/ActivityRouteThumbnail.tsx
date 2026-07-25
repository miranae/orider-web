import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "../../contexts/AuthContext";
import { ensureAppCheckReady, functions, storage } from "../../services/firebase";
import { logClientError } from "../../services/errorLogger";
import { lazyWithRetry as lazy } from "../../utils/lazyWithRetry";
import { LocalizedLink as Link } from "../LocalizedLink";

const RouteMap = lazy(() => import("../RouteMap"));

export const MAP_THUMBNAIL_RENDER_VERSION = "route-v2";
export const MAP_THUMBNAIL_WIDTH = 2560;
export const MAP_THUMBNAIL_HEIGHT = 914;
export const MAP_THUMBNAIL_VIEWPORT_WIDTH = 1280;
export const MAP_THUMBNAIL_VIEWPORT_HEIGHT = 457;
const MAP_THUMBNAIL_MAX_BYTES = 1024 * 1024;
const MAP_THUMBNAIL_CAPTURE_TIMEOUT_MS = 20_000;
const MAP_THUMBNAIL_PROCESS_TIMEOUT_MS = 30_000;
const MAP_THUMBNAIL_WEBP_QUALITIES = [0.85, 0.78, 0.7, 0.62, 0.52, 0.4, 0.28, 0.16];

let activeCaptureToken: symbol | null = null;
const waitingCaptureTokens: symbol[] = [];
const captureCallbacks = new Map<symbol, () => void>();
let webpCaptureSupported: boolean | null = null;

function disableWebpCapture() {
  webpCaptureSupported = false;
  // 이미 대기 중인 카드도 같은 unsupported 인코딩을 반복하지 않게 즉시 큐에서 제거한다.
  waitingCaptureTokens.splice(0, waitingCaptureTokens.length);
  captureCallbacks.clear();
}

function advanceCaptureQueue() {
  if (activeCaptureToken) return;
  while (waitingCaptureTokens.length > 0) {
    const token = waitingCaptureTokens.shift()!;
    const callback = captureCallbacks.get(token);
    if (!callback) continue;
    activeCaptureToken = token;
    callback();
    return;
  }
}

function requestCaptureSlot(token: symbol, callback: () => void): () => void {
  captureCallbacks.set(token, callback);
  if (activeCaptureToken !== token && !waitingCaptureTokens.includes(token)) {
    waitingCaptureTokens.push(token);
  }
  advanceCaptureQueue();
  return () => releaseCaptureSlot(token);
}

function releaseCaptureSlot(token: symbol) {
  captureCallbacks.delete(token);
  const waitingIndex = waitingCaptureTokens.indexOf(token);
  if (waitingIndex >= 0) waitingCaptureTokens.splice(waitingIndex, 1);
  if (activeCaptureToken === token) activeCaptureToken = null;
  advanceCaptureQueue();
}

interface ActivityRouteThumbnailProps {
  activityId: string;
  userId: string;
  polyline: string;
  mapImageUrl?: string | null;
  visibility: "everyone" | "friends" | "private";
  priority?: boolean;
  layout?: "desktop" | "mobile";
}

/**
 * 현재 경로와 렌더 버전으로 만든 canonical 캡처만 이미지로 재사용한다. 그 외에는
 * 로그인 여부와 무관하게 같은 RouteMap을 표시하고, 인증된 viewer만 고정 해상도 WebP를 저장한다.
 */
export default function ActivityRouteThumbnail({
  activityId,
  userId,
  polyline,
  mapImageUrl,
  visibility,
  priority = false,
  layout = "desktop",
}: ActivityRouteThumbnailProps) {
  const { t } = useTranslation("activity");
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const captureToken = useRef(Symbol(activityId));
  const [visible, setVisible] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(mapImageUrl ?? null);
  const [hasCaptureSlot, setHasCaptureSlot] = useState(false);
  const [derivedKey, setDerivedKey] = useState<CanonicalMapThumbnailKey | null>(null);
  const captured = useRef(false);
  const mounted = useRef(true);
  const activeCanonicalKey = useRef("");

  const canonicalKey = derivedKey?.activityId === activityId && derivedKey.sourcePolyline === polyline
    ? derivedKey
    : null;
  const canonicalFileName = canonicalKey?.fileName ?? "";
  const canonicalVersion = canonicalKey?.sourceHash ?? "";
  activeCanonicalKey.current = `${canonicalFileName}:${canonicalVersion}`;
  const canonicalImageUrl = canonicalKey && isCanonicalMapThumbnailUrl(
    imageUrl,
    userId,
    canonicalFileName,
    storage.app.options.storageBucket,
  ) ? imageUrl : null;

  useEffect(() => { setImageUrl(mapImageUrl ?? null); }, [mapImageUrl]);
  useEffect(() => {
    let cancelled = false;
    setDerivedKey(null);
    void deriveCanonicalMapThumbnailKey(activityId, polyline).then((key) => {
      if (!cancelled) setDerivedKey(key);
    }).catch((error) => {
      if (!cancelled) logClientError("ActivityRouteThumbnail.deriveKey", error, { activityId });
    });
    return () => { cancelled = true; };
  }, [activityId, polyline]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    captured.current = false;
  }, [canonicalFileName, canonicalVersion, user?.uid]);

  // anonymous는 공개 활동만, 인증 viewer는 조회된 friends/private도 시도한다.
  // 실제 owner/양방향 친구 관계는 prepare/finalize callable이 최신 서버 상태로 최종 강제한다.
  const mayCapture = visibility === "everyone" || !!user;
  const needsCapture = mayCapture && webpCaptureSupported !== false && !!canonicalKey && !canonicalImageUrl;

  useEffect(() => {
    if (canonicalImageUrl) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [canonicalImageUrl, needsCapture]);

  useEffect(() => {
    if (!visible || !needsCapture || captured.current) return;
    return requestCaptureSlot(captureToken.current, () => setHasCaptureSlot(true));
  }, [visible, needsCapture, canonicalFileName, canonicalVersion]);

  useEffect(() => {
    if (!hasCaptureSlot) return;
    const timeoutId = globalThis.setTimeout(() => {
      if (captured.current) return;
      captured.current = true;
      releaseCaptureSlot(captureToken.current);
      setHasCaptureSlot(false);
    }, MAP_THUMBNAIL_CAPTURE_TIMEOUT_MS);
    return () => globalThis.clearTimeout(timeoutId);
  }, [hasCaptureSlot]);

  const handleMapLoad = useCallback(async () => {
    if (captured.current || !needsCapture) return;
    captured.current = true;

    const mapCanvas = captureRef.current?.querySelector("canvas");

    try {
      if (!mapCanvas) throw new Error("map-thumbnail/canvas-not-found");
      if (mapCanvas.width !== MAP_THUMBNAIL_WIDTH || mapCanvas.height !== MAP_THUMBNAIL_HEIGHT) {
        throw new Error(`map-thumbnail/canvas-too-small:${mapCanvas.width}x${mapCanvas.height}`);
      }
      const snapshot = copyCanonicalMapThumbnailCanvas(mapCanvas);

      // WebGL 픽셀 복사가 끝나는 즉시 다음 카드가 캡처할 수 있게 슬롯을 넘긴다.
      releaseCaptureSlot(captureToken.current);
      if (mounted.current) setHasCaptureSlot(false);

      const blob = await withTimeout(
        createCanonicalMapThumbnailBlob(snapshot),
        MAP_THUMBNAIL_PROCESS_TIMEOUT_MS,
        "map-thumbnail/encode-timeout",
      );
      const imageBase64 = await blobToBase64(blob);

      const prepared = await prepareActivityMapThumbnailUpload(activityId, canonicalFileName);
      if (prepared.expectedFileName !== canonicalFileName) {
        throw new Error("map-thumbnail/stale-prepare");
      }

      if (activeCanonicalKey.current !== `${canonicalFileName}:${canonicalVersion}`) return;
      if (!mounted.current) return;
      const finalized = await finalizeActivityMapThumbnailUpload(
        activityId,
        canonicalFileName,
        imageBase64,
      );
      if (activeCanonicalKey.current !== `${canonicalFileName}:${canonicalVersion}`) return;
      if (!mounted.current) return;
      setImageUrl(finalized.mapImageUrl);
    } catch (err) {
      if (shouldReportMapCaptureError(err)) {
        logClientError("ActivityRouteThumbnail.captureMap", err, { activityId });
      }
    } finally {
      releaseCaptureSlot(captureToken.current);
      if (mounted.current) setHasCaptureSlot(false);
    }
  }, [activityId, userId, canonicalFileName, canonicalVersion, needsCapture]);

  const isMobile = layout === "mobile";
  const frameClassName = "block relative group overflow-hidden w-full aspect-[var(--feed-thumb-aspect)]";
  const frameStyle = { background: "var(--bg-2)" };
  const hoverDim = !isMobile && (
    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
  );

  let content;
  if (canonicalImageUrl) {
    content = (
      <>
        <img
          src={canonicalImageUrl}
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
              key={`${canonicalFileName}:${canonicalVersion}:live`}
              polyline={polyline}
              height="w-full h-full"
              fitPadding={16}
              interactive={false}
              rounded={false}
              fallbackImageUrl={mapImageUrl}
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
      <>
        <div
          ref={containerRef}
          data-map-thumbnail-frame
          className={frameClassName}
          style={{ ...frameStyle, margin: "0 -16px 10px", width: "calc(100% + 32px)" }}
        >
          {content}
        </div>
        {hasCaptureSlot && renderCaptureViewport()}
      </>
    );
  }

  return (
    <>
      <div ref={containerRef} className="px-4 pb-3">
        <Link
          to={`/activity/${activityId}`}
          data-map-thumbnail-frame
          className={`${frameClassName} rounded-[var(--r-md)]`}
          style={frameStyle}
        >
          {content}
        </Link>
      </div>
      {hasCaptureSlot && renderCaptureViewport()}
    </>
  );

  function renderCaptureViewport() {
    return (
      <div
        ref={captureRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: MAP_THUMBNAIL_VIEWPORT_WIDTH,
          height: MAP_THUMBNAIL_VIEWPORT_HEIGHT,
          opacity: 0,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        <Suspense fallback={null}>
          <RouteMap
            key={`${canonicalFileName}:${canonicalVersion}:capture`}
            polyline={polyline}
            height="w-full h-full"
            fitPadding={16}
            interactive={false}
            rounded={false}
            preserveDrawingBuffer
            pixelRatio={2}
            onLoad={handleMapLoad}
          />
        </Suspense>
      </div>
    );
  }
}

interface CanonicalMapThumbnailKey {
  activityId: string;
  sourcePolyline: string;
  sourceHash: string;
  fileName: string;
}

export async function getPolylineHash(polyline: string): Promise<string> {
  const source = `${MAP_THUMBNAIL_RENDER_VERSION}\0${polyline.trim()}`;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getCanonicalMapThumbnailFileName(activityId: string, polyline: string): Promise<string> {
  const sourceHash = await getPolylineHash(polyline);
  return `${activityId}.${MAP_THUMBNAIL_RENDER_VERSION}-${sourceHash.slice(0, 16)}.webp`;
}

async function deriveCanonicalMapThumbnailKey(
  activityId: string,
  sourcePolyline: string,
): Promise<CanonicalMapThumbnailKey> {
  const sourceHash = await getPolylineHash(sourcePolyline);
  return {
    activityId,
    sourcePolyline,
    sourceHash,
    fileName: `${activityId}.${MAP_THUMBNAIL_RENDER_VERSION}-${sourceHash.slice(0, 16)}.webp`,
  };
}

export function isCanonicalMapThumbnailUrl(
  url: string | null | undefined,
  userId: string,
  canonicalFileName: string,
  storageBucket: string | undefined,
): boolean {
  if (!url || !userId || !canonicalFileName || !storageBucket) return false;

  try {
    const parsed = new URL(url);
    if (!(
      parsed.protocol === "https:" &&
      parsed.hostname === "firebasestorage.googleapis.com" &&
      (parsed.port === "" || parsed.port === "443")
    )) return false;

    const pathMatch = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!pathMatch || decodeURIComponent(pathMatch[1]!) !== storageBucket) return false;
    const objectPath = decodeURIComponent(pathMatch[2]!);
    return objectPath === `map_thumbnails/${userId}/${canonicalFileName}`;
  } catch {
    return false;
  }
}

function copyCanonicalMapThumbnailCanvas(mapCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const output = document.createElement("canvas");
  output.width = MAP_THUMBNAIL_WIDTH;
  output.height = MAP_THUMBNAIL_HEIGHT;
  const context = output.getContext("2d");
  if (!context) throw new Error("map-thumbnail/canvas-context-unavailable");

  context.drawImage(mapCanvas, 0, 0, MAP_THUMBNAIL_WIDTH, MAP_THUMBNAIL_HEIGHT);
  return output;
}

export async function createCanonicalMapThumbnailBlob(output: HTMLCanvasElement): Promise<Blob> {
  for (const quality of MAP_THUMBNAIL_WEBP_QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/webp", quality));
    if (!blob) throw new Error("map-thumbnail/webp-encode-failed");
    if (blob.type !== "image/webp") {
      disableWebpCapture();
      throw new Error("map-thumbnail/webp-unsupported");
    }
    webpCaptureSupported = true;
    if (blob.size < MAP_THUMBNAIL_MAX_BYTES) return blob;
  }
  throw new Error("map-thumbnail/webp-too-large");
}

async function prepareActivityMapThumbnailUpload(
  activityId: string,
  expectedFileName: string,
): Promise<{ expectedFileName: string }> {
  return invokeMapThumbnailCoordinator<
    { activityId: string; expectedFileName: string },
    { expectedFileName: string }
  >("prepareActivityMapThumbnailUpload", { activityId, expectedFileName });
}

async function finalizeActivityMapThumbnailUpload(
  activityId: string,
  expectedFileName: string,
  imageBase64: string,
): Promise<{ mapImageUrl: string }> {
  const data = await invokeMapThumbnailCoordinator<
    { activityId: string; expectedFileName: string; imageBase64: string },
    { mapImageUrl: string }
  >("finalizeActivityMapThumbnailUpload", { activityId, expectedFileName, imageBase64 });
  if (!data.mapImageUrl) throw new Error("map-thumbnail/finalize-missing-url");
  return data;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  if (blob.size >= MAP_THUMBNAIL_MAX_BYTES) throw new Error("map-thumbnail/blob-too-large");
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("map-thumbnail/blob-read-failed"));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function invokeMapThumbnailCoordinator<TInput, TOutput>(
  name: "prepareActivityMapThumbnailUpload" | "finalizeActivityMapThumbnailUpload",
  payload: TInput,
): Promise<TOutput> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // enforceAppCheck callable과 auth 직후 캡처가 경쟁하지 않도록 token 준비를 직접 보장한다.
      await ensureAppCheckReady(attempt === 1);
      const callable = httpsCallable<TInput, TOutput>(functions, name);
      return (await callable(payload)).data;
    } catch (error) {
      lastError = error;
      if (attempt > 0 || !isAppCheckRetryable(error)) break;
    }
  }
  throw lastError;
}

export function isAppCheckRetryable(error: unknown): boolean {
  const code = getErrorCode(error)?.toLowerCase() ?? "";
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return code.includes("unauthenticated") ||
    code.includes("app-check") ||
    code.includes("appcheck") ||
    message.includes("app check") ||
    message.includes("appcheck") ||
    message.includes("app-check/token");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorCode: string): Promise<T> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = globalThis.setTimeout(() => reject(new Error(errorCode)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }
}

export function shouldReportMapCaptureError(error: unknown): boolean {
  const code = getErrorCode(error)?.toLowerCase() ?? "";
  if (
    code === "storage/unauthorized" ||
    code === "permission-denied" ||
    code === "functions/permission-denied" ||
    code === "functions/failed-precondition" ||
    code === "functions/not-found"
  ) return false;

  const message = error instanceof Error ? error.message : String(error);
  return !(
    message.includes("map-thumbnail/stale-prepare") ||
    message.includes("map-thumbnail/webp-unsupported") ||
    message.includes("functions/permission-denied") ||
    message.includes("functions/failed-precondition") ||
    message.includes("functions/not-found") ||
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
