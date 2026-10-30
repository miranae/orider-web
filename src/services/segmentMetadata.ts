import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady, functions, auth } from "./firebase";
export type SegmentMetadata = { id: string; name?: string; distance?: number; [key: string]: unknown };
export async function loadSegmentMetadataPage(request: { ids?: string[]; mode?: "popular" | "creator"; creatorUid?: string; cursor?: string }) {
  const uid = auth.currentUser?.uid ?? null;
  await ensureAppCheckReady();
  if ((auth.currentUser?.uid ?? null) !== uid) throw new Error("account_changed");
  const result = await httpsCallable<typeof request, { items: SegmentMetadata[]; cursor: string | null; hasMore: boolean }>(functions, "getPublicSegmentMetadata")(request);
  if ((auth.currentUser?.uid ?? null) !== uid) throw new Error("account_changed");
  return result.data;
}
export async function loadSegmentMetadata(ids: string[]) { return ids.length ? (await loadSegmentMetadataPage({ ids })).items : []; }
