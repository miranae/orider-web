import { httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
// Non-embedded callers retain the ordinary web defaults; embedded callers pass their isolated services.
// eslint-disable-next-line design-system/no-firebase-singleton-in-embed -- 일반 웹 metadata 기본값. 임베드 선수 프로필은 첫 조회와 추가 조회 모두 isolated services를 주입한다.
import { ensureAppCheckReady, functions, auth } from "./firebase";
export type SegmentMetadata = { id: string; name?: string; distance?: number; [key: string]: unknown };
export async function loadSegmentMetadataPage(request: { ids?: string[]; mode?: "popular" | "creator"; creatorUid?: string; cursor?: string }, injected?: Pick<FirebaseServices, "auth" | "functions" | "ensureAppCheckReady">) {
  const services = injected ?? { auth, functions, ensureAppCheckReady };
  const user = services.auth.currentUser;
  const uid = user?.uid ?? null;
  const assertAccount = () => {
    if (services.auth.currentUser !== user || (services.auth.currentUser?.uid ?? null) !== uid) throw new Error("account_changed");
  };
  await services.ensureAppCheckReady();
  assertAccount();
  const result = await httpsCallable<typeof request, { items: SegmentMetadata[]; cursor: string | null; hasMore: boolean }>(services.functions, "getPublicSegmentMetadata")(request);
  assertAccount();
  return result.data;
}
export async function loadSegmentMetadata(ids: string[], services?: Parameters<typeof loadSegmentMetadataPage>[1]) { return ids.length ? (await loadSegmentMetadataPage({ ids }, services)).items : []; }
