import { httpsCallable } from "firebase/functions";
import { type DocumentData } from "firebase/firestore";
import { ensureAppCheckReady, functions } from "./firebase";

export interface EventEnvelopeDoc { id: string; data(): DocumentData }
interface Options { groupId?: string; publicOnly?: boolean; statuses?: string[]; limit?: number; cursor?: string; descending?: boolean }
interface Page { rows: Array<{ id: string; data: DocumentData }>; nextCursor: string | null }

/** Discovery never falls back to a raw events query: that would bypass private-event filtering. */
export async function getVisibleEventPage(options: Options) {
  await ensureAppCheckReady();
  const page = (await httpsCallable<Options, Page>(functions, "listVisibleEventEnvelopes")(options)).data;
  if (!page.rows.length && page.nextCursor && page.nextCursor === options.cursor) throw new Error("Event discovery continuation made no progress");
  const docs: EventEnvelopeDoc[] = page.rows.map(row => ({ id: row.id, data: () => row.data }));
  return { docs, nextCursor: page.nextCursor, forEach: (callback: (doc: EventEnvelopeDoc) => void) => docs.forEach(callback) };
}

/** One bounded server page per explicit user action; never auto-scan private windows. */
export async function getPublicEvents(statuses: string[], cursor?: string) {
  return getVisibleEventPage({ publicOnly: true, statuses, limit: 250, ...(cursor ? { cursor } : {}) });
}
