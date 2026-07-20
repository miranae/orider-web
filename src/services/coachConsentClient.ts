import { auth, getAppCheckToken } from "./firebase";
import { getRuntimeConfig } from "./runtimeConfig";

export type CoachConsentState = "missing" | "current" | "stale" | "revoked";
const COACH_DATA_CATEGORIES = [
  "user_question", "verified_answer", "answer_evidence", "thread_metadata", "training_summary",
  "fitness_metrics", "active_goal", "workout_plan", "subjective_checkin", "readiness_snapshot",
] as const;
export type CoachDataCategory = typeof COACH_DATA_CATEGORIES[number];

export interface CoachConsentStatus {
  currentPolicyVersion: string;
  storedPolicyVersion: string | null;
  current: boolean;
  stale: boolean;
  consented: boolean;
  revoked: boolean;
  active: boolean;
  consentedAt: string | null;
  revokedAt: string | null;
  revision: string | null;
  state: CoachConsentState;
}

export interface CoachConsentPolicy {
  policyVersion: string;
  title: string;
  purpose: string;
  dataCategories: CoachDataCategory[];
  retention: string;
  privacyPolicyUrl: string;
  policyDocumentUrl: string;
  processor: { name: string; service: string; privacyPolicyUrl: string };
  internationalProcessing: {
    recipient: string; country: string; purpose: string; dataCategories: CoachDataCategory[];
    timingAndMethod: string; retention: string;
  };
  withdrawal: { method: string; apiPath: string; effect: string };
  changeSummary: { effectiveAt: string; summary: string } | null;
  consent: CoachConsentStatus;
}

function object(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
}

function requiredString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function endpoint(path: string): string {
  const configured = getRuntimeConfig().aiApiBase;
  if (!configured) throw new Error("AI_API_BASE_MISSING");
  if (!/^https:\/\//.test(configured)) throw new Error("AI_API_BASE_INVALID");
  const base = configured.replace(/\/$/, "");
  return `${base}/v1/coach${path}`;
}

const DATA_CATEGORIES = new Set<CoachDataCategory>(COACH_DATA_CATEGORIES);

function categories(value: unknown): CoachDataCategory[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > DATA_CATEGORIES.size) return null;
  if (value.some((item) => typeof item !== "string" || !DATA_CATEGORIES.has(item as CoachDataCategory))) return null;
  return [...new Set(value as CoachDataCategory[])];
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function safePolicyUrl(value: unknown): value is string {
  return requiredString(value) && (value.startsWith("/") || value.startsWith("https://"));
}

function consentState(consent: Omit<CoachConsentStatus, "state">): CoachConsentState {
  if (consent.active && consent.current && consent.consented && !consent.revoked) return "current";
  if (consent.revoked) return "revoked";
  if (consent.stale || (consent.consented && !consent.current)) return "stale";
  return "missing";
}

function parsePolicy(input: unknown): CoachConsentPolicy {
  const envelope = input && typeof input === "object" ? input as Record<string, unknown> : {};
  if (!envelope.data || typeof envelope.data !== "object" || Array.isArray(envelope.data)) {
    throw new Error("INVALID_COACH_CONSENT_RESPONSE");
  }
  const value = envelope.data as Record<string, unknown>;
  const processor = object(value.processor);
  const international = object(value.internationalProcessing);
  const withdrawal = object(value.withdrawal);
  const change = value.changeSummary == null ? null : object(value.changeSummary);
  const consent = object(value.consent);
  const policyCategories = categories(value.dataCategories);
  const internationalCategories = categories(international.dataCategories);
  if (!requiredString(value.policyVersion) || !requiredString(value.title) || !requiredString(value.purpose)
      || !policyCategories
      || !requiredString(value.retention) || !safePolicyUrl(value.privacyPolicyUrl) || !safePolicyUrl(value.policyDocumentUrl)
      || !requiredString(processor.name) || !requiredString(processor.service) || !safePolicyUrl(processor.privacyPolicyUrl)
      || !requiredString(international.recipient) || !requiredString(international.country)
      || !requiredString(international.purpose) || !internationalCategories
      || !requiredString(international.timingAndMethod) || !requiredString(international.retention)
      || !requiredString(withdrawal.method) || !requiredString(withdrawal.apiPath) || !requiredString(withdrawal.effect)
      || (change != null && (!requiredString(change.effectiveAt) || !requiredString(change.summary)))
      || !requiredString(consent.currentPolicyVersion) || !nullableString(consent.storedPolicyVersion)
      || typeof consent.current !== "boolean" || typeof consent.stale !== "boolean"
      || typeof consent.consented !== "boolean" || typeof consent.revoked !== "boolean"
      || typeof consent.active !== "boolean" || !nullableString(consent.consentedAt)
      || !nullableString(consent.revokedAt) || !nullableString(consent.revision)) {
    throw new Error("INVALID_COACH_CONSENT_RESPONSE");
  }
  return {
    policyVersion: value.policyVersion,
    title: value.title,
    purpose: value.purpose,
    dataCategories: policyCategories,
    retention: value.retention,
    privacyPolicyUrl: value.privacyPolicyUrl,
    policyDocumentUrl: value.policyDocumentUrl,
    processor: processor as unknown as CoachConsentPolicy["processor"],
    internationalProcessing: {
      ...(international as unknown as CoachConsentPolicy["internationalProcessing"]),
      dataCategories: internationalCategories,
    },
    withdrawal: withdrawal as unknown as CoachConsentPolicy["withdrawal"],
    changeSummary: change as CoachConsentPolicy["changeSummary"],
    consent: (() => {
      const status = {
        currentPolicyVersion: consent.currentPolicyVersion as string,
        storedPolicyVersion: consent.storedPolicyVersion as string | null,
        current: consent.current as boolean,
        stale: consent.stale as boolean,
        consented: consent.consented as boolean,
        revoked: consent.revoked as boolean,
        active: consent.active as boolean,
        consentedAt: consent.consentedAt as string | null,
        revokedAt: consent.revokedAt as string | null,
        revision: consent.revision as string | null,
      };
      return { ...status, state: consentState(status) };
    })(),
  };
}

async function request(path: string, init?: RequestInit): Promise<CoachConsentPolicy> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("SIGN_IN_REQUIRED");
  const appCheckToken = await getAppCheckToken();
  const response = await fetch(endpoint(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      ...(appCheckToken ? { "X-Firebase-AppCheck": appCheckToken } : {}),
      ...init?.headers,
    },
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const error = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
    throw new Error(typeof error.code === "string" ? error.code : `HTTP_${response.status}`);
  }
  return parsePolicy(payload);
}

export function getCoachConsentPolicy(): Promise<CoachConsentPolicy> {
  return request("/consent-policy");
}

export function acceptCoachConsent(policyVersion: string): Promise<CoachConsentPolicy> {
  return request("/consent", { method: "PUT", body: JSON.stringify({ policyVersion }) });
}

export function revokeCoachConsent(): Promise<CoachConsentPolicy> {
  return request("/consent", { method: "DELETE" });
}
