import { httpsCallable } from "firebase/functions";
import { type DocumentData } from "firebase/firestore";
import { ensureAppCheckReady, functions } from "./firebase";

export interface EventEnvelopeDoc { id: string; data(): DocumentData }
interface Options { groupId?: string; publicOnly?: boolean; statuses?: string[]; limit?: number; cursor?: string; descending?: boolean }
interface Page { rows: Array<{ id: string; data: DocumentData }>; nextCursor: string | null }

/** Discovery never falls back to a raw events query: that would bypass private-event filtering. */
export async function getVisibleEventPage(options: Options) {
  await ensureAppCheckReady();
  const result = await httpsCallable<Options, Page>(functions, "listVisibleEventEnvelopes")(options);
  const docs: EventEnvelopeDoc[] = result.data.rows.map(row => ({ id: row.id, data: () => row.data }));
  return { docs, nextCursor: result.data.nextCursor, forEach: (callback: (doc: EventEnvelopeDoc) => void) => docs.forEach(callback) };
}

export async function getPublicEvents(statuses: string[]) {
  const docs: EventEnvelopeDoc[] = [];
  let cursor: string | undefined;
  do {
    const page = await getVisibleEventPage({ publicOnly: true, statuses, limit: 250, ...(cursor ? { cursor } : {}) });
    docs.push(...page.docs);
    if (!page.nextCursor || page.nextCursor === cursor) break;
    cursor = page.nextCursor;
  } while (cursor);
  return { docs, forEach: (callback: (doc: EventEnvelopeDoc) => void) => docs.forEach(callback) };
}
