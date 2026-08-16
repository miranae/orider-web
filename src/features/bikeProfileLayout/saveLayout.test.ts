import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CanonicalLayout } from "./canonical";
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

  putHead = vi.fn(async (head: LayoutHeadRecord) => {
    if (this.putHeadFailure) throw this.putHeadFailure;
    this.heads.set(head.key, head);
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
    expect(store.heads.get(`${OWNER}|road`)?.revision).toBe(4);
    expect(store.intents.get("m1")?.state).toBe("pending");
  });

  it("adopts the server revision and clears the intent on success", async () => {
    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps(committed),
    );

    expect(result).toEqual({ status: "synced", revision: 4 });
    expect(store.intents.size).toBe(0);
    expect(store.heads.get(`${OWNER}|road`)?.revision).toBe(4);
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
    expect(store.heads.get(`${OWNER}|road`)?.revision).toBe(4);
  });

  it("blocks the intent on conflict instead of overwriting", async () => {
    const result = await saveBikeProfileLayout(
      { ownerKey: OWNER, profileId: "road", layout, expectedRevision: 3 },
      deps({ status: "conflict", remoteRevision: 9, remotePayload: "{}", remotePayloadHash: "b".repeat(64) }),
    );

    expect(result).toEqual({ status: "conflict", remoteRevision: 9, remotePayload: "{}" });
    expect(store.intents.get("m1")?.state).toBe("blockedConflict");
    expect(store.heads.get(`${OWNER}|road`)?.revision).toBe(4);
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
