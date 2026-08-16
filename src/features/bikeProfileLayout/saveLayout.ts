import { encodeCanonicalLayout, payloadHash, type CanonicalLayout } from "./canonical";
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
  | { status: "invalidTarget"; expected: string; actual: string };

/**
 * 로컬 저장 경계. 실제 구현은 `outbox.ts`(IndexedDB) 지만, 오케스트레이션이 이 포트만 알면
 * 분기 전체를 인메모리로 검증할 수 있다 — Android/iOS 의 `LayoutLocalTransaction` 과 같은 모양.
 */
export type LayoutLocalStore = {
  /** head 와 intent 를 **한 트랜잭션**에 커밋한다. 하나라도 실패하면 둘 다 롤백돼야 한다. */
  commitHeadAndIntent: (head: LayoutHeadRecord, intent: LayoutIntentRecord) => Promise<void>;
  putHead: (head: LayoutHeadRecord) => Promise<void>;
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
   * 구조화 진단 로깅. **필수다** — optional 로 두면 `browserSaveDeps` 를 거치지 않는 호출에서
   * IndexedDB/callable 실패가 통째로 무음 스왈로우돼 운영 진단 경로가 사라진다.
   * 다단계 IO 라 단계 라벨을 붙여 남긴다.
   */
  log: (message: string, detail?: Record<string, unknown>) => void;
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
  const { ownerKey, profileId, layout, expectedRevision } = input;
  const log = deps.log;

  // 대상과 payload 의 프로필이 어긋난 채 저장하면 **다른 프로필의 로컬 head 가 오염**되고,
  // 서버가 거절해도 이미 끝난 로컬 커밋은 되돌아오지 않는다. 쓰기 전에 막는다.
  if (layout.profileId !== profileId) {
    log("[0/3] 대상 프로필 불일치 — 아무 것도 쓰지 않음", {
      ownerKey,
      expected: profileId,
      actual: layout.profileId,
    });
    return { status: "invalidTarget", expected: profileId, actual: layout.profileId };
  }

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
        key: `${ownerKey}|${profileId}`,
        ownerKey,
        profileId,
        revision: expectedRevision + 1,
        canonicalPayload,
        payloadHash: hash,
        updatedAtMs: now,
      },
      intent,
    );
    log("[1/3] write indexeddb head+intent — 커밋", ctx);
  } catch (cause) {
    log("[1/3] write indexeddb head+intent — 실패, callable 0건", { ...ctx, cause: String(cause) });
    return { status: "localSaveFailed", cause };
  }

  return transmitIntent(intent, deps);
}

/**
 * 저장된 intent 를 전송한다. 새로고침·브라우저 재시작 뒤 replay 도 이 경로를 쓴다 —
 * intent 의 payload 를 **그대로** 보내야 서버가 같은 mutation 으로 알아본다.
 */
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

  /**
   * intent 상태 기록은 **부가 기록**이다. 여기서 던지면 callable 실패 원인이 이 실패에 덮이거나
   * 원격 커밋 뒤 결과가 예외로 새어 나가 `SaveLayoutResult` 계약이 깨진다. 삼키고 로그만 남긴다.
   */
  const recordState = async (state: LayoutIntentState) => {
    try {
      await deps.store.updateIntentState(intent.mutationId, state);
    } catch (cause) {
      log("intent 상태 기록 실패 — 결과 계약은 유지", { ...ctx, state, cause: String(cause) });
    }
  };

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
    log("[2/3] call saveBikeProfileLayout — 전송 실패, intent 보존", { ...ctx, cause: String(cause) });
    await recordState("pending");
    return { status: "savedPendingSync", intent: { ...intent, state: "pending" } };
  }

  switch (response.status) {
    case "committed": {
      log("[2/3] call saveBikeProfileLayout — 커밋", { ...ctx, revision: response.revision, replay: response.wasReplay });
      try {
        await deps.store.putHead({
          key: `${intent.ownerKey}|${intent.profileId}`,
          ownerKey: intent.ownerKey,
          profileId: intent.profileId,
          revision: response.revision,
          canonicalPayload: intent.canonicalPayload,
          payloadHash: response.payloadHash,
          updatedAtMs: deps.nowMs(),
        });
      } catch (cause) {
        // 원격은 커밋됐지만 로컬 반영이 실패했다. intent 를 지우면 재시도 근거가 사라진다.
        // 같은 mutationId 재전송은 revision 을 올리지 않으므로 보존한 채 다시 시도하는 편이 안전하다.
        log("[3/3] write indexeddb head(원격 확정본) — 실패, intent 보존", { ...ctx, cause: String(cause) });
        await recordState("pending");
        return { status: "savedPendingSync", intent: { ...intent, state: "pending" } };
      }
      try {
        await deps.store.removeIntent(intent.mutationId);
      } catch (cause) {
        // 남은 intent 는 다음 drain 에서 replay 되고, replay 는 revision 을 올리지 않아 안전하다.
        log("[3/3] intent 제거 실패 — 다음 drain 이 멱등 replay 한다", { ...ctx, cause: String(cause) });
      }
      log("[3/3] write indexeddb head(원격 확정본) — 완료", ctx);
      return { status: "synced", revision: response.revision };
    }

    case "conflict": {
      log("[2/3] call saveBikeProfileLayout — CAS 충돌", { ...ctx, remoteRevision: response.remoteRevision });
      await recordState("blockedConflict");
      return {
        status: "conflict",
        remoteRevision: response.remoteRevision,
        remotePayload: response.remotePayload,
      };
    }

    case "integrityError":
      log("[2/3] call saveBikeProfileLayout — 무결성 오류(같은 ID 다른 payload)", ctx);
      await recordState("quarantined");
      return { status: "integrityError" };

    case "profileDeleted":
      log("[2/3] call saveBikeProfileLayout — 대상 프로필 삭제됨, target 잠금", ctx);
      await recordState("blockedConflict");
      return { status: "targetDeleted" };

    case "writesDisabled":
      // kill switch 는 신규 write 만 멈춘다. intent 는 보존했다가 해제 뒤 재전송한다.
      log("[2/3] call saveBikeProfileLayout — 서버 kill switch, intent 보존", ctx);
      await recordState("pending");
      return { status: "savedPendingSync", intent: { ...intent, state: "pending" } };
  }
}
