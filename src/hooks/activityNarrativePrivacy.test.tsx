import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityNarrative, useActivityNarrativeWithOptions } from "./useActivityNarrative";
import { auth } from "../services/firebase";
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
  it.each(["full", "peek"])("discards late %s evidence and does not reuse it for a replacement SDK session with the same UID", async (mode) => {
    const api = mode === "full" ? mocks.generate : mocks.peek;
    let release!: (value: unknown) => void;
    api.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const { result, rerender, unmount } = renderHook(() => mode === "full"
      ? useActivityNarrative(`same-sdk-${mode}`, true)
      : useActivityNarrativePeek(`same-sdk-${mode}`, true));
    await waitFor(() => expect(api).toHaveBeenCalledOnce());
    const original = auth.currentUser;
    Object.defineProperty(auth, "currentUser", { configurable: true, writable: true, value: { ...original, uid: "owner" } });
    api.mockResolvedValueOnce({ hit: true, summary: "replacement evidence" });
    rerender();
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data?.summary).toBe("replacement evidence"));
    await act(async () => release({ hit: true, summary: "old private evidence" }));
    expect(result.current.data?.summary).toBe("replacement evidence");
    unmount();
    Object.defineProperty(auth, "currentUser", { configurable: true, writable: true, value: original });
  });

  it("removes saved owner evidence when refreshing reports revoked access", async () => {
    mocks.generate.mockResolvedValueOnce({ summary: "old owner facts" });
    const { result, rerender } = renderHook(({ refresh }) => useActivityNarrativeWithOptions("revoked-grounding", true, "ko", refresh > 0, refresh), { initialProps: { refresh: 0 } });
    await waitFor(() => expect(result.current.data?.summary).toBe("old owner facts"));
    mocks.generate.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "functions/permission-denied" }));
    rerender({ refresh: 1 });
    await waitFor(() => expect(result.current.error).toBe("denied"));
    expect(result.current.data).toBeNull();
  });

  it.each(["narrative_streams_not_ready", "narrative_generation_inputs_changed"])("preserves saved text and timestamp when explicit generation fails with %s", async reason => {
    mocks.generate.mockResolvedValueOnce({ summary: "saved generation", generatedAt: 123 });
    const { result, rerender } = renderHook(({ refresh }) => useActivityNarrativeWithOptions(`typed-${reason}`, true, "ko", refresh > 0, refresh), { initialProps: { refresh: 0 } });
    await waitFor(() => expect(result.current.data?.summary).toBe("saved generation"));
    mocks.generate.mockRejectedValueOnce(Object.assign(Error("input unavailable"), { code: "functions/failed-precondition", details: { reason } }));
    rerender({ refresh: 1 });
    await waitFor(() => expect(result.current.error).toBe("input unavailable"));
    expect(result.current.data?.generatedAt).toBe(123);
    expect(result.current.data?.summary).toBe("saved generation");
    expect(result.current.accessRevoked).toBe(false);
  });

});
