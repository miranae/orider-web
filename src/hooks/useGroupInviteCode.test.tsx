import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulateLogin } from "../__tests__/mocks/firebase";
import { getGroupInviteCode } from "../features/group/groupInviteAdmin";
import { useGroupInviteCode } from "./useGroupInviteCode";

vi.mock("../features/group/groupInviteAdmin", () => ({ getGroupInviteCode: vi.fn() }));
const valid = () => ({ inviteCode: "ABCD-2345", expiresAt: Date.now() + 60_000, useLimit: 100, useCount: 0 });

beforeEach(() => { vi.mocked(getGroupInviteCode).mockReset(); simulateLogin({ uid: "a" }); });
afterEach(() => vi.useRealTimers());
describe("canonical group invite loading", () => {
  it("loads a usable canonical code without a public root field", async () => {
    vi.mocked(getGroupInviteCode).mockResolvedValue(valid());
    const { result } = renderHook(() => useGroupInviteCode("g", "a"));
    await waitFor(() => expect(result.current.code).toBe("ABCD-2345"));
    expect(getGroupInviteCode).toHaveBeenCalledWith("g");
  });
  it("withdraws a ready code when its lifetime expires", async () => {
    vi.useFakeTimers();
    vi.mocked(getGroupInviteCode).mockResolvedValue({ ...valid(), expiresAt: Date.now() + 100 });
    const { result } = renderHook(() => useGroupInviteCode("g", "a"));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.code).toBe("ABCD-2345");
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.code).toBe("");
    expect(result.current.status).toBe("failed");
  });
  it("makes denied management explicit and never provides an empty link capability", async () => {
    vi.mocked(getGroupInviteCode).mockRejectedValue({ code: "functions/permission-denied" });
    const { result } = renderHook(() => useGroupInviteCode("g", "a"));
    await waitFor(() => expect(result.current.status).toBe("denied"));
    expect(result.current.code).toBe("");
  });
  it("ignores late responses after group and account changes", async () => {
    let resolveOld!: (value: ReturnType<typeof valid>) => void;
    vi.mocked(getGroupInviteCode).mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    vi.mocked(getGroupInviteCode).mockResolvedValue({ ...valid(), inviteCode: "EFGH-6789" });
    const { result, rerender } = renderHook(({ group, uid }) => useGroupInviteCode(group, uid), { initialProps: { group: "old", uid: "a" } });
    simulateLogin({ uid: "b" });
    rerender({ group: "new", uid: "b" });
    await waitFor(() => expect(result.current.code).toBe("EFGH-6789"));
    await act(async () => { resolveOld(valid()); });
    expect(result.current.code).toBe("EFGH-6789");
  });
  it.each([
    { inviteCode: "" }, { expiresAt: 0 }, { useCount: 100 }, { useCount: -1 }, { expiresAt: Number.NaN },
  ])("rejects unusable server responses and retries issuance without creating a group %j", async (override) => {
    vi.mocked(getGroupInviteCode).mockResolvedValueOnce({ ...valid(), ...override }).mockResolvedValue(valid());
    const { result } = renderHook(() => useGroupInviteCode("g", "a"));
    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.code).toBe("");
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.code).toBe("ABCD-2345"));
    expect(getGroupInviteCode).toHaveBeenCalledTimes(2);
  });
});
