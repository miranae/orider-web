import { captureError } from "./sentry";
import { httpsCallable, type HttpsCallable } from "firebase/functions";
import { functions } from "./firebase";

/**
 * callable 은 호출 시점에 lazy 생성한다. 모듈 로드 시점에 만들면 main.tsx 의
 * initFirebase() 보다 먼저 평가돼 functions 가 undefined 인 채 캡쳐되고, 이후 호출이
 * 동기적으로 `Cannot read properties of undefined (reading '_url')` 를 던져
 * 에러 로깅이 매번 크래시 → Sentry 폭주(429)하던 회귀가 있었다. (errorLogger 는
 * App→hooks 경유로 init 전에 import 된다.) functions 는 ESM live-binding 이라
 * init 후 호출 시점엔 정상 인스턴스로 보인다.
 */
let _logClientErrorFn: HttpsCallable<unknown, unknown> | null = null;
function getLogClientErrorFn(): HttpsCallable<unknown, unknown> | null {
  if (!_logClientErrorFn && functions) {
    _logClientErrorFn = httpsCallable(functions, "logClientError");
  }
  return _logClientErrorFn;
}

/**
 * 클라이언트 에러를 Sentry + 서버(error_logs)에 이중 기록.
 * **절대 throw 하지 않는다** — 로깅 실패가 앱을 깨뜨리거나 에러를 재귀 유발하지 않도록
 * 동기 throw 까지 try/catch 로 삼킨다.
 */
export function logClientError(
  source: string,
  error: unknown,
  context?: Record<string, unknown>
) {
  // Sentry 에 전송 (lazy-loaded, init 전이면 큐에 저장 → load 시 flush)
  captureError(
    error instanceof Error ? error : new Error(String(error)),
    { tags: { source }, extra: context }
  );

  // error_logs에도 기록 (백업). functions 미초기화 시 skip, 동기/비동기 실패 모두 흡수.
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  try {
    const fn = getLogClientErrorFn();
    if (!fn) return; // initFirebase 전 — 서버 로깅 skip (Sentry 큐로 충분)
    fn({ source, message, stack, context }).catch(() => {
      console.warn("[errorLogger] 서버 에러 로깅 실패:", message);
    });
  } catch {
    console.warn("[errorLogger] 서버 에러 로깅 동기 실패:", message);
  }
}
