import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BikeThresholdDecisionV2 } from "@shared/types/threshold";
import { useBikeFtpDecision } from "./useBikeFtpDecision";

type Subscription = {
  target: { kind: string; path: string; constraints?: unknown[] };
  next: (snapshot: unknown) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({ subscriptions: [] as Subscription[] }));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, ...parts: string[]) => ({ kind: "collection", path: parts.join("/") })),
  doc: vi.fn((base: { path?: string }, ...parts: string[]) => ({
    kind: "document",
    path: base?.path ? [base.path, ...parts].join("/") : parts.join("/"),
  })),
  limit: vi.fn((value: number) => ({ kind: "limit", value })),
  orderBy: vi.fn((field: string, direction: string) => ({ kind: "orderBy", field, direction })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ kind: "where", field, op, value })),
  query: vi.fn((base: { path: string }, ...constraints: unknown[]) => ({ kind: "query", path: base.path, constraints })),
  onSnapshot: vi.fn((target, next) => {
    const unsubscribe = vi.fn();
    mocks.subscriptions.push({ target, next, unsubscribe });
    return unsubscribe;
  }),
}));
// 훅이 useFirebaseServices() 로 받게 바뀌면서(#847) 기본 컨텍스트가 이 모듈 전체를 읽는다.
vi.mock("../services/firebase", () => ({
  firestore: {},
  auth: {},
  functions: {},
  ensureAppCheckReady: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));

function decision(id: string, activityId: string, mutationId?: string): BikeThresholdDecisionV2 {
  return {
    schemaVersion: 2,
    decisionId: id,
    status: mutationId ? "accepted" : "actionable",
    createdAt: 100,
    expiresAt: 200,
    candidate: { ftp: 265, currentFtp: 250, deltaW: 15, deltaPct: 6, method: "activity_20m_095" },
    evidence: { powerSource: "measured", activityId, activityRevision: "activity-r1", pdcRevision: "pdc-r1" },
    expectedRevisions: { ftp: "ftp-r1", pdc: "pdc-r1", impactPreview: "impact-r1" },
    confidence: { level: "high", score: 0.9, reasons: ["measured_power"] },
    impactPreview: { revision: "impact-r1", effectiveFrom: "next_ride", workoutScalePct: 106 },
    ...(mutationId ? { ftpMutationId: mutationId, ftpGeneration: 2 } : {}),
  };
}

function querySnapshot(value: BikeThresholdDecisionV2) {
  return { docs: [{ id: value.decisionId, data: () => value }] };
}

describe("useBikeFtpDecision subscription ownership", () => {
  beforeEach(() => {
    mocks.subscriptions.length = 0;
  });

  it("ignores an old account callback after the uid scope changes", () => {
    const { result, rerender } = renderHook(
      ({ uid }) => useBikeFtpDecision({ uid }),
      { initialProps: { uid: "uid-a" } },
    );
    const oldSubscription = mocks.subscriptions[0]!;
    rerender({ uid: "uid-b" });
    const newSubscription = mocks.subscriptions[1]!;

    act(() => oldSubscription.next(querySnapshot(decision("bike-ftp-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "activity-a"))));
    expect(result.current.decision).toBeNull();

    act(() => newSubscription.next(querySnapshot(decision("bike-ftp-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "activity-b"))));
    expect(result.current.decision?.evidence.activityId).toBe("activity-b");
    expect(oldSubscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it("queries latest device receipts by ftpRevision", async () => {
    renderHook(() => useBikeFtpDecision({ uid: "uid-a" }));
    act(() => mocks.subscriptions[0]!.next(querySnapshot(
      decision("bike-ftp-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "activity-a", "threshold:mutation-1"),
    )));
    await waitFor(() => expect(mocks.subscriptions).toHaveLength(3));
    const deviceQuery = mocks.subscriptions.find((item) => item.target.path.endsWith("deviceStateReceipts"))!;
    expect(deviceQuery.target.constraints).toContainEqual({
      kind: "where",
      field: "ftpRevision",
      op: "==",
      value: "threshold:mutation-1",
    });
  });
});
