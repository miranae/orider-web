import { renderHook, waitFor } from "@testing-library/react";
import { getDocs, orderBy, where } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import { logClientError } from "../services/errorLogger";
import { formatNextLabel, isEligibleNextEvent, useGroupNextEvents } from "./useGroupNextEvents";

vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));

describe("group next events", () => {
  beforeEach(() => {
    vi.mocked(getDocs).mockClear();
    vi.mocked(where).mockClear();
    vi.mocked(orderBy).mockClear();
    vi.mocked(logClientError).mockClear();
    setCollectionDocs("events", []);
  });

  it("formats weekdays with the requested UI locale", () => {
    const timestamp = new Date(2026, 6, 14, 18, 30).getTime();
    expect(formatNextLabel(timestamp, "Evening Ride", "en-US")).toContain("Tue");
    expect(formatNextLabel(timestamp, "저녁 라이딩", "ko-KR")).toContain("화");
  });

  it("uses one equality-only privacy query per group and filters status client-side", async () => {
    setCollectionDocs("events", [
      { id: "later", info: { groupId: "g1", visibility: "PUBLIC", status: "OPEN", startTime: 200, name: "Later" } },
      { id: "next", info: { groupId: "g1", visibility: "PUBLIC", status: "LIVE", startTime: 100, name: "Next" } },
      { id: "draft", info: { groupId: "g1", visibility: "PUBLIC", status: "DRAFT", startTime: 50, name: "Draft" } },
      { id: "deleted", info: { groupId: "g1", visibility: "PUBLIC", status: "OPEN", startTime: 25, name: "Deleted", deletedAt: 1 } },
      { id: "private", info: { groupId: "g2", visibility: "PRIVATE", status: "OPEN", startTime: 10, name: "Private" } },
    ]);

    const { result } = renderHook(() => useGroupNextEvents(["g1", "g2"], undefined, true));
    await waitFor(() => expect(result.current.eventByGroup.get("g1")?.id).toBe("next"));

    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(where)).toHaveBeenCalledWith("info.groupId", "==", "g1");
    expect(vi.mocked(where)).toHaveBeenCalledWith("info.groupId", "==", "g2");
    expect(vi.mocked(where)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(where)).not.toHaveBeenCalledWith("info.status", "in", ["OPEN", "LIVE"]);
    expect(vi.mocked(orderBy)).not.toHaveBeenCalled();
    expect(result.current.eventByGroup.get("g1")?.id).toBe("next");
    expect(result.current.eventByGroup.has("g2")).toBe(false);
  });

  it("preserves the chunked member query when public-only mode is off", async () => {
    setCollectionDocs("events", [
      { id: "group-event", info: { groupId: "g1", visibility: "GROUP", status: "OPEN", startTime: 100, name: "Members" } },
    ]);

    const { result } = renderHook(() => useGroupNextEvents(["g1"], undefined, false));
    await waitFor(() => expect(result.current.eventByGroup.get("g1")?.id).toBe("group-event"));

    expect(vi.mocked(getDocs)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(where)).toHaveBeenCalledWith("info.groupId", "in", ["g1"]);
    expect(vi.mocked(where)).toHaveBeenCalledWith("info.status", "in", ["OPEN", "LIVE"]);
    expect(vi.mocked(where)).not.toHaveBeenCalledWith("info.visibility", "==", "PUBLIC");
    expect(vi.mocked(orderBy)).toHaveBeenCalledWith("info.startTime", "asc");
    expect(result.current.eventByGroup.get("g1")?.id).toBe("group-event");
  });

  it("observes query failures and clears stale results", async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(new Error("permission denied"));
    const { result } = renderHook(() => useGroupNextEvents(["g1"], undefined, true));
    await waitFor(() => expect(vi.mocked(logClientError)).toHaveBeenCalled());

    expect(result.current.eventByGroup.size).toBe(0);
    expect(vi.mocked(logClientError)).toHaveBeenCalledWith(
      "useGroupNextEvents.load",
      expect.any(Error),
      { count: 1 },
    );
  });

  it("clears the previous next event while an exclusion change is loading", async () => {
    setCollectionDocs("events", [
      { id: "event-b", info: { groupId: "g1", visibility: "PUBLIC", status: "OPEN", startTime: 100, name: "B" } },
    ]);
    const { result, rerender } = renderHook(
      ({ excludeEventId }) => useGroupNextEvents(["g1"], excludeEventId, true),
      { initialProps: { excludeEventId: "event-a" } },
    );
    await waitFor(() => expect(result.current.eventByGroup.get("g1")?.id).toBe("event-b"));

    vi.mocked(getDocs).mockImplementationOnce(() => new Promise(() => {}));
    rerender({ excludeEventId: "event-b" });

    await waitFor(() => expect(result.current.eventByGroup.size).toBe(0));
    expect(result.current.byGroup.size).toBe(0);
    expect(result.current.loading).toBe(true);
  });

  it("fails closed for non-public event heads on public pages", () => {
    expect(isEligibleNextEvent({ visibility: "PUBLIC" }, true)).toBe(true);
    expect(isEligibleNextEvent({ visibility: "GROUP" }, true)).toBe(false);
    expect(isEligibleNextEvent({ visibility: "PUBLIC", deletedAt: 1 }, true)).toBe(false);
    expect(isEligibleNextEvent({ visibility: "PUBLIC", deletedAt: null }, true)).toBe(true);
    expect(isEligibleNextEvent({}, true)).toBe(false);
    expect(isEligibleNextEvent({ visibility: "GROUP" }, false)).toBe(true);
  });
});
