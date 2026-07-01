import { auth } from "./firebase";
import { getRuntimeConfig } from "./runtimeConfig";

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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
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
  const payload = await apiFetch<{ data?: PersonalApiKeySummary[] }>("/developer/api-keys");
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function createPersonalApiKey(input: {
  name: string;
  scopes: PersonalApiScope[];
}): Promise<CreatedPersonalApiKey> {
  const payload = await apiFetch<{ data?: CreatedPersonalApiKey }>("/developer/api-keys", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!payload.data?.key || !payload.data.prefix) {
    throw new Error("INVALID_PERSONAL_API_RESPONSE");
  }
  return payload.data;
}

export async function revokePersonalApiKey(keyId: string): Promise<void> {
  await apiFetch<{ data: { revoked: boolean } }>(`/developer/api-keys/${encodeURIComponent(keyId)}`, {
    method: "DELETE",
  });
}
