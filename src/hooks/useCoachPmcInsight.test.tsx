import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import parity from "../features/coach/__fixtures__/pmc-fitness-parity.json";
import { parseCoachPmcInsight } from "../services/coachPmcInsightContract";
import { useCoachPmcInsight } from "./useCoachPmcInsight";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../services/coachClient", async (original) => ({
  ...(await original()), getCoachPmcInsight: mocks.get,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("useCoachPmcInsight", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not fetch while the dedicated flag is off or the user is signed out", () => {
    const { rerender } = renderHook(({ uid, enabled }) => useCoachPmcInsight(uid, "bike", enabled), {
      initialProps: { uid: "owner" as string | undefined, enabled: false },
    });
    expect(mocks.get).not.toHaveBeenCalled();
    rerender({ uid: undefined, enabled: true });
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("clears immediately on uid or discipline generation changes and discards late responses", async () => {
    const bike = deferred<ReturnType<typeof parseCoachPmcInsight>>();
    const run = deferred<ReturnType<typeof parseCoachPmcInsight>>();
    mocks.get.mockImplementation((discipline: string) => discipline === "bike" ? bike.promise : run.promise);
    const { result, rerender } = renderHook(({ uid, discipline }) => useCoachPmcInsight(uid, discipline, true), {
      initialProps: { uid: "owner-a", discipline: "bike" as "bike" | "run" },
    });
    expect(result.current.loading).toBe(true);
    rerender({ uid: "owner-a", discipline: "run" });
    expect(result.current).toMatchObject({ insight: null, loading: true });

    const bikeInsight = parseCoachPmcInsight(parity.cardEnvelope);
    await act(async () => bike.resolve(bikeInsight));
    expect(result.current.insight).toBeNull();

    const runEnvelope = structuredClone(parity.cardEnvelope) as any;
    runEnvelope.data.discipline = "run";
    const runInsight = parseCoachPmcInsight(runEnvelope);
    await act(async () => run.resolve(runInsight));
    await waitFor(() => expect(result.current.insight?.discipline).toBe("run"));

    rerender({ uid: "owner-b", discipline: "run" });
    expect(result.current.insight).toBeNull();
  });
});
