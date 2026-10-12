import { act, renderHook, waitFor } from "@testing-library/react";
import { getDocs, limit, orderBy, where } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import { useClubUpcomingEvents } from "./useClubUpcomingEvents";
import { logClientError } from "../services/errorLogger";

vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));
describe("club feed upcoming events", () => {
  beforeEach(() => { vi.clearAllMocks(); setCollectionDocs("events", []); });
  it("uses the existing group dashboard's capped OPEN/LIVE query", async () => {
    const { result } = renderHook(() => useClubUpcomingEvents("g"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(where).toHaveBeenCalledWith("info.groupId", "==", "g");
    expect(where).toHaveBeenCalledWith("info.status", "in", ["OPEN", "LIVE"]);
    expect(orderBy).toHaveBeenCalledWith("info.startTime", "asc");
    expect(limit).toHaveBeenCalledWith(5);
    expect(result.current.events).toEqual([]);
    expect(result.current.error).toBeNull();
  });
  it("logs errors and retries without treating failure as empty success", async () => {
    const failure = new Error("permission denied");
    vi.mocked(getDocs).mockRejectedValueOnce(failure);
    const { result } = renderHook(() => useClubUpcomingEvents("g"));
    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(logClientError).toHaveBeenCalledWith("useClubUpcomingEvents.load", failure, { groupId: "g" });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(getDocs).toHaveBeenCalledTimes(2);
  });
});
