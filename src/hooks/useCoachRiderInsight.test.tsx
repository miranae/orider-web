import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import parity from "../features/coach/__fixtures__/rider-insight-parity.json";
import { parseCoachRiderInsight } from "../services/coachRiderInsightContract";
import { useCoachRiderInsight } from "./useCoachRiderInsight";

const mocks = vi.hoisted(() => ({ get: vi.fn(), log: vi.fn() }));
vi.mock("../services/coachClient", async (original) => ({ ...(await original()), getCoachRiderInsight: mocks.get }));
vi.mock("../services/errorLogger", () => ({ logClientError: mocks.log }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

describe("useCoachRiderInsight", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not fetch while the dedicated flag is off or signed out", () => {
    const { rerender } = renderHook(({ uid, enabled }) => useCoachRiderInsight(uid, enabled), { initialProps: { uid: "owner" as string | undefined, enabled: false } });
    expect(mocks.get).not.toHaveBeenCalled(); rerender({ uid: undefined, enabled: true }); expect(mocks.get).not.toHaveBeenCalled();
  });
  it("clears on identity generation changes and discards late owner responses", async () => {
    const first = deferred<ReturnType<typeof parseCoachRiderInsight>>();
    const second = deferred<ReturnType<typeof parseCoachRiderInsight>>();
    mocks.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ uid }) => useCoachRiderInsight(uid, true), { initialProps: { uid: "owner-a" } });
    rerender({ uid: "owner-b" }); expect(result.current).toMatchObject({ insight: null, loading: true });
    await act(async () => first.resolve(parseCoachRiderInsight(parity.cardEnvelope))); expect(result.current.insight).toBeNull();
    await act(async () => second.resolve(parseCoachRiderInsight(parity.cardEnvelope)));
    await waitFor(() => expect(result.current.insight?.snapshotId).toBe("rider_aaaaaaaaaaaaaaaaaaaaaaaa"));
  });
  it("logs current request failures with rider context", async () => {
    const error = new Error("rider insight failed"); mocks.get.mockRejectedValue(error);
    const { result } = renderHook(() => useCoachRiderInsight("owner-a", true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.log).toHaveBeenCalledWith("useCoachRiderInsight.load", error, { uid: "owner-a" });
  });
});
