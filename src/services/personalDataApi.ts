import { auth } from "./firebase";
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
): Promise<ActivityStreams> {
  const payload = await apiFetch<{ data?: ActivityStreams }>(
    authInstance,
    `/activities/${encodeURIComponent(activityId)}/streams`,
  );
  if (!payload.data || typeof payload.data !== "object") {
    throw new Error("INVALID_PERSONAL_API_RESPONSE");
  }
  return payload.data;
}
