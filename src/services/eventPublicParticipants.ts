import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady, functions } from "./firebase";

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

export async function getEventPublicParticipants(eventId: string): Promise<PublicParticipantsResponse> {
  await ensureAppCheckReady();
  const result = await httpsCallable<{ eventId: string }, PublicParticipantsResponse>(functions, "getEventPublicParticipants")({ eventId });
  return result.data;
}
