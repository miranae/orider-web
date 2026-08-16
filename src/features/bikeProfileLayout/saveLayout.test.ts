import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeCanonicalLayout, payloadHash, type CanonicalLayout } from "./canonical";
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

  listIntents = vi.fn(async (ownerKey: string) =>
    [...this.intents.values()]
      .filter((i) => i.ownerKey === ownerKey)
      .sort(
        (a, b) =>
          (a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0) ||
          a.expectedRevision - b.expectedRevision ||
          a.createdAtMs - b.createdAtMs,
      ),
  );

  hasBlockedIntent = vi.fn(async (_ownerKey: string, profileId: string) =>
    [...this.intents.values()].some(
      (i) => i.profileId === profileId && (i.state === "blockedConflict" || i.state === "quarantined"),
    ),
  );
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

/**
 * 서버는 자신이 정규화해 계산한 payloadHash 를 돌려준다. 우리가 보낸 것과 같아야 정상이므로
 * 픽스처도 **진짜 canonical 해시**를 쓴다 — 가짜 해시를 쓰면 응답 모양 검증이 (정당하게) 막는다.
 */
let committed: SaveLayoutCallableResponse;

beforeAll(async () => {
  committed = {
    status: "committed",
    revision: 4,
    payloadHash: await payloadHash(encodeCanonicalLayout(layout)),
    wasReplay: false,
  };
});

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
      deps({
        status: "conflict",
        remoteRevision: 9,
        remotePayload: "{}",
        remotePayloadHash: await payloadHash("{}"),
      }),
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

  it("drains an earlier pending intent before the new one so order cannot invert", async () => {
    // 앞 저장이 전송 실패로 pending 에 남았는데 새 저장을 바로 보내면 순서가 뒤집혀 거짓 충돌이 난다.
    await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(new Error("offline")),
    );
    expect(store.intents.get("m1")?.state).toBe("pending");
    requests.length = 0;

    await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 4 },
      { ...deps(committed), newMutationId: () => "m2" },
    );

    // 앞선 m1 이 먼저 나가야 한다.
    expect(requests.map((r) => r.mutationId)).toEqual(["m1", "m2"]);
  });

  it("does not leave the profile permanently blocked when intent removal fails", async () => {
    // 제거 실패로 inFlight 에 남으면 `hasBlockedIntent` 가 차단으로 세어 이후 저장이 영구히 막힌다.
    store.removeIntent = vi.fn(async () => {
      throw new Error("indexeddb closing");
    });

    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(committed),
    );

    expect(result.status).toBe("savedPendingSync");
    expect(store.intents.get("m1")?.state).toBe("pending");
  });

  it("keeps the result contract when listing the profile queue fails", async () => {
    store.listIntents = vi.fn(async () => {
      throw new Error("indexeddb blocked");
    });

    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(committed),
    );

    expect(result.status).toBe("savedPendingSync");
  });

  it.each([
    ["알 수 없는 status", { status: "somethingNew" } as never],
    ["revision 누락", { status: "committed", payloadHash: "a".repeat(64), wasReplay: false } as never],
    ["payloadHash 누락", { status: "committed", revision: 4, wasReplay: false } as never],
    [
      "보낸 것과 다른 payloadHash",
      { status: "committed", revision: 4, payloadHash: "f".repeat(64), wasReplay: false } as never,
    ],
    ["conflict 인데 remoteRevision 누락", { status: "conflict", remotePayload: "{}" } as never],
    [
      "conflict 인데 remotePayloadHash 가 본문과 불일치",
      { status: "conflict", remoteRevision: 9, remotePayload: "{}", remotePayloadHash: "b".repeat(64) } as never,
    ],
    [
      "revision 이 expected+1 이 아님",
      { status: "committed", revision: 99, payloadHash: "a".repeat(64), wasReplay: false } as never,
    ],
  ])("keeps the intent when the callable response is malformed (%s)", async (_label, response) => {
    // status 만 보면 필드가 빠진 응답도 성공으로 처리해 undefined 로 head 를 쓰고 intent 를 지운다.
    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(response),
    );

    expect(result.status).toBe("savedPendingSync");
    expect(store.intents.get("m1")?.state).toBe("pending");
  });

  it("holds a new save while an unresolved conflict exists on that profile", async () => {
    // 차단이 drain 지역 상태에만 있으면, 뒤이어 실행되는 신규 저장이 CAS 를 통과해
    // 사용자의 충돌 선택 없이 원격 구성을 덮어쓴다.
    await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps({
        status: "conflict",
        remoteRevision: 4,
        remotePayload: "{}",
        remotePayloadHash: await payloadHash("{}"),
      }),
    );
    const before = requests.length;

    const second = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 4 },
      { ...deps(committed), newMutationId: () => "m2" },
    );

    expect(second.status).toBe("blockedByConflict");
    expect(requests).toHaveLength(before);
    expect(store.intents.get("m2")?.state).toBe("blockedConflict");
  });

  it("retries a stuck inFlight intent before the new one instead of deadlocking", async () => {
    // `inFlight` 는 "결과를 모른다 = 다시 보내라" 다. 이걸 차단으로 세면 새 저장이 스스로를 blocked
    // 로 만들고, 큐 전체가 멈춰 원래 intent 도 영영 재전송되지 않는다(충돌 없이 동기화 영구 정지).
    await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(new Error("offline")),
    );
    store.intents.set("m1", { ...store.intents.get("m1")!, state: "inFlight" });
    requests.length = 0;

    await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 4 },
      { ...deps(committed), newMutationId: () => "m2" },
    );

    // 멈춘 m1 이 먼저 재전송되고, 그 뒤에 m2 가 나간다.
    expect(requests.map((r) => r.mutationId)).toEqual(["m1", "m2"]);
  });

  it("holds the send on a transient blocked-state lookup failure without marking a fake conflict", async () => {
    // 일시 실패를 실제 충돌로 기록하면 해소용 remote payload 도 없이 그 프로필이 영구 정지한다.
    store.hasBlockedIntent = vi.fn(async () => {
      throw new Error("indexeddb blocked");
    });

    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(committed),
    );

    expect(result.status).toBe("savedPendingSync");
    expect(requests).toHaveLength(0);
    expect(store.intents.get("m1")?.state).toBe("pending");
  });

  it("refuses to write a layout that breaks canonical v1 rules", async () => {
    // 검증 없이 커밋하면 손상된 로컬 head 와 quarantined intent 가 남아 프로필 동기화가 막힌다.
    const overlapping: CanonicalLayout = {
      ...layout,
      pages: [
        {
          columns: 4,
          rows: 4,
          fields: [
            { type: "SPEED", col: 0, row: 0, colSpan: 2, rowSpan: 2 },
            { type: "POWER", col: 1, row: 1, colSpan: 1, rowSpan: 1 },
          ],
        },
      ],
    };

    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout: overlapping, expectedRevision: 3 },
      deps(committed),
    );

    expect(result.status).toBe("invalidPayload");
    expect(store.commitHeadAndIntent).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });

  it("refuses a running layout on the bike profile path", async () => {
    const running: CanonicalLayout = { ...layout, sport: "RUNNING" };

    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout: running, expectedRevision: 3 },
      deps(committed),
    );

    expect(result.status).toBe("invalidPayload");
    expect(store.commitHeadAndIntent).not.toHaveBeenCalled();
  });

  it("refuses a non-integer expectedRevision", async () => {
    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: Number.NaN },
      deps(committed),
    );

    expect(result.status).toBe("invalidPayload");
    expect(store.commitHeadAndIntent).not.toHaveBeenCalled();
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
