import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { parseTodayTrainingDecisionProjection } from "../services/trainingDecisionContract";
import { trainingDecisionEnvelope } from "../services/trainingDecisionContract.test";
import { resetTodayTrainingDecisionGuardForTests } from "../services/todayTrainingDecisionGuard";
import { CoachClientError } from "../services/coachClient";
import { useTodayTrainingDecision } from "./useTodayTrainingDecision";

const mocks = vi.hoisted(() => ({ get: vi.fn(), log: vi.fn(), currentUid: "owner" }));
vi.mock("../services/trainingDecisionClient", () => ({
  getTodayTrainingDecision: mocks.get,
  assertTodayTrainingDecisionIdentity: (expectedUid: string) => {
    if (mocks.currentUid !== expectedUid) throw new Error("AUTH_IDENTITY_CHANGED");
  },
}));
vi.mock("../services/errorLogger", () => ({ logClientError: mocks.log }));

describe("useTodayTrainingDecision expiry boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00.000Z"));
    vi.clearAllMocks();
    mocks.currentUid = "owner";
    resetTodayTrainingDecisionGuardForTests();
    resetRuntimeConfigForTests({ trainingDecisionEnabled: true });
  });
  afterEach(() => vi.useRealTimers());

  it("rate-limits automatic refetch when the earliest expiry is near", async () => {
    const now = Date.now();
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledProjectionValidUntil: now + 10_000, recommendationValidUntil: now + 1_000,
    }));
    mocks.get.mockResolvedValue(decision);
    const { result } = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.loading).toBe(false);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(59_999); });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("keeps the success rate limit across a remount after a near expiry", async () => {
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledProjectionValidUntil: Date.now() + 1_000, recommendationValidUntil: null,
    }));
    mocks.get.mockResolvedValue(decision);
    const first = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); });
    first.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });

    renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(57_999); });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("refetches at an earlier pending proposal expiry", async () => {
    const now = Date.now();
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledProjectionValidUntil: now + 10_000, recommendationValidUntil: now + 1_000,
      proposalExpiresAt: now + 500, proposal: { proposalId: "proposal_aaaaaaaaaaaaaaaaaaaaaaaa", status: "pending",
        expiresAt: new Date(now + 500).toISOString(), confirmNonce: "a".repeat(32) },
    }));
    mocks.get.mockResolvedValue(decision);
    renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(59_999); });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("rejects an already expired scheduled projection instead of rendering it", async () => {
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledProjectionValidUntil: Date.now() - 1, recommendationValidUntil: null,
      recommendationSource: null, recommendedAdjustments: [], loadAdjustment: null, mode: "scheduled-only",
      sourceRefs: { factsId: null, prescriptionId: null, snapshotRevision: null, planRevision: "plan_123", rulesVersion: null,
        proposalId: null, receiptAuditId: null }, fallback: { active: true, reasonCode: "dependency_unavailable" },
    }));
    mocks.get.mockResolvedValue(decision);
    const { result } = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.loading).toBe(false);
    expect(result.current.decision).toBeNull();
    expect(result.current.unavailable).toBe(true);
    expect(mocks.log).toHaveBeenCalledWith("useTodayTrainingDecision.load", expect.any(Error), { discipline: "bike" });
  });

  it("shares one request across an unmount/remount storm and reuses the short success cache", async () => {
    let resolveRequest!: (decision: ReturnType<typeof parseTodayTrainingDecisionProjection>) => void;
    const request = new Promise<ReturnType<typeof parseTodayTrainingDecisionProjection>>((resolve) => {
      resolveRequest = resolve;
    });
    mocks.get.mockReturnValue(request);

    const first = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); });
    first.unmount();
    const second = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.get).toHaveBeenCalledTimes(1);

    resolveRequest(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledProjectionValidUntil: Date.now() + 60_000,
    })));
    await act(async () => { await request; });
    expect(second.result.current.loading).toBe(false);
    second.unmount();

    const third = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); });
    expect(third.result.current.loading).toBe(false);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it("opens a remount-safe circuit after a contract failure and recovers on explicit refresh", async () => {
    mocks.get.mockRejectedValueOnce(new Error("INVALID_TRAINING_DECISION"));
    const first = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(first.result.current.unavailable).toBe(true);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.log).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(second.result.current.unavailable).toBe(true);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.log).toHaveBeenCalledTimes(1);

    mocks.get.mockResolvedValueOnce(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledProjectionValidUntil: Date.now() + 60_000,
    })));
    act(() => second.result.current.refresh());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(second.result.current.unavailable).toBe(false);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("throttles repeated manual refresh attempts without resetting the failure circuit", async () => {
    mocks.get.mockRejectedValue(new Error("INVALID_TRAINING_DECISION"));
    const { result } = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.get).toHaveBeenCalledTimes(1);

    act(() => result.current.refresh());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    act(() => result.current.refresh());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.get).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    act(() => result.current.refresh());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.get).toHaveBeenCalledTimes(3);
  });

  it("does not let an aborted earlier discipline overwrite the current result", async () => {
    let resolveBike!: (decision: ReturnType<typeof parseTodayTrainingDecisionProjection>) => void;
    mocks.get.mockImplementation((_uid: string, discipline: "bike" | "run") => discipline === "bike"
      ? new Promise((resolve) => { resolveBike = resolve; })
      : Promise.resolve(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
          discipline: "run", targetDiscipline: "run", scheduledProjectionValidUntil: Date.now() + 60_000,
        }))));
    const { result, rerender } = renderHook(
      ({ discipline }) => useTodayTrainingDecision("owner", discipline),
      { initialProps: { discipline: "bike" as "bike" | "run" } },
    );
    await act(async () => { await Promise.resolve(); });
    rerender({ discipline: "run" });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.decision?.discipline).toBe("run");

    resolveBike(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledProjectionValidUntil: Date.now() + 60_000,
    })));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.decision?.discipline).toBe("run");
  });

  it("does not serve or retain an old user's cached decision after an auth transition", async () => {
    mocks.get.mockResolvedValue(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledProjectionValidUntil: Date.now() + 60_000,
    })));
    const first = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(first.result.current.decision).not.toBeNull();
    first.unmount();

    mocks.currentUid = "next-owner";
    const staleOwner = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(staleOwner.result.current.decision).toBeNull();
    expect(staleOwner.result.current.unavailable).toBe(true);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    staleOwner.unmount();

    mocks.currentUid = "owner";
    renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("drops an in-flight result when auth changes before delivery", async () => {
    let resolveRequest!: (decision: ReturnType<typeof parseTodayTrainingDecisionProjection>) => void;
    mocks.get.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const { result } = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); });
    mocks.currentUid = "next-owner";
    resolveRequest(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledProjectionValidUntil: Date.now() + 60_000,
    })));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.decision).toBeNull();
    expect(result.current.unavailable).toBe(true);

    mocks.currentUid = "owner";
    mocks.get.mockResolvedValue(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledProjectionValidUntil: Date.now() + 60_000,
    })));
    renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("does not leave a cooldown after the real request rejects an auth transition", async () => {
    mocks.get.mockRejectedValueOnce(new CoachClientError("auth", "AUTH_IDENTITY_CHANGED"));
    const first = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(first.result.current.unavailable).toBe(true);
    first.unmount();

    mocks.get.mockResolvedValueOnce(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledProjectionValidUntil: Date.now() + 60_000,
    })));
    const returnedOwner = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(returnedOwner.result.current.decision).not.toBeNull();
    expect(returnedOwner.result.current.unavailable).toBe(false);
  });
});
