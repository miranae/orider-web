/**
 * 느린 케이스 자동 기록 — 재현 어려운 슬로우다운 사후 분석용.
 *
 * 두 가지 이벤트 발사:
 *  - `slow_request` — fetch 응답 >= SLOW_FETCH_MS (기본 2000ms) 인 경우
 *  - `slow_page`    — web-vitals 메트릭 rating==="poor" 인 경우 (webVitals.ts 에서 호출)
 *
 * 공통 컨텍스트(현재 path, 네트워크 타입/RTT/다운링크, 디바이스 메모리)를 함께 기록해
 * BigQuery 에서 "특정 시각 / 특정 path / 4G 가 아닌 환경" 같은 조건부 집계 가능.
 *
 * fetch 패치는 idempotent — 모듈 로드 시 install 1회.
 *
 * 설치 타이밍 주의: 일부 SDK (Firestore long-polling 등)는 모듈 로드 시 fetch 참조를
 * 클로저에 캡쳐할 수 있음. `installSlowFetchTracker()` 는 Firebase init **이전**에
 * 호출해야 SDK 의 fetch 도 wrap 됨. analytics 가 아직 준비 안 됐어도 track() 이
 * 자체 null-guard 하므로 안전.
 *
 * 노이즈 감소 가드:
 *  - AbortError (라우팅 cancel, React Query 취소 등) → slow_request 미발사
 *  - 분당 토큰버킷 (RATE_LIMIT_PER_MIN) 로 폭주 케이스 방어
 *  - slow_page 는 (metric.name, page_path) 별 1회만 발사 — INP 변동 보고 중복 제거
 */

import { track } from "./analytics";

const SLOW_FETCH_MS = 2000;
const RATE_LIMIT_PER_MIN = 10;

export interface NetworkInfo {
  effective_type?: string;
  rtt_ms?: number;
  downlink_mbps?: number;
  save_data?: boolean;
}

interface NavigatorConnection {
  effectiveType?: string;
  rtt?: number;
  downlink?: number;
  saveData?: boolean;
}

export function readNetwork(): NetworkInfo {
  const nav = navigator as Navigator & { connection?: NavigatorConnection };
  const c = nav.connection;
  if (!c) return {};
  return {
    effective_type: c.effectiveType,
    rtt_ms: c.rtt,
    downlink_mbps: c.downlink,
    save_data: c.saveData,
  };
}

export function readDeviceMemory(): number | undefined {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return nav.deviceMemory;
}

/**
 * URL 정규화 — UID/문서ID/토큰 같은 가변·민감 세그먼트를 placeholder 로 치환해
 * 카디널리티 안정화 + PII 누수 방지. host 는 별도 보관.
 *
 * 처리 순서:
 *  1. decodeURIComponent — Firebase Storage 의 `users%2F<uid>%2Favatar.png` 같이
 *     URL 인코딩된 슬래시를 풀어 세그먼트로 다시 split.
 *  2. 세그먼트별 분류:
 *     - `@` 포함  → `:email-like`  (PII 가드)
 *     - 60자+ 에 `.` 포함 → `:token`    (JWT 추정)
 *     - 순수 숫자  → `:num`
 *     - `strava_<digits>` → `strava_:id`
 *     - 12자+ 영숫자/하이픈/언더스코어 → `:id`
 *     - 12자+ hex → `:id` (위 영숫자 정규식이 흡수하지만 별도 가드)
 *     - 그 외 → 원본
 *  3. 8 세그먼트 cap, 최종 path 100자 cap (GA4 string param 제약).
 */
function sanitizeSegment(seg: string): string {
  if (seg.includes("@")) return ":email-like";
  if (seg.length >= 60 && seg.includes(".")) return ":token";
  if (/^\d+$/.test(seg)) return ":num";
  if (/^strava_\d+$/i.test(seg)) return "strava_:id";
  if (/^[a-zA-Z0-9_-]{12,}$/.test(seg)) return ":id";
  return seg;
}

function sanitizeUrl(rawUrl: string): { host: string; path: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl, window.location.origin);
  } catch {
    return { host: "invalid", path: rawUrl.slice(0, 100) };
  }
  let pathname = parsed.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    /* malformed % escape — 원본 유지 */
  }
  const segments = pathname.split("/").filter(Boolean).slice(0, 8);
  const normalized = segments.map(sanitizeSegment);
  const path = ("/" + normalized.join("/")).slice(0, 100);
  return { host: parsed.host, path };
}

// 분당 토큰버킷 — slow_request 폭주(재시도 루프, 오프라인) 시 GA4 cost 방어.
let bucketTokens = RATE_LIMIT_PER_MIN;
let bucketResetAt = 0;

function consumeRateLimitToken(): boolean {
  const now = Date.now();
  if (now >= bucketResetAt) {
    bucketTokens = RATE_LIMIT_PER_MIN;
    bucketResetAt = now + 60_000;
  }
  if (bucketTokens <= 0) return false;
  bucketTokens -= 1;
  return true;
}

const reportedSlowPages = new Set<string>();

/** 공개 헬퍼 — webVitals.ts 가 poor 메트릭일 때 호출. */
export function reportSlowPage(metricName: string, valueMs: number, pagePath: string): void {
  const dedupKey = `${metricName}::${pagePath}`;
  if (reportedSlowPages.has(dedupKey)) return;
  reportedSlowPages.add(dedupKey);
  const net = readNetwork();
  try {
    track("slow_page", {
      metric_name: metricName,
      value_ms: Math.round(valueMs),
      page_path: pagePath,
      device_memory_gb: readDeviceMemory(),
      ...net,
    });
  } catch (e) {
    if (import.meta.env.DEV) console.warn("slow_page track failed", e);
  }
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const raw = init?.method ?? (input instanceof Request ? input.method : "GET");
  return raw.toUpperCase();
}

let installed = false;

/** App 부팅 시 1회 호출. Firebase init **이전** 호출 권장. */
export function installSlowFetchTracker(): void {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const start = performance.now();
    let res: Response | undefined;
    let errorName: string | undefined;
    try {
      res = await originalFetch(input, init);
      return res;
    } catch (err) {
      errorName = err instanceof Error ? err.name : "unknown";
      throw err;
    } finally {
      const duration = performance.now() - start;
      // AbortError 는 사용자 의도 취소(라우팅·React Query) — 노이즈 제외.
      if (duration >= SLOW_FETCH_MS && errorName !== "AbortError") {
        if (consumeRateLimitToken()) {
          const rawUrl =
            typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          const { host, path } = sanitizeUrl(rawUrl);
          const net = readNetwork();
          try {
            track("slow_request", {
              url_host: host,
              url_path: path,
              method: resolveMethod(input, init),
              duration_ms: Math.round(duration),
              status: res?.status ?? 0,
              ok: res?.ok ?? false,
              error_name: errorName,
              page_path: window.location.pathname,
              device_memory_gb: readDeviceMemory(),
              ...net,
            });
          } catch (e) {
            if (import.meta.env.DEV) console.warn("slow_request track failed", e);
          }
        }
      }
    }
  };
}
