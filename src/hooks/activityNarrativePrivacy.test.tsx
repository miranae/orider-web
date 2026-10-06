import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityNarrative, useActivityNarrativeWithOptions } from "./useActivityNarrative";
import { useActivityNarrativePeek } from "./useActivityNarrativePeek";

const mocks = vi.hoisted(() => ({ uid: "owner", generate: vi.fn(), peek: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.uid ? { uid: mocks.uid } : null }) }));
vi.mock("../services/activityNarrativeApi", () => ({ generateActivityNarrative: mocks.generate, peekActivityNarrative: mocks.peek }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));

beforeEach(() => { mocks.uid = "owner"; vi.clearAllMocks(); });
describe("activity narrative viewer isolation", () => {
  it("retains a successful full result during refresh failure while isolating activity and language", async () => {
    mocks.generate.mockResolvedValueOnce({ summary: "saved full analysis" });
    const { result, rerender } = renderHook(({ activityId, lang, refreshKey }) => useActivityNarrativeWithOptions(activityId, true, lang, refreshKey > 0, refreshKey), {
      initialProps: { activityId: "full-refresh-retention", lang: "ko" as "ko" | "en", refreshKey: 0 },
    });
    await waitFor(() => expect(result.current.data?.summary).toBe("saved full analysis"));
    let rejectRefresh!: (error: Error) => void;
    mocks.generate.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRefresh = reject; }));
    rerender({ activityId: "full-refresh-retention", lang: "ko", refreshKey: 1 });
    expect(result.current.loading).toBe(true);
    expect(result.current.data?.summary).toBe("saved full analysis");
    await act(async () => rejectRefresh(new Error("refresh failed")));
    expect(result.current.error).toBe("refresh failed");
    expect(result.current.data?.summary).toBe("saved full analysis");
    mocks.generate.mockImplementation(() => new Promise(() => {}));
    rerender({ activityId: "full-refresh-retention", lang: "en", refreshKey: 1 });
    expect(result.current.data).toBeNull();
    rerender({ activityId: "other-full-refresh-retention", lang: "ko", refreshKey: 1 });
    expect(result.current.data).toBeNull();
  });

  it("does not retain owner generation data after account switch or logout", async () => {
    mocks.generate.mockResolvedValueOnce({ summary: "private owner" }).mockResolvedValueOnce({ summary: "public" }).mockResolvedValueOnce({ summary: "anonymous" });
    const { result, rerender } = renderHook(() => useActivityNarrative("generated-private-test", true));
    await waitFor(() => expect(result.current.data?.summary).toBe("private owner"));
    act(() => { mocks.uid = "other"; rerender(); });
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data?.summary).toBe("public"));
    expect(mocks.generate).toHaveBeenCalledTimes(2);
    act(() => { mocks.uid = ""; rerender(); });
    expect(result.current.data).toBeNull();
  });

  it("does not reuse private peek results for an anonymous visitor", async () => {
    mocks.peek.mockResolvedValueOnce({ hit: true, summary: "private owner" }).mockResolvedValueOnce({ hit: true, summary: "public" });
    const { result, rerender } = renderHook(() => useActivityNarrativePeek("peek-private-test", true));
    await waitFor(() => expect(result.current.data?.summary).toBe("private owner"));
    act(() => { mocks.uid = ""; rerender(); });
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data?.summary).toBe("public"));
    expect(mocks.peek).toHaveBeenCalledTimes(2);
  });
});
