import { logClientError } from "./errorLogger";

export type CoachReadErrorKind = "verification" | "verificationWait" | "transport" | "auth" | "service" | "unknown";
type ReadOperation = "history-list" | "history-detail" | "history-quota" | "launcher-initial";

const KNOWN_CODES: Record<string, CoachReadErrorKind> = {
  "app-check/token-timeout": "verification",
  "appCheck/recaptcha-error": "verification",
  "appCheck/fetch-network-error": "verification",
  "appCheck/fetch-status-error": "verification",
  "appCheck/fetch-parse-error": "verification",
  "appCheck/initial-throttle": "verificationWait",
  "appCheck/throttled": "verificationWait",
  "auth/network-request-failed": "transport",
  COACH_CONSENT_NETWORK_ERROR: "transport",
  NETWORK_ERROR: "transport",
  SIGN_IN_REQUIRED: "auth",
  "auth/user-token-expired": "auth",
  "auth/invalid-user-token": "auth",
  HTTP_429: "service",
  HTTP_500: "service",
  HTTP_502: "service",
  HTTP_503: "service",
  HTTP_504: "service",
};

export function classifyCoachReadError(error: unknown): { kind: CoachReadErrorKind; code: string } {
  const value = error !== null && typeof error === "object" ? error as { code?: unknown; message?: unknown; name?: unknown; kind?: unknown } : {};
  for (const candidate of [value.code, value.message]) {
    if (typeof candidate === "string" && Object.prototype.hasOwnProperty.call(KNOWN_CODES, candidate)) {
      const kind = KNOWN_CODES[candidate];
      if (kind) return { kind, code: candidate };
    }
  }
  if (value.name === "CoachHistoryTransportError") {
    return { kind: "transport", code: "COACH_HISTORY_TRANSPORT_UNKNOWN" };
  }
  if (value.name === "CoachClientError" && value.kind === "transport") {
    return { kind: "transport", code: "NETWORK_ERROR" };
  }
  return { kind: "unknown", code: "unknown" };
}

/** 예외 메시지·cause에는 URL/인증 정보가 섞일 수 있어 허용한 분류만 기록한다. */
export function reportCoachReadError(operation: ReadOperation, error: unknown): CoachReadErrorKind {
  const failure = classifyCoachReadError(error);
  logClientError(`Coach.read.${operation}`, new Error(`coach-read/${failure.kind}`), { operation, ...failure });
  return failure.kind;
}
