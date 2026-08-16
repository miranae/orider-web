import { httpsCallable } from "firebase/functions";

import { functions } from "../../services/firebase";
import { debugLog, logClientError } from "../../services/errorLogger";
import {
  commitHeadAndIntent,
  listIntents,
  putHeadIfUnchanged,
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
  try {
    await fn({ profileId, mutationId });
  } catch (cause) {
    // 맥락 없이 reject 하면 어느 자전거의 삭제가 왜 막혔는지 운영에서 알 수 없다.
    logClientError("bikeProfileLayout", cause, {
      stage: "callDeleteBikeProfileAndLayout",
      profileId,
      mutationId,
    });
    throw cause;
  }
}

/** IndexedDB 를 쓰는 실제 저장소 어댑터. 오케스트레이션은 이 포트만 알면 된다. */
export const indexedDbLayoutStore: LayoutLocalStore = {
  commitHeadAndIntent,
  putHeadIfUnchanged,
  updateIntentState,
  removeIntent,
};

/**
 * owner 별 전송 큐. **신규 저장과 drain 이 같은 체인을 공유한다.**
 *
 * drain 끼리만 직렬화하면, 시작 시 기존 intent 를 보내는 중에 새 편집이 즉시 전송돼 순서가
 * 뒤집히거나 앞 intent 의 충돌 판정 전에 CAS 를 통과해 원격 구성을 덮어쓴다.
 */
const ownerQueues = new Map<string, Promise<unknown>>();

export function withOwnerLock<T>(ownerKey: string, operation: () => Promise<T>): Promise<T> {
  const previous = ownerQueues.get(ownerKey) ?? Promise.resolve();
  // 앞 작업의 실패가 뒤 작업을 막지 않도록 체인에서는 결과를 흡수한다.
  const next = previous.catch(() => undefined).then(operation);
  ownerQueues.set(
    ownerKey,
    next.catch(() => undefined).finally(() => {
      if (ownerQueues.get(ownerKey) === next) ownerQueues.delete(ownerKey);
    }),
  );
  return next;
}

export function browserSaveDeps(overrides: Partial<SaveLayoutDeps> = {}): SaveLayoutDeps {
  return {
    store: indexedDbLayoutStore,
    callSaveLayout: callSaveBikeProfileLayout,
    newMutationId: () => crypto.randomUUID(),
    nowMs: () => Date.now(),
    withOwnerLock,
    // 기본 no-op 로거를 두면 callable·IndexedDB 실패가 pending 으로 변환되면서 운영에서 사라진다.
    // 심각도는 **호출부가 명시한 level** 로 가른다 — 메시지 문자열로 추측하면 `무결성 오류`·
    // `불일치` 같은 실제 오류가 조용히 debug 채널로 샌다.
    log: (level, message, detail) => {
      if (level === "error") logClientError("bikeProfileLayout", message, detail);
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

  // 신규 저장과 **같은** owner 큐를 탄다 — 그래야 전송 순서와 충돌 판정이 뒤집히지 않는다.
  const started = deps
    .withOwnerLock(ownerKey, () => runDrain(ownerKey, deps))
    .finally(() => inFlightDrains.delete(ownerKey));
  inFlightDrains.set(ownerKey, started);
  return started;
}

async function runDrain(ownerKey: string, deps: SaveLayoutDeps): Promise<SaveLayoutResult[]> {
  let intents;
  try {
    intents = await listIntents(ownerKey);
  } catch (cause) {
    // 조회가 실패하면 재시작 후 동기화가 통째로 멈춘다. 조용히 reject 하지 않고 맥락을 남긴다.
    deps.log("error", "[0/3] read indexeddb intents — 실패, drain 중단", { ownerKey, cause: String(cause) });
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
