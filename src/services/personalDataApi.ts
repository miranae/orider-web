import { auth, functions, ensureAppCheckReady } from "./firebase";
import { httpsCallable, type Functions } from "firebase/functions";
import type { Auth } from "firebase/auth";
import { getRuntimeConfig } from "./runtimeConfig";
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
): Promise<ActivityStreams> {
  if (getRuntimeConfig().appEnvironment === "stage") {
    const provider = services ?? { functions, ensureAppCheckReady };
    const uid = authInstance.currentUser?.uid;
    if (!uid) throw new Error("SIGN_IN_REQUIRED");
    if (provider.functions.app !== authInstance.app || provider.functions.customDomain !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("stage/callable-context-mismatch");
    await provider.ensureAppCheckReady();
    if (authInstance.currentUser?.uid !== uid) throw new Error("account_changed");
    const response = await httpsCallable<{ activityId: string }, {
      activityId: string; state: "available" | "pending" | "changed_input" | "unavailable";
      streamInputRevision: string | null; sourceLayer: "raw_parts" | "api_streams" | null; streams: ActivityStreams | null;
    }>(provider.functions, "getActivityStreams")({ activityId });
    if (authInstance.currentUser?.uid !== uid) throw new Error("account_changed");
    const data = response.data;
    if (data?.activityId !== activityId || !["available", "pending", "changed_input", "unavailable"].includes(data.state)) throw new Error("INVALID_PERSONAL_API_RESPONSE");
    if (data.state === "pending") throw new Error("활동 스트림을 준비 중입니다.");
    if (data.state === "changed_input") throw new Error("활동 데이터가 변경되었습니다. 새로고침 후 다시 확인해 주세요.");
    if (data.state === "unavailable") throw new Error("이 활동의 스트림을 사용할 수 없습니다.");
    if (!data.streamInputRevision || !/^[a-f0-9]{64}$/.test(data.streamInputRevision)
      || !["raw_parts", "api_streams"].includes(data.sourceLayer ?? "") || !data.streams
      || typeof data.streams !== "object" || Array.isArray(data.streams)) throw new Error("INVALID_PERSONAL_API_RESPONSE");
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
