import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { parseTodayTrainingDecisionProjection, todayTrainingDecisionProjectionSchema } from "../services/trainingDecisionContract";
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

  it("removes an expired recommendation at its boundary while keeping the scheduled projection available", async () => {
    mocks.get.mockResolvedValue(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledProjectionValidUntil: Date.now() + 120_000,
      recommendationValidUntil: Date.now() + 1_000,
    })));
    const first = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(first.result.current.scheduledOnly).toBe(false);

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(first.result.current.unavailable).toBe(false);
    expect(first.result.current.scheduledOnly).toBe(true);
    expect(first.result.current.decision).toMatchObject({
      mode: "scheduled-only", recommendationValidUntil: null,
      recommendedAdjustments: [], proposal: null,
    });
    expect(first.result.current.decision?.recommendationSource).not.toBeNull();

    first.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    const remounted = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(remounted.result.current.decision).not.toBeNull();
    expect(remounted.result.current.unavailable).toBe(false);
    expect(remounted.result.current.scheduledOnly).toBe(true);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it("removes an expired pending proposal without hiding a still-valid recommendation", async () => {
    const proposalExpiry = Date.now() + 500;
    mocks.get.mockResolvedValue(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledProjectionValidUntil: Date.now() + 120_000,
      recommendationValidUntil: Date.now() + 120_000,
      proposalExpiresAt: Date.now() + 120_000,
      proposal: { proposalId: "proposal_aaaaaaaaaaaaaaaaaaaaaaaa", status: "pending",
        expiresAt: new Date(proposalExpiry).toISOString(), confirmNonce: "a".repeat(32) },
      sourceRefs: { ...trainingDecisionEnvelope().data.sourceRefs,
        proposalId: "proposal_aaaaaaaaaaaaaaaaaaaaaaaa" },
      coachCore: { ...trainingDecisionEnvelope().data.coachCore, proposalStatus: "pending" },
    })));
    const { result } = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.decision?.proposal?.status).toBe("pending");

    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(result.current.unavailable).toBe(false);
    expect(result.current.scheduledOnly).toBe(false);
    expect(result.current.decision?.proposal).toMatchObject({ status: "expired", confirmNonce: null });
    expect(result.current.decision?.proposalExpiresAt).toBe(proposalExpiry);
    expect(result.current.decision?.sourceRefs.proposalId).toBe("proposal_aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(result.current.decision?.capabilities.confirm).toBe("unavailable");
    expect(result.current.decision?.capabilities.decline).toBe("unavailable");
    expect(() => todayTrainingDecisionProjectionSchema.parse(result.current.decision)).not.toThrow();
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

  it("keeps a still-valid decision available across remounts throughout the request floor", async () => {
    mocks.get.mockResolvedValue(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledProjectionValidUntil: Date.now() + 120_000,
    })));
    const first = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    first.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });

    const remounted = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(remounted.result.current.decision).not.toBeNull();
    expect(remounted.result.current.unavailable).toBe(false);
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it("recovers automatically once after an initial transport failure", async () => {
    mocks.get
      .mockRejectedValueOnce(new CoachClientError("transport", "NETWORK_ERROR"))
      .mockResolvedValueOnce(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
        scheduledProjectionValidUntil: Date.now() + 120_000,
      })));
    const { result } = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.unavailable).toBe(true);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(result.current.unavailable).toBe(false);
    expect(result.current.decision).not.toBeNull();
  });

  it("respects Retry-After before opening a retryable 503 half-open probe", async () => {
    const unavailable = Object.assign(new CoachClientError("http", "TEMPORARILY_UNAVAILABLE"), {
      status: 503, retryAfterMs: 12_000,
    });
    mocks.get
      .mockRejectedValueOnce(unavailable)
      .mockResolvedValueOnce(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
        scheduledProjectionValidUntil: Date.now() + 120_000,
      })));
    const { result } = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(11_999); });
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(result.current.unavailable).toBe(false);
  });

  it.each([
    new CoachClientError("http", "HTTP_400"),
    new CoachClientError("configuration", "AI_API_BASE_MISSING"),
    new CoachClientError("contract", "INVALID_TRAINING_DECISION"),
  ])("does not automatically retry a non-transient failure: $code", async (error) => {
    mocks.get.mockRejectedValue(error);
    renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60_000); });
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });

  it("stops transient half-open probes after two bounded retries", async () => {
    mocks.get.mockRejectedValue(new CoachClientError("transport", "NETWORK_ERROR"));
    renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(mocks.get).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60_000); });
    expect(mocks.get).toHaveBeenCalledTimes(3);
  });

  it("preserves the bounded half-open sequence across fast manual refresh and throttle", async () => {
    mocks.get
      .mockRejectedValueOnce(new CoachClientError("transport", "NETWORK_ERROR"))
      .mockRejectedValueOnce(new CoachClientError("transport", "NETWORK_ERROR"))
      .mockRejectedValueOnce(new CoachClientError("transport", "NETWORK_ERROR"))
      .mockResolvedValueOnce(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
        scheduledProjectionValidUntil: Date.now() + 120_000,
      })));
    const { result } = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });

    act(() => result.current.refresh());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    act(() => result.current.refresh());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.get).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.get).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
    expect(mocks.get).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.get).toHaveBeenCalledTimes(4);
    expect(result.current.unavailable).toBe(false);
    expect(result.current.decision).not.toBeNull();
  });

  it("closes automatic recovery when a manual probe changes from transient to contract failure", async () => {
    mocks.get
      .mockRejectedValueOnce(new CoachClientError("transport", "NETWORK_ERROR"))
      .mockRejectedValueOnce(new CoachClientError("contract", "INVALID_TRAINING_DECISION"));
    const { result } = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    act(() => result.current.refresh());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60_000); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("uses a new manual Retry-After without consuming the remaining automatic attempt", async () => {
    const retryAfter = Object.assign(new CoachClientError("http", "TEMPORARILY_UNAVAILABLE"), {
      status: 503, retryAfterMs: 12_000,
    });
    mocks.get
      .mockRejectedValueOnce(new CoachClientError("transport", "NETWORK_ERROR"))
      .mockRejectedValueOnce(retryAfter)
      .mockResolvedValueOnce(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
        scheduledProjectionValidUntil: Date.now() + 120_000,
      })));
    const { result } = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    act(() => result.current.refresh());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(11_999); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.get).toHaveBeenCalledTimes(3);
    expect(result.current.unavailable).toBe(false);
  });

  it("opens a new bounded transient recovery after a permanent circuit and manual transport failure", async () => {
    mocks.get
      .mockRejectedValueOnce(new CoachClientError("contract", "INVALID_TRAINING_DECISION"))
      .mockRejectedValueOnce(new CoachClientError("transport", "NETWORK_ERROR"))
      .mockResolvedValueOnce(parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
        scheduledProjectionValidUntil: Date.now() + 120_000,
      })));
    const { result } = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    act(() => result.current.refresh());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4_999); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(mocks.get).toHaveBeenCalledTimes(3);
    expect(result.current.unavailable).toBe(false);
  });

  it("stops automatic recovery when a manual transient response asks for more than 15 minutes", async () => {
    const longRetryAfter = Object.assign(new CoachClientError("http", "TEMPORARILY_UNAVAILABLE"), {
      status: 503, retryAfterMs: 15 * 60_000 + 1,
    });
    mocks.get
      .mockRejectedValueOnce(new CoachClientError("transport", "NETWORK_ERROR"))
      .mockRejectedValueOnce(longRetryAfter);
    const { result } = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    act(() => result.current.refresh());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(20 * 60_000); });
    expect(mocks.get).toHaveBeenCalledTimes(2);
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
