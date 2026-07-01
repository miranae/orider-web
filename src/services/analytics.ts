/**
 * Analytics helper — Firebase Analytics 의 logEvent / setUserId / setUserProperties 래퍼.
 *
 * 호출 사이트에서 analytics null 체크를 반복하지 않도록 wrapper 제공.
 * 에뮬레이터 모드에서는 analytics 가 끝까지 null 이므로 모든 호출이 no-op.
 *
 * **지연 초기화 (perf, 2026-06):** Analytics(gtag.js + Firebase Installations)는 콜드
 * 첫 로드 임계 경로에서 빠지고 main.tsx 가 LCP 이후 initAnalytics() 로 켠다. init 전
 * 호출된 이벤트/사용자 속성은 아래 큐에 보관했다가 init 시 flush — 이벤트 유실 없음.
 *
 * 이벤트 이름 컨벤션: snake_case (Firebase Analytics 표준).
 * - kudos_tap, comment_send, segment_create_submit, sport_switch 등
 *
 * payload 필드 컨벤션: camelCase. PII (이메일/실명) 절대 금지 — uid 만 사용.
 */
import {
  getAnalytics,
  logEvent as fbLogEvent,
  setUserId as fbSetUserId,
  setUserProperties as fbSetUserProperties,
  type Analytics,
} from "firebase/analytics";
import { getFirebaseApp } from "./firebase";
import { isEmulatorRuntime } from "./runtimeConfig";

let analytics: Analytics | null = null;

// init 전 발생한 호출 보관 큐 (init 시 순서대로 flush).
const pendingEvents: Array<{ name: string; params?: Record<string, unknown> }> = [];
let pendingUserId: string | null | undefined = undefined; // undefined = 미설정
let pendingUserProps: Record<string, string> | null = null;

/**
 * Analytics 지연 초기화 — main.tsx 가 LCP 이후 idle 시점에 1회 호출.
 * 에뮬레이터 모드면 영구 비활성(큐도 비움). 재호출 idempotent.
 */
export function initAnalytics(): void {
  if (analytics) return;
  if (isEmulatorRuntime()) {
    // 에뮬레이터: analytics 영구 비활성 → 큐 폐기(메모리 누수 방지).
    pendingEvents.length = 0;
    pendingUserId = undefined;
    pendingUserProps = null;
    return;
  }
  const app = getFirebaseApp();
  if (!app) return; // initFirebase 전 — 다음 호출에서 재시도.

  analytics = getAnalytics(app);

  // 큐 flush — 사용자 속성 먼저, 그다음 이벤트(시간순).
  if (pendingUserId !== undefined) fbSetUserId(analytics, pendingUserId);
  if (pendingUserProps) fbSetUserProperties(analytics, pendingUserProps);
  for (const e of pendingEvents) fbLogEvent(analytics, e.name, e.params);
  pendingEvents.length = 0;
  pendingUserId = undefined;
  pendingUserProps = null;
}

export function track(eventName: string, params?: Record<string, unknown>): void {
  if (analytics) {
    fbLogEvent(analytics, eventName, params);
  } else if (!isEmulatorRuntime()) {
    pendingEvents.push({ name: eventName, params });
  }
}

export function setAnalyticsUserId(uid: string | null): void {
  if (analytics) {
    fbSetUserId(analytics, uid);
  } else if (!isEmulatorRuntime()) {
    pendingUserId = uid; // 최신값만 유지 (init 시 1회 반영).
  }
}

/** Firebase Analytics user properties — value 는 string 만 허용 (FA 표준). */
export function setAnalyticsUserProperties(props: Record<string, string>): void {
  if (analytics) {
    fbSetUserProperties(analytics, props);
  } else if (!isEmulatorRuntime()) {
    pendingUserProps = { ...(pendingUserProps ?? {}), ...props };
  }
}

/**
 * 활성화 funnel: 사용자별로 1회만 발사되는 마일스톤.
 *
 * 동일 step 이 여러 번 일어나도 첫 발생만 `activation_step` 이벤트로 기록 — 신규
 * 사용자의 "처음 X 까지 걸린 시간 / 도달률" 분석에 사용. uid 별로 localStorage
 * 키를 분리해 같은 디바이스에 여러 계정 로그인 시에도 잘못 dedup 되지 않음.
 *
 * 비로그인 (uid=null) 호출은 no-op — 익명 사용자의 funnel 은 추적 대상 아님.
 * dedup 은 localStorage 기반이라 analytics init 타이밍과 무관 — track() 큐로 안전 전송.
 */
export function trackActivationStep(
  uid: string | null,
  step: string,
  params?: Record<string, unknown>,
): void {
  if (!uid) return;
  const key = `orider.activation.${uid}.${step}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    // private mode / quota 초과 → dedup 포기. 적어도 한 번은 발사.
  }
  track("activation_step", { step, ...params });
}
