import { auth, getAppCheckToken } from "./firebase";
import { getRuntimeConfig } from "./runtimeConfig";
import { CoachClientError } from "./coachClient";
import {
  parseTodayTrainingDecisionProjection,
  type TodayTrainingDecisionProjection,
} from "./trainingDecisionContract";

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
  let response: Response;
  try {
    response = await fetch(endpoint(path), {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        ...(appCheckToken ? { "X-Firebase-AppCheck": appCheckToken } : {}),
        ...init?.headers,
      },
    });
  } catch (cause) {
    throw new CoachClientError("transport", "NETWORK_ERROR", { cause });
  }
  const payload: unknown = await response.json().catch(() => ({}));
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
    return parseTodayTrainingDecisionProjection(await request(
      `/training-decisions/today?discipline=${encodeURIComponent(discipline)}`,
      { method: "GET", signal },
    ));
  } catch (cause) {
    if (cause instanceof CoachClientError) throw cause;
    throw new CoachClientError("contract", "INVALID_TRAINING_DECISION", { cause });
  }
}
