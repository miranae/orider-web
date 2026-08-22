import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
export const MAP_THUMBNAIL_PIXEL_RATIO = 2;
const MAP_THUMBNAIL_MAX_BYTES = 1024 * 1024;
const MAP_THUMBNAIL_CAPTURE_TIMEOUT_MS = 20_000;
const MAP_THUMBNAIL_PROCESS_TIMEOUT_MS = 30_000;
const MAP_THUMBNAIL_WEBP_QUALITIES = [0.85, 0.78, 0.7, 0.62, 0.52, 0.4, 0.28, 0.16];
type MapThumbnailPhase = "capture" | "encode" | "prepare" | "finalize";
interface CaptureSlot {
  token: symbol;
  identity: string;
}

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
  contentRevision?: number | null;
  contentSelectedRevision?: number | null;
  priority?: boolean;
  layout?: "desktop" | "mobile";
}

/**
 * 현재 경로와 렌더 버전으로 만든 canonical 캡처만 이미지로 재사용한다. 그 외에는
 * 로그인 여부와 무관하게 같은 RouteMap을 표시한다. 레거시는 기존 viewer 정책을 유지하고,
 * revision-managed 활동은 owner만 고정 해상도 WebP를 저장한다.
 */
export default function ActivityRouteThumbnail({
  activityId,
  userId,
  polyline,
  mapImageUrl,
  visibility,
  contentRevision,
  contentSelectedRevision,
  priority = false,
  layout = "desktop",
}: ActivityRouteThumbnailProps) {
  const { t } = useTranslation("activity");
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(mapImageUrl ?? null);
  const [captureSlot, setCaptureSlot] = useState<CaptureSlot | null>(null);
  const [derivedKey, setDerivedKey] = useState<CanonicalMapThumbnailKey | null>(null);
  const captured = useRef(false);
  const mounted = useRef(true);
  const activeCanonicalKey = useRef("");
  const revisionState = useMemo(
    () => resolveActivityMapThumbnailRevision(contentRevision, contentSelectedRevision),
    [contentRevision, contentSelectedRevision],
  );
  const revisionIdentity = revisionState.kind === "managed"
    ? `managed:${revisionState.headRevision}:${revisionState.selectedRevision}`
    : revisionState.kind;

  const canonicalKey = derivedKey?.activityId === activityId
    && derivedKey.sourcePolyline === polyline
    && derivedKey.revisionIdentity === revisionIdentity
    ? derivedKey
    : null;
  const canonicalFileName = canonicalKey?.fileName ?? "";
  const canonicalVersion = canonicalKey?.sourceHash ?? "";
  const captureIdentity = `${canonicalFileName}:${canonicalVersion}:${revisionIdentity}`;
  activeCanonicalKey.current = captureIdentity;
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
    void deriveCanonicalMapThumbnailKey(activityId, polyline, revisionState).then((key) => {
      if (!cancelled) setDerivedKey(key);
    }).catch((error) => {
      if (!cancelled) logClientError("ActivityRouteThumbnail.deriveKey", error, { activityId });
    });
    return () => { cancelled = true; };
  }, [activityId, polyline, revisionIdentity, revisionState]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    captured.current = false;
  }, [canonicalFileName, canonicalVersion, revisionIdentity, user?.uid]);

  // Revision-managed 썸네일은 owner만 발행한다. 레거시는 기존 공개/인증 viewer 동작을 유지하고,
  // 실제 접근 권한은 prepare/finalize callable이 최신 서버 상태로 최종 강제한다.
  const mayCapture = revisionState.kind === "managed"
    ? user?.uid === userId
    : revisionState.kind === "legacy" && (visibility === "everyone" || !!user);
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
    const requestedSlot: CaptureSlot = {
      token: Symbol(captureIdentity),
      identity: captureIdentity,
    };
    const release = requestCaptureSlot(requestedSlot.token, () => setCaptureSlot(requestedSlot));
    return () => {
      release();
      setCaptureSlot((current) => current === requestedSlot ? null : current);
    };
  }, [visible, needsCapture, canonicalFileName, canonicalVersion, captureIdentity]);

  useEffect(() => {
    if (!captureSlot) return;
    const timeoutId = globalThis.setTimeout(() => {
      if (captured.current) return;
      captured.current = true;
      releaseCaptureSlot(captureSlot.token);
      setCaptureSlot((current) => current === captureSlot ? null : current);
    }, MAP_THUMBNAIL_CAPTURE_TIMEOUT_MS);
    return () => globalThis.clearTimeout(timeoutId);
  }, [captureSlot]);

  const handleMapLoad = useCallback(async () => {
    const ownedSlot = captureSlot;
    if (captured.current || !needsCapture || ownedSlot?.identity !== captureIdentity) return;
    captured.current = true;

    const mapCanvas = captureRef.current?.querySelector("canvas");

    let phase: MapThumbnailPhase = "capture";
    try {
      if (!mapCanvas) throw new Error("map-thumbnail/canvas-not-found");
      const snapshot = copyCanonicalMapThumbnailCanvas(mapCanvas);

      // WebGL 픽셀 복사가 끝나는 즉시 다음 카드가 캡처할 수 있게 슬롯을 넘긴다.
      releaseCaptureSlot(ownedSlot.token);
      if (mounted.current) {
        setCaptureSlot((current) => current === ownedSlot ? null : current);
      }

      phase = "encode";
      const blob = await withTimeout(
        createCanonicalMapThumbnailBlob(snapshot),
        MAP_THUMBNAIL_PROCESS_TIMEOUT_MS,
        "map-thumbnail/encode-timeout",
      );
      const imageBase64 = await blobToBase64(blob);

      phase = "prepare";
      const expectedHeadRevision = revisionState.kind === "managed"
        ? revisionState.headRevision
        : undefined;
      const prepared = await prepareActivityMapThumbnailUpload(
        activityId,
        canonicalFileName,
        expectedHeadRevision,
      );
      if (prepared.expectedFileName !== canonicalFileName) {
        throw new Error("map-thumbnail/stale-prepare");
      }
      if (expectedHeadRevision != null && prepared.expectedHeadRevision !== expectedHeadRevision) {
        throw new Error("map-thumbnail/stale-prepare");
      }

      if (activeCanonicalKey.current !== captureIdentity) return;
      if (!mounted.current) return;
      phase = "finalize";
      const finalized = await finalizeActivityMapThumbnailUpload(
        activityId,
        canonicalFileName,
        imageBase64,
        expectedHeadRevision,
      );
      if (activeCanonicalKey.current !== captureIdentity) return;
      if (!mounted.current) return;
      setImageUrl(finalized.mapImageUrl);
    } catch (err) {
      if (shouldReportMapCaptureError(err)) {
        logClientError("ActivityRouteThumbnail.captureMap", err, { activityId, phase });
      }
    } finally {
      releaseCaptureSlot(ownedSlot.token);
      if (mounted.current) {
        setCaptureSlot((current) => current === ownedSlot ? null : current);
      }
    }
  }, [activityId, canonicalFileName, captureIdentity, captureSlot, needsCapture, revisionState]);

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
        {captureSlot && renderCaptureViewport()}
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
      {captureSlot && renderCaptureViewport()}
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
            pixelRatio={MAP_THUMBNAIL_PIXEL_RATIO}
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
  revisionIdentity: string;
}

export type ActivityMapThumbnailRevision =
  | { kind: "legacy" }
  | { kind: "managed"; headRevision: number; selectedRevision: number }
  | { kind: "invalid" };

export function resolveActivityMapThumbnailRevision(
  contentRevision: unknown,
  contentSelectedRevision: unknown,
): ActivityMapThumbnailRevision {
  const hasHead = contentRevision != null;
  const hasSelected = contentSelectedRevision != null;
  if (!hasHead && !hasSelected) return { kind: "legacy" };
  if (!Number.isSafeInteger(contentRevision)
    || !Number.isSafeInteger(contentSelectedRevision)
    || (contentRevision as number) < 0
    || (contentSelectedRevision as number) < 0
    || (contentSelectedRevision as number) > (contentRevision as number)) {
    return { kind: "invalid" };
  }
  return {
    kind: "managed",
    headRevision: contentRevision as number,
    selectedRevision: contentSelectedRevision as number,
  };
}

export async function getPolylineHash(polyline: string): Promise<string> {
  const source = `${MAP_THUMBNAIL_RENDER_VERSION}\0${polyline.trim()}`;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getCanonicalMapThumbnailFileName(
  activityId: string,
  polyline: string,
  selectedRevision?: number,
): Promise<string> {
  const sourceHash = await getPolylineHash(polyline);
  const revisionSuffix = selectedRevision == null ? "" : `.r${selectedRevision}`;
  return `${activityId}${revisionSuffix}.${MAP_THUMBNAIL_RENDER_VERSION}-${sourceHash.slice(0, 16)}.webp`;
}

async function deriveCanonicalMapThumbnailKey(
  activityId: string,
  sourcePolyline: string,
  revision: ActivityMapThumbnailRevision,
): Promise<CanonicalMapThumbnailKey | null> {
  if (revision.kind === "invalid") return null;
  const sourceHash = await getPolylineHash(sourcePolyline);
  const revisionIdentity = revision.kind === "managed"
    ? `managed:${revision.headRevision}:${revision.selectedRevision}`
    : revision.kind;
  const revisionSuffix = revision.kind === "managed" ? `.r${revision.selectedRevision}` : "";
  return {
    activityId,
    sourcePolyline,
    sourceHash,
    fileName: `${activityId}${revisionSuffix}.${MAP_THUMBNAIL_RENDER_VERSION}-${sourceHash.slice(0, 16)}.webp`,
    revisionIdentity,
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

interface CanonicalMapThumbnailCrop {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
}

/**
 * Mapbox GL은 fractional CSS viewport를 올림한 뒤 DPR을 곱해 backing canvas를 만든다.
 * 캡처 DPR을 2로 낮추는 시도가 통하지 않는 기기(예: DPR 3 iOS Safari)도 있으므로,
 * canonical 종횡비를 유지한 중앙 영역을 잡아 고정 해상도로 축소한다.
 * 1 logical px 반올림을 넘는 종횡비 어긋남만 fail-closed한다.
 */
export function getCanonicalMapThumbnailCrop(
  canvasWidth: number,
  canvasHeight: number,
): CanonicalMapThumbnailCrop {
  if (
    !Number.isInteger(canvasWidth) ||
    !Number.isInteger(canvasHeight) ||
    canvasWidth < MAP_THUMBNAIL_WIDTH ||
    canvasHeight < MAP_THUMBNAIL_HEIGHT
  ) {
    throw new Error(`map-thumbnail/canvas-too-small:${canvasWidth}x${canvasHeight}`);
  }

  // 실제 캡처 DPR — 두 축 모두를 덮는 정수 배율. 요청한 2를 무시하는 기기는 3(iOS)으로 잡힌다.
  const capturedPixelRatio = Math.floor(Math.min(
    canvasWidth / MAP_THUMBNAIL_VIEWPORT_WIDTH,
    canvasHeight / MAP_THUMBNAIL_VIEWPORT_HEIGHT,
  ));
  const scale = capturedPixelRatio / MAP_THUMBNAIL_PIXEL_RATIO;
  const sourceWidth = MAP_THUMBNAIL_WIDTH * scale;
  const sourceHeight = MAP_THUMBNAIL_HEIGHT * scale;
  const extraWidth = canvasWidth - sourceWidth;
  const extraHeight = canvasHeight - sourceHeight;
  // 남는 폭은 1 logical px 반올림(= DPR device px)까지만. 그 이상이면 다른 뷰포트에서 찍힌 캔버스다.
  if (extraWidth > capturedPixelRatio || extraHeight > capturedPixelRatio) {
    throw new Error(`map-thumbnail/canvas-size-invalid:${canvasWidth}x${canvasHeight}`);
  }

  return {
    sourceX: extraWidth / 2,
    sourceY: extraHeight / 2,
    sourceWidth,
    sourceHeight,
  };
}

export function copyCanonicalMapThumbnailCanvas(mapCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const crop = getCanonicalMapThumbnailCrop(mapCanvas.width, mapCanvas.height);
  const output = document.createElement("canvas");
  output.width = MAP_THUMBNAIL_WIDTH;
  output.height = MAP_THUMBNAIL_HEIGHT;
  const context = output.getContext("2d");
  if (!context) throw new Error("map-thumbnail/canvas-context-unavailable");

  // DPR 3 캡처는 canonical 해상도로 축소되므로 다운스케일 품질을 명시한다.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    mapCanvas,
    crop.sourceX,
    crop.sourceY,
    crop.sourceWidth,
    crop.sourceHeight,
    0,
    0,
    MAP_THUMBNAIL_WIDTH,
    MAP_THUMBNAIL_HEIGHT,
  );
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
  expectedHeadRevision?: number,
): Promise<{ expectedFileName: string; expectedHeadRevision?: number }> {
  return invokeMapThumbnailCoordinator<
    { activityId: string; expectedFileName: string; expectedHeadRevision?: number },
    { expectedFileName: string; expectedHeadRevision?: number }
  >("prepareActivityMapThumbnailUpload", {
    activityId,
    expectedFileName,
    ...(expectedHeadRevision != null ? { expectedHeadRevision } : {}),
  });
}

async function finalizeActivityMapThumbnailUpload(
  activityId: string,
  expectedFileName: string,
  imageBase64: string,
  expectedHeadRevision?: number,
): Promise<{ mapImageUrl: string }> {
  const data = await invokeMapThumbnailCoordinator<
    { activityId: string; expectedFileName: string; imageBase64: string; expectedHeadRevision?: number },
    { mapImageUrl: string }
  >("finalizeActivityMapThumbnailUpload", {
    activityId,
    expectedFileName,
    imageBase64,
    ...(expectedHeadRevision != null ? { expectedHeadRevision } : {}),
  });
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
  return invokeMapThumbnailCoordinatorWithRetry(
    async (forceRefresh) => {
      // enforceAppCheck callable과 auth 직후 캡처가 경쟁하지 않도록 token 준비를 직접 보장한다.
      await ensureAppCheckReady(forceRefresh);
      const callable = httpsCallable<TInput, TOutput>(functions, name);
      return (await callable(payload)).data;
    },
  );
}

export async function invokeMapThumbnailCoordinatorWithRetry<T>(
  operation: (forceAppCheckRefresh: boolean) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await operation(attempt === 1);
    } catch (error) {
      lastError = error;
      if (attempt > 0 || !isMapThumbnailCoordinatorRetryable(error)) break;
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

export function isMapThumbnailCoordinatorRetryable(error: unknown): boolean {
  if (isAppCheckRetryable(error)) return true;
  const code = getErrorCode(error)?.toLowerCase() ?? "";
  return code === "functions/internal"
    || code === "functions/unavailable"
    || code === "functions/deadline-exceeded";
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
