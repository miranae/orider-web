import { httpsCallable } from "firebase/functions";
import { ensureAppCheckReady, functions } from "./firebase";
export type SegmentMetadata = { id: string; name?: string; distance?: number; [key: string]: unknown };
export async function loadSegmentMetadataPage(request: { ids?: string[]; mode?: "popular" | "creator"; creatorUid?: string; cursor?: string }) {
  await ensureAppCheckReady();
  const result = await httpsCallable<typeof request, { items: SegmentMetadata[]; cursor: string | null; hasMore: boolean }>(functions, "getPublicSegmentMetadata")(request);
  return result.data;
}
export async function loadSegmentMetadata(ids: string[]) { return ids.length ? (await loadSegmentMetadataPage({ ids })).items : []; }
