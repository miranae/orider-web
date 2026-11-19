import { useEffect, useRef } from "react";
import { track } from "../services/analytics";
import { logClientError } from "../services/errorLogger";
/** First usable page data, separately from route shell paint. No paths or user/document IDs are sent. */
export function usePageDataTiming(page: "dashboard" | "activity", key: string, loading: boolean, ready: boolean, failed: boolean) {
  const state = useRef({ key, start: performance.now(), reported: false });
  if (state.current.key !== key) state.current = { key, start: performance.now(), reported: false };
  useEffect(() => {
    if (loading || !ready && !failed || state.current.reported) return;
    const current = state.current;
    let secondFrame: number | undefined;
    let cancelled = false;
    const frame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(() => {
      if (cancelled || state.current !== current || current.reported) return;
      current.reported = true;
      try {
        track("page_data_ready", { page, duration_ms: Math.round(performance.now() - current.start), outcome: failed ? "failed" : "ready" });
      } catch (error) { logClientError("pageDataTiming.track", error, { page }); }
    }); });
    return () => { cancelled = true; cancelAnimationFrame(frame); if (secondFrame !== undefined) cancelAnimationFrame(secondFrame); };
  }, [page, key, loading, ready, failed]);
}
