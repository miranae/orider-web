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
  putHead: vi.fn(),
  updateIntentState: vi.fn(),
  removeIntent: vi.fn(),
}));

vi.mock("../../services/firebase", () => ({ functions: {} }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn(), debugLog: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => vi.fn() }));

const { drainLayoutOutbox } = await import("./client");

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
  putHead: vi.fn(),
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
