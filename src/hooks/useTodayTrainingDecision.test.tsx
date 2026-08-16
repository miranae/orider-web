import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { parseTodayTrainingDecisionProjection } from "../services/trainingDecisionContract";
import { trainingDecisionEnvelope } from "../services/trainingDecisionContract.test";
import { useTodayTrainingDecision } from "./useTodayTrainingDecision";

const mocks = vi.hoisted(() => ({ get: vi.fn(), log: vi.fn() }));
vi.mock("../services/trainingDecisionClient", () => ({ getTodayTrainingDecision: mocks.get }));
vi.mock("../services/errorLogger", () => ({ logClientError: mocks.log }));

describe("useTodayTrainingDecision expiry boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00.000Z"));
    vi.clearAllMocks();
    resetRuntimeConfigForTests({ trainingDecisionEnabled: true });
  });
  afterEach(() => vi.useRealTimers());

  it("refetches at the earliest recommendation or scheduled expiry", async () => {
    const now = Date.now();
    const decision = parseTodayTrainingDecisionProjection(trainingDecisionEnvelope({
      scheduledProjectionValidUntil: now + 10_000, recommendationValidUntil: now + 1_000,
    }));
    mocks.get.mockResolvedValue(decision);
    const { result } = renderHook(() => useTodayTrainingDecision("owner", "bike"));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.loading).toBe(false);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_025); });
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
    await act(async () => { await vi.advanceTimersByTimeAsync(525); });
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
});
