import { encodeCanonicalLayout, payloadHash, type CanonicalLayout } from "./canonical";
import { headKey } from "./outbox";
import type { LayoutHeadRecord, LayoutIntentRecord, LayoutIntentState } from "./outbox";

/**
 * 데이터 페이지 저장 오케스트레이션 (#1943 §9.1).
 *
 * 순서가 계약이다: **IndexedDB 원자 커밋 → callable CAS**. IndexedDB 가 실패하면 callable 은
 * 0건이고(수용기준 31), callable 이 실패하면 로컬은 저장된 채 intent 가 남는다. 같은 mutationId
 * 로 같은 payload 를 다시 보내면 revision 은 오르지 않는다(수용기준 26).
 *
 * Android/iOS 의 `SaveBikeProfileLayoutUseCase` 와 같은 상태표를 따른다 — 세 클라이언트가
 * 다른 충돌 정책을 쓰면 사용자가 기기마다 다른 결과를 본다.
 */

export type SaveLayoutCallableRequest = {
  profileId: string;
  expectedRevision: number;
  mutationId: string;
  canonicalPayload: string;
  payloadHash: string;
  installIdHash?: string;
};

export type SaveLayoutCallableResponse =
  | { status: "committed"; revision: number; payloadHash: string; wasReplay: boolean }
  | { status: "conflict"; remoteRevision: number; remotePayload: string; remotePayloadHash: string }
  | { status: "integrityError" }
  | { status: "profileDeleted" }
  | { status: "writesDisabled" };

export type SaveLayoutResult =
  | { status: "synced"; revision: number }
  /** 로컬에는 저장됐고 outbox 에 intent 가 남았다 — 연결되면 재시도한다. */
  | { status: "savedPendingSync"; intent: LayoutIntentRecord }
  /** 다른 기기가 먼저 커밋했다. draft 와 remote 를 모두 보존하고 편집을 멈춘다. */
  | { status: "conflict"; remoteRevision: number; remotePayload: string }
  /** 대상 프로필이 원격에서 삭제됐다. 다른 프로필로 오저장하지 않도록 target 을 잠근다. */
  | { status: "targetDeleted" }
  /** 같은 mutationId 로 다른 payload 를 보냈다 — 서버 write 0건. */
  | { status: "integrityError" }
  /** IndexedDB 커밋 실패. 이 경우 callable 은 0건이다. */
  | { status: "localSaveFailed"; cause: unknown }
  /** 요청 대상과 payload 의 프로필이 다르다. 아무 것도 쓰지 않는다. */
  | { status: "invalidTarget"; expected: string; actual: string }
  /**
   * 이 프로필에 아직 해소되지 않은 충돌이 있어 전송하지 않았다. draft 는 로컬에 남는다.
   * 사용자가 §6.1 의 세 선택지 중 하나를 고르기 전까지 전송을 재개하지 않는다.
   */
  | { status: "blockedByConflict"; intent: LayoutIntentRecord };

/**
 * 로컬 저장 경계. 실제 구현은 `outbox.ts`(IndexedDB) 지만, 오케스트레이션이 이 포트만 알면
 * 분기 전체를 인메모리로 검증할 수 있다 — Android/iOS 의 `LayoutLocalTransaction` 과 같은 모양.
 */
export type LayoutLocalStore = {
  /** head 와 intent 를 **한 트랜잭션**에 커밋한다. 하나라도 실패하면 둘 다 롤백돼야 한다. */
  commitHeadAndIntent: (head: LayoutHeadRecord, intent: LayoutIntentRecord) => Promise<void>;
  /**
   * head 가 아직 `expectedPayloadHash` 일 때만 갱신하는 **원자** 연산.
   * 읽기와 쓰기를 나누면 그 사이 새 저장이 끼어들어 최신 draft 가 덮인다(TOCTOU).
   */
  putHeadIfUnchanged: (head: LayoutHeadRecord, expectedPayloadHash: string) => Promise<boolean>;
  /** 이 프로필에 사용자가 아직 해소하지 않은 차단 intent 가 있는지. */
  hasBlockedIntent: (ownerKey: string, profileId: string) => Promise<boolean>;
  /** 이 owner 의 미전송 intent 를 `프로필 → revision` 순으로. */
  listIntents: (ownerKey: string) => Promise<LayoutIntentRecord[]>;
  updateIntentState: (mutationId: string, state: LayoutIntentState) => Promise<void>;
  removeIntent: (mutationId: string) => Promise<void>;
};

export type SaveLayoutDeps = {
  store: LayoutLocalStore;
  callSaveLayout: (request: SaveLayoutCallableRequest) => Promise<SaveLayoutCallableResponse>;
  newMutationId: () => string;
  nowMs: () => number;
  installIdHash?: string;
  /**
   * owner 단위 전송 직렬화.
   *
   * drain 끼리만 막으면 부족하다 — 시작 시 기존 intent A 를 보내는 중에 새 편집 B 가 즉시 전송되면
   * B 가 A 보다 먼저 도착하거나, A 의 충돌 판정 전에 B 의 CAS 가 통과해 **사용자의 충돌 선택 없이**
   * 원격 구성을 덮어쓴다. 신규 저장과 drain 이 같은 큐를 공유해야 한다.
   */
  withOwnerLock: <T>(ownerKey: string, operation: () => Promise<T>) => Promise<T>;
  /**
   * 구조화 진단 로깅. **필수다** — optional 로 두면 `browserSaveDeps` 를 거치지 않는 호출에서
   * IndexedDB/callable 실패가 통째로 무음 스왈로우돼 운영 진단 경로가 사라진다.
   * 다단계 IO 라 단계 라벨을 붙여 남긴다.
   *
   * `level` 은 호출부가 **명시**한다. 메시지 문자열로 심각도를 추측하면(예: "실패" 포함 여부)
   * `무결성 오류`·`불일치` 같은 실제 오류가 조용히 debug 채널로 새어 나간다.
   */
  log: (level: "info" | "error", message: string, detail?: Record<string, unknown>) => void;
};

export type SaveLayoutInput = {
  ownerKey: string;
  profileId: string;
  layout: CanonicalLayout;
  expectedRevision: number;
};

export async function saveBikeProfileLayout(
  input: SaveLayoutInput,
  deps: SaveLayoutDeps,
): Promise<SaveLayoutResult> {
  const { ownerKey, profileId, layout } = input;
  const log = deps.log;

  // 대상과 payload 의 프로필이 어긋난 채 저장하면 **다른 프로필의 로컬 head 가 오염**되고,
  // 서버가 거절해도 이미 끝난 로컬 커밋은 되돌아오지 않는다. 쓰기 전에 막는다.
  if (layout.profileId !== profileId) {
    log("error", "[0/3] 대상 프로필 불일치 — 아무 것도 쓰지 않음", {
      ownerKey,
      expected: profileId,
      actual: layout.profileId,
    });
    return { status: "invalidTarget", expected: profileId, actual: layout.profileId };
  }

  return deps.withOwnerLock(ownerKey, () => commitAndSend(input, deps));
}

async function commitAndSend(input: SaveLayoutInput, deps: SaveLayoutDeps): Promise<SaveLayoutResult> {
  const { ownerKey, profileId, layout, expectedRevision } = input;
  const log = deps.log;
  const canonicalPayload = encodeCanonicalLayout(layout);
  const hash = await payloadHash(canonicalPayload);
  const mutationId = deps.newMutationId();
  const now = deps.nowMs();
  const ctx = { ownerKey, profileId, expectedRevision, mutationId };

  const intent: LayoutIntentRecord = {
    mutationId,
    ownerKey,
    profileId,
    expectedRevision,
    canonicalPayload,
    payloadHash: hash,
    createdAtMs: now,
    state: "pending",
  };

  try {
    await deps.store.commitHeadAndIntent(
      {
        // 키 조합은 반드시 `headKey()` 를 거친다 — 여기서 손으로 이어 붙이면 조회 키와 어긋나
        // 저장 직후 읽히지 않고, 구분자가 든 조합은 다른 계정의 head 를 덮어쓴다.
        key: headKey(ownerKey, profileId),
        ownerKey,
        profileId,
        revision: expectedRevision + 1,
        canonicalPayload,
        payloadHash: hash,
        updatedAtMs: now,
      },
      intent,
    );
    log("info", "[1/3] write indexeddb head+intent — 커밋", ctx);
  } catch (cause) {
    log("error", "[1/3] write indexeddb head+intent — 실패, callable 0건", { ...ctx, cause: String(cause) });
    return { status: "localSaveFailed", cause };
  }

  // 차단은 프로필 단위다. drain 지역 상태에만 두면 뒤이어 실행되는 신규 저장이 그대로 CAS 를
  // 통과해 사용자의 충돌 선택 없이 원격 구성을 덮어쓴다.
  //
  // 이 조회/기록도 로컬 커밋 **이후**의 IO 라 예외가 새면 결과 계약이 깨진다. 조회 자체가 실패하면
  // 차단 여부를 모르는 것이므로 **보류**한다(fail-closed).
  let blocked: boolean;
  try {
    blocked = await deps.store.hasBlockedIntent(ownerKey, profileId);
  } catch (cause) {
    log("error", "[2/3] 차단 상태 조회 실패 — 전송 보류(fail-closed)", { ...ctx, cause: String(cause) });
    blocked = true;
  }
  if (blocked) {
    await recordIntentState(deps, mutationId, "blockedConflict", ctx, log);
    log("info", "[2/3] 미해소 충돌이 있어 전송 보류 — 사용자 선택 대기", ctx);
    return { status: "blockedByConflict", intent: { ...intent, state: "blockedConflict" } };
  }

  // 방금 만든 intent 를 곧바로 보내지 않는다. 앞선 저장이 전송 실패로 pending 에 남아 있으면
  // 뒤 편집이 먼저 도착해 거짓 CAS 충돌을 만들고 순서가 뒤집힌다. **프로필 큐를 순서대로** 비운다.
  let results: SaveLayoutResult[];
  try {
    results = await sendProfileQueue(ownerKey, profileId, deps);
  } catch (cause) {
    // durable 저장은 이미 끝났다. 큐 조회 실패로 예외를 내보내면 결과 계약이 깨진다 —
    // intent 는 남아 있으니 다음 drain 이 이어받는다.
    log("error", "[2/3] 프로필 큐 전송 실패 — intent 보존, 다음 drain 이 이어받는다", {
      ...ctx,
      cause: String(cause),
    });
    return { status: "savedPendingSync", intent };
  }
  return results.find((r) => r.status !== "synced") ?? results[results.length - 1] ?? { status: "synced", revision: expectedRevision + 1 };
}

/**
 * 한 프로필의 미전송 intent 를 **revision 순서대로** 보내고, 동기화되지 않은 첫 결과에서 멈춘다.
 *
 * 앞 intent 의 결과를 모르는 채(전송 실패·충돌·차단) 뒤 intent 를 보내면, 뒤 intent 의 CAS 가
 * 거짓으로 통과하거나 거짓 충돌을 만들어 프로필 큐 전체가 막힌다. 신규 저장과 drain 이 같은
 * 함수를 쓴다 — 두 경로가 다른 순서 규칙을 가지면 그 차이가 곧 사고다.
 */
export async function sendProfileQueue(
  ownerKey: string,
  profileId: string,
  deps: SaveLayoutDeps,
): Promise<SaveLayoutResult[]> {
  const all = await deps.store.listIntents(ownerKey);
  const queue = all.filter((i) => i.profileId === profileId);

  // 차단된 intent 가 하나라도 있으면 **그 프로필은 통째로 멈춘다**. 건너뛰고 뒤를 보내면
  // 뒤 intent 의 CAS 가 통과해 사용자의 충돌 해결 없이 원격 구성을 덮어쓴다.
  if (queue.some((i) => i.state === "blockedConflict" || i.state === "quarantined")) {
    deps.log("info", "프로필에 미해소 차단 intent 가 있어 전송하지 않음", { ownerKey, profileId });
    return [];
  }

  const results: SaveLayoutResult[] = [];
  for (const queued of queue) {
    const result = await transmitIntent(queued, deps);
    results.push(result);
    if (result.status !== "synced") break;
  }
  return results;
}

/**
 * 저장된 intent 를 전송한다. 새로고침·브라우저 재시작 뒤 replay 도 이 경로를 쓴다 —
 * intent 의 payload 를 **그대로** 보내야 서버가 같은 mutation 으로 알아본다.
 */
/**
 * intent 상태를 기록한다. 실패해도 **결과 계약(`SaveLayoutResult`)은 유지**하고 로그만 남긴다 —
 * 여기서 던지면 callable 실패 원인이 이 실패에 덮이거나 원격 커밋 뒤 결과가 예외로 새어 나간다.
 *
 * 차단 상태 기록이 실패해 상태가 `inFlight` 에 멈춰도 안전하다: `hasBlockedIntent` 가 `inFlight`
 * 도 차단으로 세므로 후속 전송은 여전히 보류된다(fail-closed).
 */
async function recordIntentState(
  deps: SaveLayoutDeps,
  mutationId: string,
  state: LayoutIntentState,
  ctx: Record<string, unknown>,
  log: SaveLayoutDeps["log"],
): Promise<void> {
  try {
    await deps.store.updateIntentState(mutationId, state);
  } catch (cause) {
    log("error", "intent 상태 기록 실패 — inFlight 로 남아 후속 전송은 보류된다", {
      ...ctx,
      state,
      cause: String(cause),
    });
  }
}

const KNOWN_STATUSES = new Set(["committed", "conflict", "integrityError", "profileDeleted", "writesDisabled"]);
const HEX_64 = /^[0-9a-f]{64}$/u;

/**
 * callable 응답의 **모양**까지 본다. status 만 보면 `{status:"committed"}` 처럼 필드가 빠진 응답도
 * 성공으로 처리해 undefined revision/hash 로 head 를 쓰고 durable intent 를 지운다 — 재시도 근거가
 * 사라진다. 서버가 다른 payloadHash 를 돌려주는 경우도 우리가 보낸 것과 대조한다.
 *
 * @returns 문제가 있으면 사유 문자열, 없으면 null.
 */
function validateResponseShape(
  response: SaveLayoutCallableResponse | undefined,
  intent: LayoutIntentRecord,
): string | null {
  if (!response || typeof response.status !== "string" || !KNOWN_STATUSES.has(response.status)) {
    return "알 수 없는 응답";
  }
  if (response.status === "committed") {
    if (!Number.isInteger(response.revision)) return "committed 인데 revision 이 정수가 아님";
    if (typeof response.payloadHash !== "string" || !HEX_64.test(response.payloadHash)) {
      return "committed 인데 payloadHash 가 64자 hex 가 아님";
    }
    if (response.payloadHash !== intent.payloadHash) {
      return "committed 인데 서버 payloadHash 가 보낸 값과 다름";
    }
  }
  if (response.status === "conflict") {
    if (!Number.isInteger(response.remoteRevision)) return "conflict 인데 remoteRevision 이 정수가 아님";
    if (typeof response.remotePayload !== "string") return "conflict 인데 remotePayload 가 문자열이 아님";
  }
  return null;
}

export async function transmitIntent(
  intent: LayoutIntentRecord,
  deps: SaveLayoutDeps,
): Promise<SaveLayoutResult> {
  const log = deps.log;
  const ctx = {
    ownerKey: intent.ownerKey,
    profileId: intent.profileId,
    expectedRevision: intent.expectedRevision,
    mutationId: intent.mutationId,
  };

  const recordState = (state: LayoutIntentState) =>
    recordIntentState(deps, intent.mutationId, state, ctx, log);

  await recordState("inFlight");

  let response: SaveLayoutCallableResponse;
  try {
    response = await deps.callSaveLayout({
      profileId: intent.profileId,
      expectedRevision: intent.expectedRevision,
      mutationId: intent.mutationId,
      canonicalPayload: intent.canonicalPayload,
      payloadHash: intent.payloadHash,
      installIdHash: deps.installIdHash,
    });
  } catch (cause) {
    log("error", "[2/3] call saveBikeProfileLayout — 전송 실패, intent 보존", { ...ctx, cause: String(cause) });
    await recordState("pending");
    return { status: "savedPendingSync", intent: { ...intent, state: "pending" } };
  }

  // 버전 불일치·malformed 응답이 오면 exhaustive switch 가 undefined 를 반환하고 intent 가
  // `inFlight` 에 영구 잔류한다. **모양까지** 검증하고, 모르는 응답은 전송 실패와 같게 다룬다.
  const shapeError = validateResponseShape(response, intent);
  if (shapeError) {
    log("error", `[2/3] call saveBikeProfileLayout — ${shapeError}, intent 보존`, {
      ...ctx,
      status: String((response as { status?: unknown } | undefined)?.status),
    });
    await recordState("pending");
    return { status: "savedPendingSync", intent: { ...intent, state: "pending" } };
  }

  switch (response.status) {
    case "committed": {
      log("info", "[2/3] call saveBikeProfileLayout — 커밋", { ...ctx, revision: response.revision, replay: response.wasReplay });
      try {
        // head 가 아직 **이 mutation 의 낙관적 값**일 때만 갱신한다(한 트랜잭션 안에서 확인+쓰기).
        // 그 사이 사용자가 다시 편집했다면 뒤 intent 가 자기 차례에 head 를 세운다 —
        // 여기서 덮으면 최신 draft 가 사라진 것처럼 보인다.
        const applied = await deps.store.putHeadIfUnchanged(
          {
            key: headKey(intent.ownerKey, intent.profileId),
            ownerKey: intent.ownerKey,
            profileId: intent.profileId,
            revision: response.revision,
            canonicalPayload: intent.canonicalPayload,
            payloadHash: response.payloadHash,
            updatedAtMs: deps.nowMs(),
          },
          intent.payloadHash,
        );
        if (!applied) log("info", "[3/3] 더 새 draft 가 있어 head 갱신 생략 — 뒤 intent 가 확정한다", ctx);
      } catch (cause) {
        // 원격은 커밋됐지만 로컬 반영이 실패했다. intent 를 지우면 재시도 근거가 사라진다.
        // 같은 mutationId 재전송은 revision 을 올리지 않으므로 보존한 채 다시 시도하는 편이 안전하다.
        log("error", "[3/3] write indexeddb head(원격 확정본) — 실패, intent 보존", { ...ctx, cause: String(cause) });
        await recordState("pending");
        return { status: "savedPendingSync", intent: { ...intent, state: "pending" } };
      }
      try {
        await deps.store.removeIntent(intent.mutationId);
      } catch (cause) {
        // 제거에 실패하면 상태가 `inFlight` 로 남는다. `hasBlockedIntent` 가 그걸 차단으로 세므로
        // 실제 충돌이 없는데도 이 프로필의 동기화가 영구히 막힌다. `pending` 으로 되돌려
        // 다음 drain 이 멱등 replay(= revision 증가 0) 하도록 둔다.
        log("error", "[3/3] intent 제거 실패 — pending 으로 되돌려 다음 drain 이 멱등 replay 한다", {
          ...ctx,
          cause: String(cause),
        });
        await recordState("pending");
        return { status: "savedPendingSync", intent: { ...intent, state: "pending" } };
      }
      log("info", "[3/3] write indexeddb head(원격 확정본) — 완료", ctx);
      return { status: "synced", revision: response.revision };
    }

    case "conflict": {
      log("info", "[2/3] call saveBikeProfileLayout — CAS 충돌", { ...ctx, remoteRevision: response.remoteRevision });
      await recordState("blockedConflict");
      return {
        status: "conflict",
        remoteRevision: response.remoteRevision,
        remotePayload: response.remotePayload,
      };
    }

    case "integrityError":
      log("error", "[2/3] call saveBikeProfileLayout — 무결성 오류(같은 ID 다른 payload)", ctx);
      await recordState("quarantined");
      return { status: "integrityError" };

    case "profileDeleted":
      log("info", "[2/3] call saveBikeProfileLayout — 대상 프로필 삭제됨, target 잠금", ctx);
      await recordState("blockedConflict");
      return { status: "targetDeleted" };

    case "writesDisabled":
      // kill switch 는 신규 write 만 멈춘다. intent 는 보존했다가 해제 뒤 재전송한다.
      log("error", "[2/3] call saveBikeProfileLayout — 서버 kill switch, intent 보존", ctx);
      await recordState("pending");
      return { status: "savedPendingSync", intent: { ...intent, state: "pending" } };
  }
}
