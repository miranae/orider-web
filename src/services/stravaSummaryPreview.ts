import { httpsCallable, httpsCallableFromURL, type Functions } from "firebase/functions";
import type { NarrativeLang } from "../hooks/useActivityNarrative";

export interface StravaSummaryPublishResult {
  status: "published" | "unchanged" | "queued" | "reauthorization-required" | "unavailable";
  reason?: string;
  phase?: "provisional" | "final";
  stravaActivityId?: string | number;
}
export type StravaSummaryPreview = {
  status: "ready";
  activityId: string;
  stravaActivityId: string;
  lang: NarrativeLang;
  shareText: string;
  summaryBlock: string;
  previewDigest: string;
  version: string | number;
  generatedAt: number;
  targetVerified: boolean;
  publishStatus: StravaSummaryPublishResult;
} | { status: "unavailable"; reason: string; stravaActivityId?: string; publishStatus?: StravaSummaryPublishResult };

type PreviewRequest = { activityId: string; lang: NarrativeLang; stravaActivityId?: string };

/** 로컬 검수용 읽기 요청만 허용한다. 게시·상태 조회의 전송 대상은 바꾸지 않는다. */
export function localStravaSummaryPreviewUrl(dev: boolean, hostname: string, configured?: string): string | null {
  const loopback = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!dev || !loopback.has(hostname) || !configured) return null;
  try {
    const url = new URL(configured);
    return url.protocol === "http:" && loopback.has(url.hostname) && url.pathname === "/stravaSummaryPreview"
      && !url.search && !url.hash && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

const configuredLocalPreviewUrl = () => localStravaSummaryPreviewUrl(import.meta.env.DEV,
  typeof window === "undefined" ? "" : window.location.hostname, import.meta.env.VITE_STRAVA_SUMMARY_PREVIEW_URL);

export const isLocalStravaSummaryPreview = () => configuredLocalPreviewUrl() != null;

export function requestStravaSummaryPreview(functions: Functions, request: PreviewRequest) {
  const localUrl = configuredLocalPreviewUrl();
  const callable = localUrl
    ? httpsCallableFromURL<PreviewRequest, StravaSummaryPreview>(functions, localUrl)
    : httpsCallable<PreviewRequest, StravaSummaryPreview>(functions, "stravaSummaryPreview");
  return callable(request);
}
