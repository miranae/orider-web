import { httpsCallable } from "firebase/functions";

import { functions } from "../../services/firebase";
import {
  commitHeadAndIntent,
  listIntents,
  putHead,
  removeIntent,
  updateIntentState,
} from "./outbox";
import {
  transmitIntent,
  type LayoutLocalStore,
  type SaveLayoutCallableRequest,
  type SaveLayoutCallableResponse,
  type SaveLayoutDeps,
  type SaveLayoutResult,
} from "./saveLayout";

/**
 * `saveBikeProfileLayout` callable 어댑터 (#1943 §9.1).
 *
 * 레이아웃 변경의 **유일한 경로**다 — Firestore direct write 는 규칙에서 막혀 있다.
 * 서버가 revision CAS·tombstone·mutation 영수증을 한 트랜잭션에서 검사한다.
 */
export async function callSaveBikeProfileLayout(
  request: SaveLayoutCallableRequest,
): Promise<SaveLayoutCallableResponse> {
  const fn = httpsCallable<SaveLayoutCallableRequest, SaveLayoutCallableResponse>(
    functions,
    "saveBikeProfileLayout",
  );
  const { data } = await fn(request);
  return data;
}

/** 프로필 + 형제 레이아웃 tombstone. hard delete 는 orphan 레이아웃을 남기므로 쓰지 않는다(§9.2). */
export async function callDeleteBikeProfileAndLayout(profileId: string, mutationId: string): Promise<void> {
  const fn = httpsCallable<{ profileId: string; mutationId: string }, { status: string }>(
    functions,
    "deleteBikeProfileAndLayout",
  );
  await fn({ profileId, mutationId });
}

/** IndexedDB 를 쓰는 실제 저장소 어댑터. 오케스트레이션은 이 포트만 알면 된다. */
export const indexedDbLayoutStore: LayoutLocalStore = {
  commitHeadAndIntent,
  putHead,
  updateIntentState,
  removeIntent,
};

export function browserSaveDeps(overrides: Partial<SaveLayoutDeps> = {}): SaveLayoutDeps {
  return {
    store: indexedDbLayoutStore,
    callSaveLayout: callSaveBikeProfileLayout,
    newMutationId: () => crypto.randomUUID(),
    nowMs: () => Date.now(),
    ...overrides,
  };
}

/**
 * 새로고침·브라우저 재시작 뒤 남아 있는 intent 를 다시 보낸다 (수용기준 26).
 *
 * 충돌·무결성 오류로 **막힌** intent 는 건드리지 않는다 — 사용자가 세 선택지 중 하나를 고르기
 * 전까지 자동 재시도하지 않는 것이 §6.1 의 계약이다. 다른 owner 의 intent 와도 섞지 않는다.
 */
export async function drainLayoutOutbox(
  ownerKey: string,
  deps: SaveLayoutDeps = browserSaveDeps(),
): Promise<SaveLayoutResult[]> {
  const intents = await listIntents(ownerKey);
  const results: SaveLayoutResult[] = [];
  for (const intent of intents) {
    if (intent.state === "blockedConflict" || intent.state === "quarantined") continue;
    results.push(await transmitIntent(intent, deps));
  }
  return results;
}
