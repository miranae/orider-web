import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CanonicalLayout } from "./canonical";
import { headKey } from "./outbox";
import type { LayoutHeadRecord, LayoutIntentRecord, LayoutIntentState } from "./outbox";
import {
  saveBikeProfileLayout,
  transmitIntent,
  type LayoutLocalStore,
  type SaveLayoutCallableRequest,
  type SaveLayoutCallableResponse,
  type SaveLayoutDeps,
} from "./saveLayout";

/**
 * 저장/CAS/outbox 계약 (#1943 §9.1, 수용기준 26·31).
 *
 * Android/iOS 의 `SaveBikeProfileLayoutUseCaseTest` 와 같은 시나리오를 돌린다 — 세 클라이언트가
 * 다른 충돌 정책을 쓰면 사용자가 기기마다 다른 결과를 본다.
 */
const OWNER = "uid:A";

const layout: CanonicalLayout = {
  schemaVersion: 1,
  profileId: "road",
  sport: "CYCLING",
  pages: [
    { columns: 4, rows: 8, fields: [{ type: "SPEED", col: 0, row: 0, colSpan: 4, rowSpan: 2 }] },
  ],
  unknownKeys: {},
};

class FakeStore implements LayoutLocalStore {
  heads = new Map<string, LayoutHeadRecord>();
  intents = new Map<string, LayoutIntentRecord>();
  commitFailure: Error | null = null;
  putHeadFailure: Error | null = null;

  commitHeadAndIntent = vi.fn(async (head: LayoutHeadRecord, intent: LayoutIntentRecord) => {
    // 원자성: 실패하면 둘 다 남기지 않는다.
    if (this.commitFailure) throw this.commitFailure;
    this.heads.set(head.key, head);
    this.intents.set(intent.mutationId, intent);
  });

  putHeadIfUnchanged = vi.fn(async (head: LayoutHeadRecord, expectedPayloadHash: string) => {
    if (this.putHeadFailure) throw this.putHeadFailure;
    const current = this.heads.get(head.key);
    // 확인과 쓰기가 한 트랜잭션이라는 계약을 fake 도 그대로 지킨다.
    if (current && current.payloadHash !== expectedPayloadHash) return false;
    this.heads.set(head.key, head);
    return true;
  });

  updateIntentState = vi.fn(async (mutationId: string, state: LayoutIntentState) => {
    const existing = this.intents.get(mutationId);
    if (existing) this.intents.set(mutationId, { ...existing, state });
  });

  removeIntent = vi.fn(async (mutationId: string) => {
    this.intents.delete(mutationId);
  });
}

let store: FakeStore;
let requests: SaveLayoutCallableRequest[];
let logs: string[];

function deps(response: SaveLayoutCallableResponse | Error): SaveLayoutDeps {
  return {
    store,
    callSaveLayout: async (request) => {
      requests.push(request);
      if (response instanceof Error) throw response;
      return response;
    },
    newMutationId: () => "m1",
    nowMs: () => 2_000,
    log: (_level, message) => logs.push(message),
    withOwnerLock: (_ownerKey, operation) => operation(),
  };
}

const committed: SaveLayoutCallableResponse = {
  status: "committed",
  revision: 4,
  payloadHash: "a".repeat(64),
  wasReplay: false,
};

beforeEach(() => {
  store = new FakeStore();
  requests = [];
  logs = [];
});

describe("saveBikeProfileLayout", () => {
  it("makes zero callable calls and leaves no intent when the local commit fails", async () => {
    store.commitFailure = new Error("quota exceeded");

    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(committed),
    );

    expect(result.status).toBe("localSaveFailed");
    expect(requests).toHaveLength(0);
    expect(store.intents.size).toBe(0);
    expect(store.heads.size).toBe(0);
  });

  it("keeps the local save and the intent when the callable throws", async () => {
    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(new Error("offline")),
    );

    expect(result.status).toBe("savedPendingSync");
    expect(store.heads.get(headKey(OWNER, "road"))?.revision).toBe(4);
    expect(store.intents.get("m1")?.state).toBe("pending");
  });

  it("adopts the server revision and clears the intent on success", async () => {
    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(committed),
    );

    expect(result).toEqual({ status: "synced", revision: 4 });
    expect(store.intents.size).toBe(0);
    expect(store.heads.get(headKey(OWNER, "road"))?.revision).toBe(4);
  });

  it("keeps the intent when writing the server-confirmed head fails", async () => {
    store.putHeadFailure = new Error("quota exceeded");

    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(committed),
    );

    // 원격은 커밋됐지만 로컬 반영이 실패했다. intent 를 지우면 재시도 근거가 사라진다.
    expect(result.status).toBe("savedPendingSync");
    expect(store.intents.get("m1")?.state).toBe("pending");
  });

  it("replays the exact payload without bumping the revision", async () => {
    const replayResponse: SaveLayoutCallableResponse = { ...committed, wasReplay: true };
    const d = deps(replayResponse);

    await saveBikeProfileLayout({ ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 }, d);
    const intent: LayoutIntentRecord = {
      mutationId: "m1",
      ownerKey: OWNER,
      profileId: "road",
      expectedRevision: 3,
      canonicalPayload: requests[0].canonicalPayload,
      payloadHash: requests[0].payloadHash,
      createdAtMs: 2_000,
      state: "pending",
    };
    const replay = await transmitIntent(intent, d);

    expect(replay).toEqual({ status: "synced", revision: 4 });
    expect(requests[1].canonicalPayload).toBe(requests[0].canonicalPayload);
    expect(requests[1].payloadHash).toBe(requests[0].payloadHash);
    expect(store.heads.get(headKey(OWNER, "road"))?.revision).toBe(4);
  });

  it("blocks the intent on conflict instead of overwriting", async () => {
    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps({ status: "conflict", remoteRevision: 9, remotePayload: "{}", remotePayloadHash: "b".repeat(64) }),
    );

    expect(result).toEqual({ status: "conflict", remoteRevision: 9, remotePayload: "{}" });
    expect(store.intents.get("m1")?.state).toBe("blockedConflict");
    expect(store.heads.get(headKey(OWNER, "road"))?.revision).toBe(4);
  });

  it("quarantines the intent on an integrity error", async () => {
    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps({ status: "integrityError" }),
    );

    expect(result.status).toBe("integrityError");
    expect(store.intents.get("m1")?.state).toBe("quarantined");
  });

  it("locks the intent when the target profile was deleted", async () => {
    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps({ status: "profileDeleted" }),
    );

    expect(result.status).toBe("targetDeleted");
    expect(store.intents.get("m1")?.state).toBe("blockedConflict");
  });

  it("preserves the intent while the server write kill switch is on", async () => {
    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps({ status: "writesDisabled" }),
    );

    expect(result.status).toBe("savedPendingSync");
    expect(store.intents.get("m1")?.state).toBe("pending");
  });

  it("does not let intent bookkeeping failures escape the result contract", async () => {
    // 상태 기록은 부가 기록이다. 여기서 던지면 callable 실패 원인이 덮이거나 결과가 예외로 샌다.
    store.updateIntentState = vi.fn(async () => {
      throw new Error("indexeddb closing");
    });

    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(new Error("offline")),
    );

    expect(result.status).toBe("savedPendingSync");
  });

  it("keeps a synced result when removing the intent fails", async () => {
    store.removeIntent = vi.fn(async () => {
      throw new Error("indexeddb closing");
    });

    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(committed),
    );

    // 남은 intent 는 다음 drain 이 멱등 replay 한다.
    expect(result).toEqual({ status: "synced", revision: 4 });
  });

  it("does not clobber a newer local draft when an earlier intent commits", async () => {
    // 앞 intent 커밋 응답이 도착했을 때 사용자가 이미 다시 편집했다면, head 를 덮으면 최신 draft 가
    // outbox 에만 남고 화면에서는 사라진 것처럼 보인다.
    await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(new Error("offline")),
    );
    const newerDraft = { ...store.heads.get(headKey(OWNER, "road"))!, revision: 5, payloadHash: "z".repeat(64) };
    store.heads.set(newerDraft.key, newerDraft);

    const staleIntent: LayoutIntentRecord = {
      mutationId: "m1",
      ownerKey: OWNER,
      profileId: "road",
      expectedRevision: 3,
      canonicalPayload: requests[0].canonicalPayload,
      payloadHash: requests[0].payloadHash,
      createdAtMs: 2_000,
      state: "pending",
    };
    await transmitIntent(staleIntent, deps(committed));

    expect(store.heads.get(headKey(OWNER, "road"))?.revision).toBe(5);
    expect(store.heads.get(headKey(OWNER, "road"))?.payloadHash).toBe("z".repeat(64));
  });

  it("composes the head key through headKey so saves are readable back", async () => {
    // 손으로 이어 붙이면 조회 키와 어긋나 저장 직후 읽히지 않는다(`uid:A` 의 `:` 가 인코딩된다).
    await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(committed),
    );

    expect([...store.heads.keys()]).toEqual([headKey(OWNER, "road")]);
    expect(store.heads.keys().next().value).not.toBe(`${OWNER}|road`);
  });

  it("refuses to write when the payload targets a different profile", async () => {
    // 대상이 어긋난 채 저장하면 다른 프로필의 로컬 head 가 오염되고 되돌릴 수 없다.
    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "mtb", layout, expectedRevision: 3 },
      deps(committed),
    );

    expect(result).toEqual({ status: "invalidTarget", expected: "mtb", actual: "road" });
    expect(store.commitHeadAndIntent).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });

  it("logs every IO stage so failures are diagnosable in production", async () => {
    await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(new Error("offline")),
    );

    expect(logs.some((m) => m.startsWith("[1/3]"))).toBe(true);
    expect(logs.some((m) => m.startsWith("[2/3]") && m.includes("실패"))).toBe(true);
  });

  it("sends the canonical payload and its matching hash", async () => {
    await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(committed),
    );

    expect(requests[0].canonicalPayload).toContain('"profileId":"road"');
    expect(requests[0].payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(requests[0].expectedRevision).toBe(3);
  });
});
