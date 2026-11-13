import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { httpsCallable } from "firebase/functions";

export type PublicParticipantTimestamp = number | {
  _seconds?: number; seconds?: number; _nanoseconds?: number; nanoseconds?: number;
};

export function publicParticipantTimestampMs(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value || typeof value !== "object") return null;
  const timestamp = value as { toMillis?: () => number; _seconds?: unknown; seconds?: unknown;
    _nanoseconds?: unknown; nanoseconds?: unknown };
  if (typeof timestamp.toMillis === "function") {
    try {
      const millis = timestamp.toMillis();
      return typeof millis === "number" && Number.isFinite(millis) ? millis : null;
    } catch { return null; }
  }
  const seconds = timestamp._seconds ?? timestamp.seconds;
  const nanos = timestamp._nanoseconds ?? timestamp.nanoseconds ?? 0;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || !Number.isInteger(seconds)
    || typeof nanos !== "number" || !Number.isInteger(nanos) || nanos < 0 || nanos >= 1_000_000_000) return null;
  const millis = seconds * 1000 + nanos / 1_000_000;
  return Number.isFinite(millis) ? millis : null;
}

export interface PublicEventParticipant {
  userId: string;
  displayName?: string | null;
  profileImage?: string | null;
  category?: string | null;
  status?: string;
  role?: string;
  bibNumber?: number | null;
  registrationNumber?: number | null;
  joinedAt?: PublicParticipantTimestamp;
  checkedIn?: boolean;
  finishedAt?: PublicParticipantTimestamp;
  resultVerified?: boolean;
  resultPending?: boolean;
}
interface PublicParticipantsResponse {
  participants: PublicEventParticipant[];
  counters: { totalRegistered: number; byCategory: Record<string, number> };
}

export interface EventParticipantPreview {
  participants: PublicEventParticipant[];
  counters: PublicParticipantsResponse["counters"] | null;
  countersStatus: "ready" | "pending";
  counterRevision: string | null;
  projectionVersion: 2;
  complete: true;
  nextCursor: null;
}

/** 상세의 5명 미리보기는 전체 명부를 내려받지 않는다. App Check와 응답을 같은 세션으로 묶는다. */
export async function getEventPublicParticipantPreview(eventId: string, services: Pick<FirebaseServices, "auth" | "functions" | "ensureAppCheckReady">): Promise<EventParticipantPreview> {
  const owner = services.auth.currentUser;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const current = () => !expired && services.auth.currentUser === owner;
  const work = async () => {
    await services.ensureAppCheckReady();
    if (!current()) throw new Error("event-preview-session-changed");
    const { data } = await httpsCallable<{ eventId: string; mode: "preview" }, EventParticipantPreview>(services.functions, "getEventPublicParticipants")({ eventId, mode: "preview" });
    if (!current()) throw new Error("event-preview-session-changed");
    if (!data || data.projectionVersion !== 2 || data.complete !== true || data.nextCursor !== null
      || !Array.isArray(data.participants) || data.participants.length > 5
      || new Set(data.participants.map(row => row.userId)).size !== data.participants.length
      || data.participants.some(row => !row || typeof row.userId !== "string" || !row.userId || row.userId.includes("/") || publicParticipantTimestampMs(row.joinedAt) === null)
      || !["ready", "pending"].includes(data.countersStatus)
      || (data.countersStatus === "pending" ? data.counters !== null || data.counterRevision !== null
        : !data.counters || !Number.isSafeInteger(data.counters.totalRegistered) || data.counters.totalRegistered < 0
          || !data.counters.byCategory || Object.values(data.counters.byCategory).some(value => !Number.isSafeInteger(value) || value < 0)
          || typeof data.counterRevision !== "string" || !data.counterRevision)) throw new Error("event-preview-invalid-response");
    return data;
  };
  try { return await Promise.race([work(), new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error("event-preview-timeout")); }, 12000); })]); }
  finally { clearTimeout(timer); }
}

export interface EventParticipantPage extends Omit<EventParticipantPreview, "complete" | "nextCursor"> {
  complete: boolean;
  nextCursor: string | null;
}

/** 페이지 요청만 수행한다. 다음 페이지를 자동으로 따라가거나 원본 명부로 대체하지 않는다. */
export async function getEventPublicParticipantsPage(eventId: string, cursor: string | null, services: Pick<FirebaseServices, "auth" | "functions" | "ensureAppCheckReady">, isCurrent: () => boolean = () => true): Promise<EventParticipantPage> {
  const owner = services.auth.currentUser;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const current = () => !expired && isCurrent() && services.auth.currentUser === owner;
  const work = async () => {
    await services.ensureAppCheckReady();
    if (!current()) throw new Error("event-page-session-changed");
    const { data } = await httpsCallable<{ eventId: string; mode: "page"; pageSize: number; cursor: string | null }, EventParticipantPage>(services.functions, "getEventPublicParticipants")({ eventId, mode: "page", pageSize: 50, cursor });
    if (!current()) throw new Error("event-page-session-changed");
    if (!data || data.projectionVersion !== 2 || typeof data.complete !== "boolean"
      || (data.complete ? data.nextCursor !== null : typeof data.nextCursor !== "string" || !data.nextCursor || data.nextCursor === cursor)
      || !Array.isArray(data.participants) || data.participants.length > 50
      || data.participants.some(row => !row || typeof row.userId !== "string" || !row.userId || row.userId.includes("/"))
      || new Set(data.participants.map(row => row.userId)).size !== data.participants.length
      || !["ready", "pending"].includes(data.countersStatus)
      || (data.countersStatus === "pending" ? data.counters !== null || data.counterRevision !== null
        : !data.counters || !Number.isSafeInteger(data.counters.totalRegistered) || data.counters.totalRegistered < 0
          || !data.counters.byCategory || Object.values(data.counters.byCategory).some(value => !Number.isSafeInteger(value) || value < 0)
          || typeof data.counterRevision !== "string" || !data.counterRevision)) throw new Error("event-page-invalid-response");
    return data;
  };
  try { return await Promise.race([work(), new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error("event-page-timeout")); }, 12000); })]); }
  finally { clearTimeout(timer); }
}
