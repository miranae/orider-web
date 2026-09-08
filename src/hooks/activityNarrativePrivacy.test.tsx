import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActivityNarrative } from "./useActivityNarrative";
import { useActivityNarrativePeek } from "./useActivityNarrativePeek";

const mocks = vi.hoisted(() => ({ uid: "owner", generate: vi.fn(), peek: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.uid ? { uid: mocks.uid } : null }) }));
vi.mock("../services/activityNarrativeApi", () => ({ generateActivityNarrative: mocks.generate, peekActivityNarrative: mocks.peek }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));

beforeEach(() => { mocks.uid = "owner"; vi.clearAllMocks(); });
describe("activity narrative viewer isolation", () => {
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
