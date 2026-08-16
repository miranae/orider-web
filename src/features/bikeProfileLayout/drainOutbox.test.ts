import { describe, expect, it, vi } from "vitest";

import type { LayoutIntentRecord } from "./outbox";
import type { SaveLayoutCallableResponse, SaveLayoutDeps, LayoutLocalStore } from "./saveLayout";

/**
 * outbox drain 의 차단 전파 (#1943 §9.1).
 *
 * 오프라인 편집이 여러 건 쌓인 상태에서 앞 intent 가 충돌했는데 뒤 intent 를 계속 보내면,
 * 뒤 intent 의 CAS 가 통과해 **사용자의 충돌 선택 없이** 원격 구성을 덮어쓴다.
 */
const listIntentsMock = vi.hoisted(() => vi.fn<[], Promise<LayoutIntentRecord[]>>());

vi.mock("./outbox", () => ({
  listIntents: listIntentsMock,
  commitHeadAndIntent: vi.fn(),
  putHeadIfUnchanged: vi.fn(async () => true),
  hasBlockedIntent: vi.fn(async () => false),
  updateIntentState: vi.fn(),
  removeIntent: vi.fn(),
  headKey: (ownerKey: string, profileId: string) =>
    `${encodeURIComponent(ownerKey)}|${encodeURIComponent(profileId)}`,
}));

vi.mock("../../services/firebase", () => ({ functions: {} }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn(), debugLog: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => vi.fn() }));

const { drainLayoutOutbox, withOwnerLock } = await import("./client");

const OWNER = "uid:A";

function intent(mutationId: string, profileId: string, expectedRevision: number): LayoutIntentRecord {
  return {
    mutationId,
    ownerKey: OWNER,
    profileId,
    expectedRevision,
    canonicalPayload: "{}",
    payloadHash: "a".repeat(64),
    createdAtMs: expectedRevision,
    state: "pending",
  };
}

const noopStore: LayoutLocalStore = {
  commitHeadAndIntent: vi.fn(),
  putHeadIfUnchanged: vi.fn(async () => true),
  hasBlockedIntent: vi.fn(async () => false),
  updateIntentState: vi.fn(),
  removeIntent: vi.fn(),
};

function depsWith(responses: SaveLayoutCallableResponse[], seen: string[]): SaveLayoutDeps {
  let index = 0;
  return {
    store: noopStore,
    callSaveLayout: async (request) => {
      seen.push(request.mutationId);
      return responses[index++] ?? { status: "writesDisabled" };
    },
    newMutationId: () => "unused",
    nowMs: () => 0,
    log: () => {},
    withOwnerLock: (_ownerKey, operation) => operation(),
  };
}

describe("drainLayoutOutbox", () => {
  it("stops sending later intents for a profile once one is blocked by a conflict", async () => {
    listIntentsMock.mockResolvedValue([intent("A", "road", 3), intent("B", "road", 4)]);
    const seen: string[] = [];

    const results = await drainLayoutOutbox(
      OWNER,
      depsWith([{ status: "conflict", remoteRevision: 4, remotePayload: "{}", remotePayloadHash: "b".repeat(64) }], seen),
    );

    expect(seen).toEqual(["A"]);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("conflict");
  });

  it("keeps draining a different profile after one profile is blocked", async () => {
    listIntentsMock.mockResolvedValue([intent("A", "road", 3), intent("B", "mtb", 1)]);
    const seen: string[] = [];

    await drainLayoutOutbox(
      OWNER,
      depsWith(
        [
          { status: "conflict", remoteRevision: 4, remotePayload: "{}", remotePayloadHash: "b".repeat(64) },
          { status: "committed", revision: 2, payloadHash: "c".repeat(64), wasReplay: false },
        ],
        seen,
      ),
    );

    expect(seen).toEqual(["A", "B"]);
  });

  it("surfaces an intent listing failure instead of failing silently", async () => {
    listIntentsMock.mockRejectedValueOnce(new Error("indexeddb blocked"));
    const logs: string[] = [];
    const d = depsWith([], []);
    d.log = (_level, message) => logs.push(message);

    await expect(drainLayoutOutbox(OWNER, d)).rejects.toThrow("indexeddb blocked");
    expect(logs.some((m) => m.startsWith("[0/3]"))).toBe(true);
  });

  it("runs a single drain at a time per owner", async () => {
    // 두 drain 이 같은 snapshot 을 읽으면 프로필별 차단이 무력해진다.
    listIntentsMock.mockResolvedValue([intent("A", "road", 3)]);
    const seen: string[] = [];
    const d = depsWith([{ status: "committed", revision: 4, payloadHash: "c".repeat(64), wasReplay: false }], seen);

    const [first, second] = await Promise.all([drainLayoutOutbox(OWNER, d), drainLayoutOutbox(OWNER, d)]);

    expect(seen).toEqual(["A"]);
    expect(second).toBe(first);
  });

  it("serializes everything on one owner queue so save and drain cannot interleave", async () => {
    // drain 끼리만 막으면, 기존 intent 를 보내는 중에 새 저장이 끼어들어 전송 순서와 충돌 판정이
    // 뒤집힌다. 신규 저장과 drain 이 같은 큐를 타는지 잠금 자체로 검증한다.
    const order: string[] = [];
    const slow = (label: string, ms: number) =>
      withOwnerLock(OWNER, async () => {
        order.push(`${label}:start`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`${label}:end`);
      });

    await Promise.all([slow("drain", 20), slow("save", 0)]);

    expect(order).toEqual(["drain:start", "drain:end", "save:start", "save:end"]);
  });

  it("keeps the queue alive after a failed operation", async () => {
    await expect(
      withOwnerLock(OWNER, () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    await expect(withOwnerLock(OWNER, () => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("does not serialize across different owners", async () => {
    const order: string[] = [];
    await Promise.all([
      withOwnerLock("uid:A", async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push("A");
      }),
      withOwnerLock("uid:B", async () => {
        order.push("B");
      }),
    ]);
    expect(order).toEqual(["B", "A"]);
  });

  it("skips intents already blocked and everything behind them", async () => {
    listIntentsMock.mockResolvedValue([
      { ...intent("A", "road", 3), state: "blockedConflict" },
      intent("B", "road", 4),
    ]);
    const seen: string[] = [];

    const results = await drainLayoutOutbox(OWNER, depsWith([], seen));

    expect(seen).toEqual([]);
    expect(results).toEqual([]);
  });
});
