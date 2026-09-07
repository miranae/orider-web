import { SDK_VERSION } from "firebase/app";

export const FIRESTORE_B815_RECOVERY_SESSION_KEY = "orider.firestore.b815-recovery.v1";

export type FirestoreFatalErrorKind = "internal-get-type-error" | "b815" | "async-queue-failed";
export type FirestoreRecoveryAction =
  | "reload-ready"
  | "reload-pending"
  | "already-attempted"
  | "storage-unavailable"
  | "not-applicable";

export interface FirestoreRecoveryResult {
  kind: FirestoreFatalErrorKind | null;
  action: FirestoreRecoveryAction;
}

interface FirestoreRecoveryPreparationEnvironment {
  sessionStorage: Pick<Storage, "getItem" | "setItem">;
}

interface FirestoreRecoveryExecutionEnvironment {
  reload: () => void;
  schedule: (callback: () => void) => void;
}

let reloadPending = false;
let firstServerSuccessAt: number | null = null;

/** 기존 읽기의 서버 확인만으로 복구를 재무장한다. 시간 경과만으로는 마커를 지우지 않는다. */
export function noteFirestoreServerSuccess(
  metadata: { fromCache: boolean; hasPendingWrites: boolean } | undefined,
  environment?: { sessionStorage: Pick<Storage, "getItem" | "removeItem"> },
): void {
  if (reloadPending || metadata?.fromCache !== false || metadata.hasPendingWrites !== false) return;
  try {
    const storage = environment?.sessionStorage ?? (typeof window !== "undefined" ? window.sessionStorage : null);
    if (!storage || storage.getItem(FIRESTORE_B815_RECOVERY_SESSION_KEY) !== "1") {
      firstServerSuccessAt = null;
      return;
    }
    const now = Date.now();
    if (firstServerSuccessAt === null) {
      firstServerSuccessAt = now;
    } else if (now - firstServerSuccessAt >= 60_000) {
      storage.removeItem(FIRESTORE_B815_RECOVERY_SESSION_KEY);
      firstServerSuccessAt = null;
    }
  } catch {
    firstServerSuccessAt = null;
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = "cause" in error ? error.cause : undefined;
    return cause == null ? error.message : `${error.message}\n${errorText(cause)}`;
  }
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/** Firestore가 재사용 불가능한 AsyncQueue 상태에 진입했는지 부작용 없이 판별한다. */
export function classifyFirestoreFatalError(error: unknown): FirestoreFatalErrorKind | null {
  const message = errorText(error);
  const isTypeError = error instanceof TypeError
    || /^(?:Uncaught\s+)?TypeError:/i.test(message)
    || (error != null
      && typeof error === "object"
      && "name" in error
      && String((error as { name: unknown }).name) === "TypeError");
  // Firestore 12.16.0의 내부 인덱스 조회 결과를 구조 분해하는 경로에서 먼저 발생한
  // 오류다. 이 예외 뒤 AsyncQueue가 b815로 poison되므로 후속 assertion을 기다리지 않는다.
  // 일반적인 `x.get is not a function`과 구분하기 위해 Chrome의 결합 문구 전체를 요구한다.
  if (
    isTypeError
    && /^(?:(?:Uncaught\s+)?TypeError:\s*)?n\.tc\.get is not a function or its return value is not iterable$/.test(message)
  ) {
    return "internal-get-type-error";
  }
  if (/INTERNAL ASSERTION FAILED[\s\S]*\(ID:\s*b815\)/i.test(message)) return "b815";
  if (/AsyncQueue is already failed/i.test(message)) return "async-queue-failed";
  return null;
}

/** ErrorEvent처럼 오류 객체와 별도 message를 주는 경우 모든 후보에서 fatal 오류를 찾는다. */
export function findFirestoreFatalError(...candidates: unknown[]): unknown | null {
  for (const candidate of candidates) {
    if (classifyFirestoreFatalError(candidate)) return candidate;
  }
  return null;
}

/** 세션 마커를 먼저 기록하고 reload 필요 여부를 결정한다. 이 단계에서는 이동하지 않는다. */
export function prepareFirestoreSessionRecovery(
  error: unknown,
  environment?: FirestoreRecoveryPreparationEnvironment,
): FirestoreRecoveryResult {
  const kind = classifyFirestoreFatalError(error);
  if (!kind) return { kind: null, action: "not-applicable" };
  firstServerSuccessAt = null;
  if (reloadPending) return { kind, action: "reload-pending" };

  let sessionStorage = environment?.sessionStorage ?? null;
  if (!sessionStorage && typeof window !== "undefined") {
    try {
      sessionStorage = window.sessionStorage;
    } catch {
      return { kind, action: "storage-unavailable" };
    }
  }
  if (!sessionStorage) return { kind, action: "storage-unavailable" };

  try {
    if (sessionStorage.getItem(FIRESTORE_B815_RECOVERY_SESSION_KEY) === "1") {
      return { kind, action: "already-attempted" };
    }
    // reload 전에 기록해야 새 문서에서도 같은 오류로 무한 새로고침하지 않는다.
    sessionStorage.setItem(FIRESTORE_B815_RECOVERY_SESSION_KEY, "1");
  } catch {
    // 세션 경계를 보장할 수 없으면 새로고침하지 않고 기존 오류 UI로 넘긴다.
    return { kind, action: "storage-unavailable" };
  }

  reloadPending = true;
  return { kind, action: "reload-ready" };
}

/** 로깅이 끝난 뒤 호출한다. 현재 스택을 벗어난 다음에만 실제 navigation을 수행한다. */
export function executeFirestoreSessionRecovery(
  result: FirestoreRecoveryResult,
  environment?: FirestoreRecoveryExecutionEnvironment,
): void {
  if (result.action !== "reload-ready") return;

  const browserEnvironment = environment ?? (
    typeof window !== "undefined"
      ? {
          reload: () => window.location.reload(),
          schedule: (callback: () => void) => { window.setTimeout(callback, 0); },
        }
      : null
  );
  if (!browserEnvironment) return;

  browserEnvironment.schedule(() => {
    try {
      browserEnvironment.reload();
    } catch {
      // 마커는 유지해 reload 자체가 거부된 환경에서도 반복 navigation을 막는다.
      reloadPending = false;
    }
  });
}

export function shouldAbortForFirestoreRecovery(result: FirestoreRecoveryResult): boolean {
  return result.action === "reload-ready" || result.action === "reload-pending";
}

export function firestoreRecoveryLogContext(result: FirestoreRecoveryResult): Record<string, unknown> {
  return {
    firebaseSdkVersion: SDK_VERSION,
    pageVisibility: typeof document === "undefined" ? "unknown" : document.visibilityState,
    firestoreRecoveryKind: result.kind,
    firestoreRecoveryAction: result.action,
  };
}

export function __resetFirestoreSessionRecoveryForTests(): void {
  reloadPending = false;
  firstServerSuccessAt = null;
}
