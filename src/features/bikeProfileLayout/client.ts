import { httpsCallable } from "firebase/functions";

import { functions } from "../../services/firebase";
import { debugLog, logClientError } from "../../services/errorLogger";
import {
  commitHeadAndIntent,
  hasBlockedIntent,
  listIntents,
  putHeadIfUnchanged,
  recordIntentConflict,
  removeIntent,
  updateIntentState,
} from "./outbox";
import {
  sendProfileQueue,
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
    const { data } = await fn({ profileId, mutationId });
    // 서버는 kill switch 같은 비성공 상태를 **데이터로** 돌려준다. resolve 됐다고 성공으로 보면
    // 지워지지 않은 프로필을 UI 가 삭제됐다고 판단한다.
    if (data?.status !== "tombstoned") {
      throw new Error(`deleteBikeProfileAndLayout 비성공 상태: ${String(data?.status)}`);
    }
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
  recordIntentConflict,
  hasBlockedIntent,
  listIntents,
  updateIntentState,
  removeIntent,
};

/**
 * owner 별 전송 큐(같은 탭 안). **신규 저장과 drain 이 같은 체인을 공유한다.**
 *
 * drain 끼리만 직렬화하면, 시작 시 기존 intent 를 보내는 중에 새 편집이 즉시 전송돼 순서가
 * 뒤집히거나 앞 intent 의 충돌 판정 전에 CAS 를 통과해 원격 구성을 덮어쓴다.
 */
const ownerQueues = new Map<string, Promise<unknown>>();

function withLocalOwnerQueue<T>(ownerKey: string, operation: () => Promise<T>): Promise<T> {
  const previous = ownerQueues.get(ownerKey) ?? Promise.resolve();
  // 앞 작업의 실패가 뒤 작업을 막지 않도록 체인에서는 결과를 흡수한다.
  const next = previous.catch(() => undefined).then(operation);
  // 맵에는 **정리까지 포함한 그 Promise 자체**를 넣는다. 다른 Promise 를 넣고 비교하면 조건이
  // 영원히 거짓이라 settled Promise 가 owner 마다 계속 쌓인다.
  const chained: Promise<unknown> = next.catch(() => undefined).then(() => {
    if (ownerQueues.get(ownerKey) === chained) ownerQueues.delete(ownerKey);
  });
  ownerQueues.set(ownerKey, chained);
  return next;
}

const OWNER_LOCK_PREFIX = "orider-bike-profile-layout";

/**
 * owner 단위 전송 직렬화 — **탭을 넘어서** 건다.
 *
 * 메모리 큐만으로는 같은 탭 안에서만 유효하다. 두 탭을 열어 두면 한 탭이 기존 intent A(expected=3)의
 * 충돌을 판정하는 사이 다른 탭의 B(expected=4)가 먼저 도착해 CAS 를 통과하고, 사용자의 충돌 선택
 * 없이 원격 구성을 덮어쓴다. Web Locks 는 브라우징 컨텍스트 전체에서 유효하다.
 *
 * Web Locks 가 없는 환경(구형 브라우저·테스트)에서는 같은 탭 큐로 물러난다 — 완전한 방어는
 * 아니지만 서버 CAS 와 프로필별 차단이 그다음 방어선이다.
 */
export function withOwnerLock<T>(ownerKey: string, operation: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return withLocalOwnerQueue(ownerKey, operation);
  // 탭 안 중복 실행도 함께 막도록 로컬 큐로 한 번 더 감싼다.
  return withLocalOwnerQueue(
    ownerKey,
    () => locks.request(`${OWNER_LOCK_PREFIX}:${ownerKey}`, operation) as Promise<T>,
  );
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
    .catch((cause: unknown) => {
      // 잠금 획득 실패도 운영에서 보여야 한다 — 저장 경로는 기록하는데 drain 만 무음이면 안 된다.
      deps.log("error", "[0/3] drain owner 잠금 획득 실패", { ownerKey, cause: String(cause) });
      throw cause;
    })
    .finally(() => inFlightDrains.delete(ownerKey));
  inFlightDrains.set(ownerKey, started);
  return started;
}

async function runDrain(ownerKey: string, deps: SaveLayoutDeps): Promise<SaveLayoutResult[]> {
  let intents;
  try {
    intents = await deps.store.listIntents(ownerKey);
  } catch (cause) {
    // 조회가 실패하면 재시작 후 동기화가 통째로 멈춘다. 조용히 reject 하지 않고 맥락을 남긴다.
    deps.log("error", "[0/3] read indexeddb intents — 실패, drain 중단", { ownerKey, cause: String(cause) });
    throw cause;
  }

  // 프로필별 순서 큐를 그대로 쓴다 — 신규 저장과 같은 규칙이라 두 경로가 갈라지지 않는다.
  const profileIds = [...new Set(intents.map((i) => i.profileId))];
  const results: SaveLayoutResult[] = [];
  for (const profileId of profileIds) {
    results.push(...(await sendProfileQueue(ownerKey, profileId, deps)));
  }
  return results;
}
