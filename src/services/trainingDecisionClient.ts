import { auth, getAppCheckToken } from "./firebase";
import { getRuntimeConfig } from "./runtimeConfig";
import { CoachClientError } from "./coachClient";
import {
  parseTodayTrainingDecisionProjection,
  type TodayTrainingDecisionProjection,
} from "./trainingDecisionContract";

const DECISION_REQUEST_TIMEOUT_MS = 15_000;

function endpoint(path: string): string {
  const base = getRuntimeConfig().aiApiBase;
  if (!base) throw new CoachClientError("configuration", "AI_API_BASE_MISSING");
  if (!base.startsWith("https://")) throw new CoachClientError("configuration", "AI_API_BASE_INVALID");
  return `${base.replace(/\/$/u, "")}/v1/coach${path}`;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new CoachClientError("auth", "SIGN_IN_REQUIRED");
  const appCheckToken = await getAppCheckToken();
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
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new CoachClientError(response.ok ? "contract" : "http", `INVALID_JSON_HTTP_${response.status}`, { cause });
  }
  if (!response.ok) {
    const code = payload && typeof payload === "object" && "error" in payload
      && payload.error && typeof payload.error === "object" && "code" in payload.error
      ? String(payload.error.code) : `HTTP_${response.status}`;
    throw new CoachClientError("http", code);
  }
  return payload;
}

export async function getTodayTrainingDecision(discipline: "bike" | "run" | "swim", signal?: AbortSignal): Promise<TodayTrainingDecisionProjection> {
  try {
    const decision = parseTodayTrainingDecisionProjection(await request(
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
