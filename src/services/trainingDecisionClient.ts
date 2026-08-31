import { auth, getAppCheckToken } from "./firebase";
import { getRuntimeConfig } from "./runtimeConfig";
import { CoachClientError } from "./coachClient";
import {
  parseTodayTrainingDecisionProjection,
  type TodayTrainingDecisionProjection,
} from "./trainingDecisionContract";

const DECISION_REQUEST_TIMEOUT_MS = 15_000;

export class TodayTrainingDecisionHttpError extends CoachClientError {
  constructor(code: string, public readonly status: number, public readonly retryAfterMs: number | null,
    options?: { cause?: unknown }) {
    super("http", code, options);
    this.name = "TodayTrainingDecisionHttpError";
  }
}

function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : null;
}

function endpoint(path: string): string {
  const base = getRuntimeConfig().aiApiBase;
  if (!base) throw new CoachClientError("configuration", "AI_API_BASE_MISSING");
  if (!base.startsWith("https://")) throw new CoachClientError("configuration", "AI_API_BASE_INVALID");
  return `${base.replace(/\/$/u, "")}/v1/coach${path}`;
}

export function assertTodayTrainingDecisionIdentity(expectedUid: string): void {
  const user = auth.currentUser;
  if (!user) throw new CoachClientError("auth", "SIGN_IN_REQUIRED");
  if (user.uid !== expectedUid) throw new CoachClientError("auth", "AUTH_IDENTITY_CHANGED");
}

function requireExpectedUser(expectedUid: string) {
  assertTodayTrainingDecisionIdentity(expectedUid);
  const user = auth.currentUser;
  // assert 직후 같은 synchronous turn 안에서는 uid가 일치하는 사용자가 존재한다.
  if (!user) throw new CoachClientError("auth", "SIGN_IN_REQUIRED");
  return user;
}

async function request(expectedUid: string, path: string, init?: RequestInit): Promise<unknown> {
  const user = requireExpectedUser(expectedUid);
  const idToken = await user.getIdToken();
  // getIdToken/App Check/fetch를 기다리는 동안 계정이 바뀌면 다른 사용자의 key에 결과를 넣지 않는다.
  requireExpectedUser(expectedUid);
  const appCheckToken = await getAppCheckToken();
  requireExpectedUser(expectedUid);
  const requestController = new AbortController();
  const callerSignal = init?.signal;
  const abortFromCaller = () => requestController.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeoutId = setTimeout(() => requestController.abort(new DOMException("Request timed out", "TimeoutError")),
    DECISION_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(endpoint(path), {
      ...init,
      signal: requestController.signal,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        ...(appCheckToken ? { "X-Firebase-AppCheck": appCheckToken } : {}),
        ...init?.headers,
      },
    });
  } catch (cause) {
    if (requestController.signal.aborted && !callerSignal?.aborted) {
      throw new CoachClientError("transport", "REQUEST_TIMEOUT", { cause });
    }
    throw new CoachClientError("transport", "NETWORK_ERROR", { cause });
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
  requireExpectedUser(expectedUid);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    if (!response.ok) {
      throw new TodayTrainingDecisionHttpError(
        `INVALID_JSON_HTTP_${response.status}`,
        response.status,
        parseRetryAfter(response.headers?.get("Retry-After") ?? null),
        { cause },
      );
    }
    throw new CoachClientError("contract", `INVALID_JSON_HTTP_${response.status}`, { cause });
  }
  requireExpectedUser(expectedUid);
  if (!response.ok) {
    const code = payload && typeof payload === "object" && "error" in payload
      && payload.error && typeof payload.error === "object" && "code" in payload.error
      ? String(payload.error.code) : `HTTP_${response.status}`;
    throw new TodayTrainingDecisionHttpError(code, response.status, parseRetryAfter(response.headers.get("Retry-After")));
  }
  return payload;
}

export async function getTodayTrainingDecision(expectedUid: string, discipline: "bike" | "run" | "swim", signal?: AbortSignal): Promise<TodayTrainingDecisionProjection> {
  try {
    const decision = parseTodayTrainingDecisionProjection(await request(expectedUid,
      `/training-decisions/today?discipline=${encodeURIComponent(discipline)}`,
      { method: "GET", signal },
    ));
    if (decision.discipline !== discipline || decision.targetDiscipline !== discipline) {
      throw new Error("training decision discipline mismatch");
    }
    return decision;
  } catch (cause) {
    if (cause instanceof CoachClientError) throw cause;
    throw new CoachClientError("contract", "INVALID_TRAINING_DECISION", { cause });
  }
}
