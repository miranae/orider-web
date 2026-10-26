import { httpsCallable } from "firebase/functions";
import { captureActivityNarrativeSession, type ActivityNarrativeServices } from "./activityNarrativeSession";
import type { ActivityNarrative, NarrativeLang } from "../hooks/useActivityNarrative";
export interface NarrativeHistory {
  items: Array<{ revisionId: string; generatedAt: number | null; version: string | null }>;
  nextCursor: string | null;
  selected: { revisionId: string; narrative: ActivityNarrative } | null;
}
const revision = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export async function loadActivityNarrativeHistory(activityId: string, lang: NarrativeLang, revisionId?: string, cursor?: string, services?: ActivityNarrativeServices): Promise<NarrativeHistory> {
  const session = captureActivityNarrativeSession(services);
  const { auth, functions, ensureAppCheckReady } = session.services;
  if (!auth.currentUser || auth.currentUser.isAnonymous) throw Object.assign(Error("Sign in required"), { code: "unauthenticated" });
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(activityId) || revisionId !== undefined && !revision(revisionId) || cursor !== undefined && !revision(cursor)) throw Error("invalid_narrative_history_request");
  await ensureAppCheckReady(); session.assertCurrent();
  const { data } = await httpsCallable<object, NarrativeHistory>(functions, "getActivityNarrativeHistory", { timeout: 10000 })({ activityId, lang, ...(revisionId ? { revisionId } : {}), ...(cursor ? { cursor } : {}) });
  session.assertCurrent();
  if (!data || !Array.isArray(data.items) || data.items.length > 20 || data.items.some(row => !row || !revision(row.revisionId)
    || !(row.generatedAt === null || Number.isFinite(row.generatedAt)) || !(row.version === null || typeof row.version === "string"))
    || !(data.nextCursor === null || revision(data.nextCursor))) throw Error("invalid_narrative_history");
  const selected = data.selected;
  if (!(selected === null || selected && selected.revisionId === revisionId && selected.narrative
    && typeof selected.narrative.summary === "string" && Array.isArray(selected.narrative.segments)
    && selected.narrative.overall && Array.isArray(selected.narrative.overall.flags))) throw Error("invalid_narrative_history");
  return data;
}
