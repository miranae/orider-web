export const LIVE_VIEWER_RECOVERY_COOLDOWN_MS = 5 * 60 * 1000;

export type ViewerHeartbeatResult =
  | "sent"
  | "recovered"
  | "failed"
  | "cooldown"
  | "hidden"
  | "in-flight";

interface ViewerHeartbeatRunnerOptions {
  sendHeartbeat: () => Promise<unknown>;
  ensureAppCheckReady: (forceRefresh?: boolean) => Promise<void>;
  onError: (error: unknown, phase: "heartbeat" | "app-check-retry") => void;
  isVisible?: () => boolean;
  now?: () => number;
  cooldownMs?: number;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown; status?: unknown };
    return `${String(value.code ?? "")} ${String(value.message ?? "")} ${String(value.status ?? "")}`;
  }
  return String(error);
}

/** App Check 토큰을 강제 갱신한 뒤 한 번만 재시도할 수 있는 인증 오류인지 판별한다. */
export function isRecoverableViewerAuthError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  return text.includes("app-check")
    || text.includes("app check")
    || text.includes("unauthenticated")
    || /(^|\D)401(\D|$)/.test(text);
}

/**
 * 라이브 관전자 heartbeat를 직렬화하고 App Check 유실 시 한 번만 강제 갱신한다.
 * 실패가 계속되면 갱신과 로깅을 cooldown하여 30초 타이머가 401/429 폭주로 바뀌지 않는다.
 */
export function createViewerHeartbeatRunner(options: ViewerHeartbeatRunnerOptions) {
  const isVisible = options.isVisible ?? (() => typeof document === "undefined" || !document.hidden);
  const now = options.now ?? (() => Date.now());
  const cooldownMs = options.cooldownMs ?? LIVE_VIEWER_RECOVERY_COOLDOWN_MS;
  let inFlight = false;
  let forceRefreshBlockedUntil = 0;
  let heartbeatBlockedUntil = 0;
  let errorLogBlockedUntil = 0;

  const reportError = (error: unknown, phase: "heartbeat" | "app-check-retry") => {
    const current = now();
    if (current < errorLogBlockedUntil) return;
    errorLogBlockedUntil = current + cooldownMs;
    options.onError(error, phase);
  };

  const pulse = async (): Promise<ViewerHeartbeatResult> => {
    if (!isVisible()) return "hidden";
    if (inFlight) return "in-flight";
    if (now() < heartbeatBlockedUntil) return "cooldown";
    inFlight = true;

    try {
      try {
        await options.ensureAppCheckReady();
        await options.sendHeartbeat();
        return "sent";
      } catch (error) {
        const current = now();
        if (!isRecoverableViewerAuthError(error) || current < forceRefreshBlockedUntil) {
          if (isRecoverableViewerAuthError(error)) heartbeatBlockedUntil = forceRefreshBlockedUntil;
          reportError(error, "heartbeat");
          return "failed";
        }

        // 네트워크 호출 전에 차단 시간을 먼저 기록해 예외 경로에서도 무한 갱신을 막는다.
        forceRefreshBlockedUntil = current + cooldownMs;
        try {
          await options.ensureAppCheckReady(true);
          await options.sendHeartbeat();
          return "recovered";
        } catch (retryError) {
          heartbeatBlockedUntil = forceRefreshBlockedUntil;
          reportError(retryError, "app-check-retry");
          return "failed";
        }
      }
    } finally {
      inFlight = false;
    }
  };

  return { pulse };
}
