import { auth, functions, ensureAppCheckReady } from "./firebase";
import { httpsCallable, type Functions } from "firebase/functions";
import type { Auth } from "firebase/auth";
import { getRuntimeConfig } from "./runtimeConfig";
import type { RunningBestEffortsFacts } from "@shared/types/running-best-efforts-facts";
import { RUN_DISTANCE_M } from "@shared/types/personal-records";
import type { ActivityStreams } from "@shared/types";

export type PersonalApiScope =
  | "profile:read"
  | "activities:read"
  | "streams:read"
  | "fitness:read"
  | "exports:read";

export interface PersonalApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scopes: PersonalApiScope[];
  rateLimitTier?: string;
  createdAt?: number;
  lastUsedAt?: number;
}

export interface CreatedPersonalApiKey {
  key: string;
  name: string;
  prefix: string;
  scopes: PersonalApiScope[];
}

async function apiFetch<T>(authInstance: Auth, path: string, init?: RequestInit): Promise<T> {
  const token = await authInstance.currentUser?.getIdToken();
  if (!token) throw new Error("SIGN_IN_REQUIRED");
  const apiBase = (getRuntimeConfig().personalApiBase || "").replace(/\/$/, "");

  const response = await fetch(`${apiBase}/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export async function listPersonalApiKeys(): Promise<PersonalApiKeySummary[]> {
  const payload = await apiFetch<{ data?: PersonalApiKeySummary[] }>(auth, "/developer/api-keys");
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function createPersonalApiKey(input: {
  name: string;
  scopes: PersonalApiScope[];
}): Promise<CreatedPersonalApiKey> {
  const payload = await apiFetch<{ data?: CreatedPersonalApiKey }>(auth, "/developer/api-keys", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!payload.data?.key || !payload.data.prefix) {
    throw new Error("INVALID_PERSONAL_API_RESPONSE");
  }
  return payload.data;
}

export async function revokePersonalApiKey(keyId: string): Promise<void> {
  await apiFetch<{ data: { revoked: boolean } }>(auth, `/developer/api-keys/${encodeURIComponent(keyId)}`, {
    method: "DELETE",
  });
}

export async function getActivityStreams(activityId: string): Promise<ActivityStreams> {
  return getActivityStreamsWithAuth(auth, activityId);
}

export async function getActivityStreamsWithAuth(
  authInstance: Auth,
  activityId: string,
  services?: { functions: Functions; ensureAppCheckReady: (forceRefresh?: boolean) => Promise<void> },
  options?: { includeRunEffortFacts?: boolean },
): Promise<ActivityStreams> {
  if (getRuntimeConfig().appEnvironment === "stage") {
    const provider = services ?? { functions, ensureAppCheckReady };
    const uid = authInstance.currentUser?.uid;
    if (!uid) throw new Error("SIGN_IN_REQUIRED");
    if (provider.functions.app !== authInstance.app || provider.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("stage/callable-context-mismatch");
    await provider.ensureAppCheckReady();
    if (authInstance.currentUser?.uid !== uid) throw new Error("account_changed");
    const response = await httpsCallable<{ activityId: string; includeRunEffortFacts?: boolean }, {
      activityId: string; state: "available" | "pending" | "changed_input" | "unavailable";
      runningBestEffortsFacts?: RunningBestEffortsFacts;
      streamInputRevision: string | null; sourceLayer: "raw_parts" | "api_streams" | null; streams: ActivityStreams | null;
    }>(provider.functions, "getActivityStreams")({ activityId, ...(options?.includeRunEffortFacts === true ? { includeRunEffortFacts: true } : {}) });
    if (authInstance.currentUser?.uid !== uid) throw new Error("account_changed");
    const data = response.data;
    if (data?.activityId !== activityId || !["available", "pending", "changed_input", "unavailable"].includes(data.state)) throw new Error("INVALID_PERSONAL_API_RESPONSE");
    if (data.state === "pending") throw new Error("활동 스트림을 준비 중입니다.");
    if (data.state === "changed_input") throw new Error("활동 데이터가 변경되었습니다. 새로고침 후 다시 확인해 주세요.");
    if (data.state === "unavailable") throw new Error("이 활동의 스트림을 사용할 수 없습니다.");
    if (!data.streamInputRevision || !/^[a-f0-9]{64}$/.test(data.streamInputRevision)
      || !["raw_parts", "api_streams"].includes(data.sourceLayer ?? "") || !data.streams
      || typeof data.streams !== "object" || Array.isArray(data.streams)) throw new Error("INVALID_PERSONAL_API_RESPONSE");
    if (options?.includeRunEffortFacts === true) {
      const facts = validatedRunEffortFacts(data.runningBestEffortsFacts, data.streamInputRevision);
      return { ...data.streams, ...(facts ? { runningBestEffortsFacts: facts } : { runningBestEffortsFacts: undefined }) };
    }
    return data.streams;
  }
  const payload = await apiFetch<{ data?: ActivityStreams }>(
    authInstance,
    `/activities/${encodeURIComponent(activityId)}/streams`,
  );
  if (!payload.data || typeof payload.data !== "object") {
    throw new Error("INVALID_PERSONAL_API_RESPONSE");
  }
  return payload.data;
}

/** 확인할 수 없는 위치를 버리고 원본 스트림 표시는 유지한다. */
export function validatedRunEffortFacts(value: RunningBestEffortsFacts | undefined, revision: string): RunningBestEffortsFacts | null {
  if (!value || !["available", "unavailable", "changed_input"].includes(value.state) || value.streamInputRevision !== revision
    || !/^[a-f0-9]{64}$/u.test(value.metricsRevision ?? "") || !Array.isArray(value.facts)) return null;
  if (value.state !== "available") return value.facts.length === 0 ? value : null;
  const seen = new Set<string>();
  for (const fact of value.facts) {
    if (!fact || !Object.prototype.hasOwnProperty.call(RUN_DISTANCE_M, fact.distance) || fact.distanceM !== RUN_DISTANCE_M[fact.distance] || seen.has(fact.distance)
      || ![fact.elapsedSec, fact.exactElapsedSec, fact.startOffsetSec, fact.endOffsetSec, fact.endFraction].every(Number.isFinite)
      || fact.elapsedSec <= 0 || fact.exactElapsedSec <= 0 || fact.startOffsetSec < 0 || fact.endOffsetSec <= fact.startOffsetSec
      || Math.abs(fact.endOffsetSec - fact.startOffsetSec - fact.exactElapsedSec) > 1e-5 || Math.abs(fact.elapsedSec - fact.exactElapsedSec) > 1
      || !["canonical_distance_observations", "canonical_route"].includes(fact.axis)
      || ![fact.startIndex, fact.endBeforeIndex, fact.endIndex].every(index => Number.isSafeInteger(index) && index >= 0)
      || fact.startIndex > fact.endBeforeIndex || fact.endBeforeIndex >= fact.endIndex || fact.endFraction < 0 || fact.endFraction > 1) return null;
    seen.add(fact.distance);
  }
  return value.facts.length ? value : null;
}
