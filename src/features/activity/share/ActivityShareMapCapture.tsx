import { forwardRef, Suspense, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { lazyWithRetry as lazy } from "../../../utils/lazyWithRetry";

const RouteMap = lazy(() => import("../../../components/RouteMap"));

const CAPTURE_WIDTH = 1080;
const CAPTURE_HEIGHT = 600;
const CAPTURE_TIMEOUT_MS = 8_000;

export interface ActivityShareMapCaptureHandle {
  capture: (signal?: AbortSignal) => Promise<HTMLCanvasElement | null>;
}

interface Props {
  enabled: boolean;
  track?: string | null;
}

/**
 * 피드 썸네일과 같은 RouteMap 렌더러를 공유 카드 해상도로 미리 렌더링한다.
 * Mapbox 캔버스를 직접 넘기지 않고 복사본을 만들어 다음 렌더에도 안전하게 사용한다.
 */
export const ActivityShareMapCapture = forwardRef<ActivityShareMapCaptureHandle, Props>(
  function ActivityShareMapCapture({ enabled, track }, ref) {
    const hostRef = useRef<HTMLDivElement>(null);
    const readyRef = useRef(false);
    const generationRef = useRef(0);
    const activeTrackRef = useRef<string | null>(null);
    const waitersRef = useRef(new Set<(ready: boolean) => void>());
    activeTrackRef.current = enabled && track ? track : null;

    const settleWaiters = useCallback((ready: boolean) => {
      for (const settle of waitersRef.current) settle(ready);
      waitersRef.current.clear();
    }, []);

    useEffect(() => {
      generationRef.current += 1;
      readyRef.current = false;
      settleWaiters(false);
    }, [enabled, settleWaiters, track]);

    useEffect(() => () => settleWaiters(false), [settleWaiters]);

    const handleMapLoad = useCallback(() => {
      if (!track || activeTrackRef.current !== track) return;
      readyRef.current = true;
      settleWaiters(true);
    }, [settleWaiters, track]);

    const waitUntilReady = useCallback((signal?: AbortSignal) => new Promise<boolean>((resolve) => {
      if (readyRef.current) return resolve(true);
      if (signal?.aborted) return resolve(false);

      let settled = false;
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        waitersRef.current.delete(finish);
        resolve(ready);
      };
      const abort = () => finish(false);
      const timeout = window.setTimeout(() => finish(false), CAPTURE_TIMEOUT_MS);
      signal?.addEventListener("abort", abort, { once: true });
      waitersRef.current.add(finish);
    }), []);

    useImperativeHandle(ref, () => ({
      capture: async (signal?: AbortSignal) => {
        if (!enabled || !track || signal?.aborted) return null;
        const generation = generationRef.current;
        if (!await waitUntilReady(signal) || signal?.aborted || generation !== generationRef.current) return null;

        const source = hostRef.current?.querySelector("canvas");
        if (!source || source.width === 0 || source.height === 0) return null;
        const copy = document.createElement("canvas");
        copy.width = source.width;
        copy.height = source.height;
        const context = copy.getContext("2d");
        if (!context) return null;
        try {
          context.drawImage(source, 0, 0);
          return copy;
        } catch {
          return null;
        }
      },
    }), [enabled, track, waitUntilReady]);

    if (!enabled || !track) return null;

    return (
      <div
        ref={hostRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          left: -10_000,
          top: 0,
          width: CAPTURE_WIDTH,
          height: CAPTURE_HEIGHT,
          opacity: 0,
          pointerEvents: "none",
        }}
      >
        <Suspense fallback={null}>
          <RouteMap
            key={track}
            polyline={track}
            height="w-full h-full"
            interactive={false}
            rounded={false}
            preserveDrawingBuffer
            pixelRatio={2}
            fitPadding={64}
            showRouteEndpoints
            onLoad={handleMapLoad}
          />
        </Suspense>
      </div>
    );
  },
);
