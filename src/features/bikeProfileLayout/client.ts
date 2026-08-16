import { httpsCallable } from "firebase/functions";

import { functions } from "../../services/firebase";
import { debugLog, logClientError } from "../../services/errorLogger";
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
    // 기본 no-op 로거를 두면 callable·IndexedDB 실패가 pending 으로 변환되면서 운영에서 사라진다.
    // 실패 단계는 에러 채널로, 정상 단계는 진단 채널로 나눠 보낸다.
    log: (message, detail) => {
      if (message.includes("실패")) logClientError("bikeProfileLayout", message, detail);
      else debugLog("bikeProfileLayout", { message, ...detail });
    },
    ...overrides,
  };
}

/**
 * 새로고침·브라우저 재시작 뒤 남아 있는 intent 를 다시 보낸다 (수용기준 26).
 *
 * 충돌·무결성 오류로 **막힌** intent 는 건드리지 않는다 — 사용자가 세 선택지 중 하나를 고르기
 * 전까지 자동 재시도하지 않는 것이 §6.1 의 계약이다. 다른 owner 의 intent 와도 섞지 않는다.
 */
/**
 * owner 별 진행 중 drain. 동시 실행을 막는 single-flight 잠금이다.
 *
 * 두 drain 이 같은 snapshot 을 읽으면, 한쪽이 선행 intent 의 충돌을 발견해도 다른 쪽은 이미
 * 후속 intent 를 보내 버려 아래의 프로필별 차단이 무력해진다.
 */
const inFlightDrains = new Map<string, Promise<SaveLayoutResult[]>>();

export function drainLayoutOutbox(
  ownerKey: string,
  deps: SaveLayoutDeps = browserSaveDeps(),
): Promise<SaveLayoutResult[]> {
  const running = inFlightDrains.get(ownerKey);
  if (running) return running;

  const started = runDrain(ownerKey, deps).finally(() => inFlightDrains.delete(ownerKey));
  inFlightDrains.set(ownerKey, started);
  return started;
}

async function runDrain(ownerKey: string, deps: SaveLayoutDeps): Promise<SaveLayoutResult[]> {
  let intents;
  try {
    intents = await listIntents(ownerKey);
  } catch (cause) {
    // 조회가 실패하면 재시작 후 동기화가 통째로 멈춘다. 조용히 reject 하지 않고 맥락을 남긴다.
    deps.log("[0/3] read indexeddb intents — 실패, drain 중단", { ownerKey, cause: String(cause) });
    throw cause;
  }
  const results: SaveLayoutResult[] = [];

  /**
   * 한 프로필에서 차단 결과가 나오면 **그 프로필의 후속 intent 전송을 멈춘다.**
   *
   * 오프라인 편집 A(expectedRevision=3)·B(4)가 쌓인 상태에서 A 가 원격 revision 4 와 충돌하면,
   * 그대로 B 를 보내면 B 의 CAS(expected=4)가 통과해 **사용자의 충돌 선택 없이** 원격 구성을
   * 덮어쓴다. 차단은 프로필 단위로 전파돼야 한다.
   */
  const blockedProfiles = new Set<string>();

  for (const intent of intents) {
    if (intent.state === "blockedConflict" || intent.state === "quarantined") {
      blockedProfiles.add(intent.profileId);
      continue;
    }
    if (blockedProfiles.has(intent.profileId)) continue;

    const result = await transmitIntent(intent, deps);
    results.push(result);
    if (result.status === "conflict" || result.status === "targetDeleted" || result.status === "integrityError") {
      blockedProfiles.add(intent.profileId);
    }
  }
  return results;
}
