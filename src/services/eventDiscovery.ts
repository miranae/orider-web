import { logClientError } from "./errorLogger";
import { httpsCallable } from "firebase/functions";
import { type DocumentData } from "firebase/firestore";

import type { FirebaseServices } from "../contexts/FirebaseServicesContext";

export interface EventEnvelopeDoc { id: string; data(): DocumentData }
/** timeWindow: 클럽 조회의 다가오는·지난 구간(#1620). 서버가 시작 시각으로 거른다. */
interface Options { groupId?: string; publicOnly?: boolean; statuses?: string[]; limit?: number; cursor?: string; descending?: boolean; timeWindow?: "upcoming" | "past" }
interface Page { rows: Array<{ id: string; data: DocumentData }>; nextCursor: string | null }

/** Discovery never falls back to a raw events query: that would bypass private-event filtering. */
type DiscoveryServices = Pick<FirebaseServices, "auth" | "functions" | "ensureAppCheckReady">;

/**
 * `services` 는 필수다 — 화면의 `useFirebaseServices()` 를 넘긴다. 앱 임베드는 기본 Firebase 를
 * 초기화하지 않아, 기본 싱글턴으로 부르면 앱 안에서만 목록이 비거나 실패한다(#1485, 클럽 첫 화면).
 */
export async function getVisibleEventPage(options: Options, services: DiscoveryServices) {
  const viewer = services.auth.currentUser;
  await services.ensureAppCheckReady();
  if (services.auth.currentUser !== viewer) throw new Error("account_changed");
  const page = (await httpsCallable<Options, Page>(services.functions, "listVisibleEventEnvelopes")(options)).data;
  if (services.auth.currentUser !== viewer) throw new Error("account_changed");
  if (!page.rows.length && page.nextCursor && page.nextCursor === options.cursor) throw new Error("Event discovery continuation made no progress");
  const docs: EventEnvelopeDoc[] = page.rows.map(row => ({ id: row.id, data: () => row.data }));
  return { docs, nextCursor: page.nextCursor, forEach: (callback: (doc: EventEnvelopeDoc) => void) => docs.forEach(callback) };
}

/**
 * One bounded server page per explicit user action; never auto-scan private windows.
 * 임베드(앱 탐색 탭)는 기본 Firebase 를 초기화하지 않는다 — 화면의 `useFirebaseServices()` 를 넘겨야
 * 임베드 세션의 functions·App Check 로 호출된다(#1485).
 */
export async function getPublicEvents(statuses: string[], cursor: string | undefined, services: DiscoveryServices) {
  return getVisibleEventPage({ publicOnly: true, statuses, limit: 250, ...(cursor ? { cursor } : {}) }, services);
}

const nextUnavailableUntil = new WeakMap<object, number>();
/** New producer is optional until deployed; only a missing endpoint selects legacy discovery. */
export async function getGroupNextEventPage(groupIds: string[], publicOnly: boolean, excludeEventId: string | undefined, services: DiscoveryServices) {
  if ((nextUnavailableUntil.get(services.functions) ?? 0) > Date.now()) return null;
  const viewer = services.auth.currentUser;
  await services.ensureAppCheckReady();
  if (services.auth.currentUser !== viewer) throw new Error("account_changed");
  try {
    const response = (await httpsCallable<{ groupIds: string[]; publicOnly: boolean; excludeEventId?: string }, Page & { incompleteGroupIds: string[] }>(services.functions, "getGroupNextEvents")({ groupIds, publicOnly, ...(excludeEventId ? { excludeEventId } : {}) })).data;
    if (services.auth.currentUser !== viewer) throw new Error("account_changed");
    if (!Array.isArray(response.rows) || !Array.isArray(response.incompleteGroupIds)) throw new Error("Invalid next event response");
    return { docs: response.rows.map(row => ({ id: row.id, data: () => row.data })), incompleteGroupIds: response.incompleteGroupIds };
  } catch (error) {
    logClientError("getGroupNextEventPage", error, { groupCount: groupIds.length }, services);
    if (!["functions/not-found", "functions/unimplemented"].includes((error as { code?: string })?.code ?? "")) throw error;
    nextUnavailableUntil.set(services.functions, Date.now() + 60_000);
    return null;
  }
}
