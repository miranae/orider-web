import { installEventDiscoveryFixture } from "../__tests__/fixtures/eventDiscovery";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCollectionDocs, setCallableImplementation, mockCallableInvocations } from "../__tests__/mocks/firebase";
import { logClientError } from "../services/errorLogger";
import { NEXT_EVENT_CONCURRENCY, formatNextLabel, isEligibleNextEvent, nextEventTitle, useGroupNextEvents } from "./useGroupNextEvents";

vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));

describe("group next events", () => {
  beforeEach(() => {
    installEventDiscoveryFixture();
    vi.mocked(logClientError).mockClear();
    setCollectionDocs("events", []);
  });

  it("formats weekdays with the requested UI locale", () => {
    const timestamp = new Date(2026, 6, 14, 18, 30).getTime();
    expect(formatNextLabel(timestamp, "Evening Ride", "en-US")).toContain("Tue");
    expect(formatNextLabel(timestamp, "저녁 라이딩", "ko-KR")).toContain("화");
  });

  it("requests public server-authorized discovery per group", async () => {
    setCollectionDocs("events", [
      { id: "later", info: { groupId: "g1", visibility: "PUBLIC", status: "OPEN", startTime: 200, name: "Later" } },
      { id: "next", info: { groupId: "g1", visibility: "PUBLIC", status: "LIVE", startTime: 100, name: "Next" } },
      { id: "draft", info: { groupId: "g1", visibility: "PUBLIC", status: "DRAFT", startTime: 50, name: "Draft" } },
      { id: "deleted", info: { groupId: "g1", visibility: "PUBLIC", status: "OPEN", startTime: 25, name: "Deleted", deletedAt: 1 } },
      { id: "private", info: { groupId: "g2", visibility: "PRIVATE", status: "OPEN", startTime: 10, name: "Private" } },
    ]);

    const { result } = renderHook(() => useGroupNextEvents(["g1", "g2"], undefined, true));
    await waitFor(() => expect(result.current.eventByGroup.get("g1")?.id).toBe("next"));

    expect(mockCallableInvocations.filter(call=>call.name==="listVisibleEventEnvelopes").map(call=>call.data)).toEqual([
      {groupId:"g1",publicOnly:true,statuses:["OPEN","LIVE"],limit:250},
      {groupId:"g2",publicOnly:true,statuses:["OPEN","LIVE"],limit:250},
    ]);
    expect(result.current.eventByGroup.get("g1")?.id).toBe("next");
    expect(result.current.eventByGroup.has("g2")).toBe(false);
  });

  it("reads next events only from the supported list callable, never the removed batch callable (#3835)", async () => {
    mockCallableInvocations.length = 0;
    setCollectionDocs("events", [{ id: "next", info: { groupId: "g1", status: "OPEN", startTime: 100, name: "Next" }, counters: { totalRegistered: 3 } }]);
    const { result } = renderHook(() => useGroupNextEvents(["g1", "g2"]));
    await waitFor(() => expect(result.current.eventByGroup.get("g1")?.id).toBe("next"));
    expect(mockCallableInvocations.some(call => call.name === "getGroupNextEvents")).toBe(false);
    expect(mockCallableInvocations.filter(call => call.name === "listVisibleEventEnvelopes").map(call => call.data)).toEqual([
      { groupId: "g1", publicOnly: false, statuses: ["OPEN", "LIVE"], limit: 250 },
      { groupId: "g2", publicOnly: false, statuses: ["OPEN", "LIVE"], limit: 250 },
    ]);
    expect(result.current.byGroup.get("g1")).toContain("Next");
    expect(result.current.eventByGroup.get("g1")?.registered).toBe(3);
  });

  it("carries the server participant count and meeting kind without counting on the client", async () => {
    setCollectionDocs("events", [
      { id: "meeting", info: { groupId: "g1", status: "OPEN", startTime: 100, name: "Meetup", kind: "CLUB_MEETING" }, counters: { totalRegistered: 14 } },
      { id: "race", info: { groupId: "g2", status: "OPEN", startTime: 100, name: "Race" } },
    ]);
    const { result } = renderHook(() => useGroupNextEvents(["g1", "g2"]));
    await waitFor(() => expect(result.current.eventByGroup.size).toBe(2));
    expect(result.current.eventByGroup.get("g1")).toMatchObject({ meeting: true, registered: 14 });
    expect(result.current.eventByGroup.get("g2")).toMatchObject({ meeting: false, registered: null });
  });

  it("requests member-authorized discovery when public-only mode is off", async () => {
    setCollectionDocs("events", [
      { id: "group-event", info: { groupId: "g1", visibility: "GROUP", status: "OPEN", startTime: 100, name: "Members" } },
    ]);

    const { result } = renderHook(() => useGroupNextEvents(["g1"], undefined, false));
    await waitFor(() => expect(result.current.eventByGroup.get("g1")?.id).toBe("group-event"));

    expect(mockCallableInvocations.filter(call=>call.name==="listVisibleEventEnvelopes").map(call=>call.data)).toEqual([{groupId:"g1",publicOnly:false,statuses:["OPEN","LIVE"],limit:250}]);
    expect(result.current.eventByGroup.get("g1")?.id).toBe("group-event");
  });

  it("observes query failures and clears stale results", async () => {
    setCallableImplementation("listVisibleEventEnvelopes",()=>{throw new Error("permission denied");});
    const { result } = renderHook(() => useGroupNextEvents(["g1"], undefined, true));
    await waitFor(() => expect(vi.mocked(logClientError)).toHaveBeenCalled());

    expect(result.current.eventByGroup.size).toBe(0);
    expect(vi.mocked(logClientError)).toHaveBeenCalledWith(
      "useGroupNextEvents.load",
      expect.any(Error),
      { groupId: "g1" },
    );
  });

  it("keeps other clubs' next events when one club fails and logs that club", async () => {
    setCollectionDocs("events", [
      { id: "ok", info: { groupId: "g2", status: "OPEN", startTime: 100, name: "Kept" } },
    ]);
    setCallableImplementation("listVisibleEventEnvelopes", (data) => {
      if ((data as { groupId?: string }).groupId === "g1") throw new Error("unavailable");
      return { data: { rows: [{ id: "ok", data: { info: { groupId: "g2", status: "OPEN", startTime: 100, name: "Kept" } } }], nextCursor: null } };
    });
    const { result } = renderHook(() => useGroupNextEvents(["g1", "g2"]));
    await waitFor(() => expect(result.current.eventByGroup.get("g2")?.id).toBe("ok"));
    expect(result.current.byGroup.get("g2")).toContain("Kept");
    expect(result.current.eventByGroup.has("g1")).toBe(false);
    expect(result.current.incompleteGroups.has("g1")).toBe(true);
    expect(vi.mocked(logClientError)).toHaveBeenCalledWith("useGroupNextEvents.load", expect.any(Error), { groupId: "g1" });
  });

  it("calls at most the old batch size of clubs at once", async () => {
    let active = 0;
    let peak = 0;
    setCallableImplementation("listVisibleEventEnvelopes", async () => {
      active += 1; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return { data: { rows: [], nextCursor: null } };
    });
    mockCallableInvocations.length = 0;
    const ids = Array.from({ length: 45 }, (_, index) => `g${index}`);
    const { result } = renderHook(() => useGroupNextEvents(ids));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(mockCallableInvocations.filter(call => call.name === "listVisibleEventEnvelopes")).toHaveLength(45));
    expect(peak).toBeLessThanOrEqual(NEXT_EVENT_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });

  it("shows the authored club meeting title instead of the fixed server name", async () => {
    setCollectionDocs("events", [
      { id: "meeting", info: { groupId: "g1", status: "OPEN", startTime: 100, kind: "CLUB_MEETING", name: "동호회 모임", title: "북악 업힐 정모" } },
    ]);
    const { result } = renderHook(() => useGroupNextEvents(["g1"]));
    await waitFor(() => expect(result.current.eventByGroup.get("g1")?.name).toBe("북악 업힐 정모"));
    expect(result.current.byGroup.get("g1")).toContain("북악 업힐 정모");
    expect(nextEventTitle({ kind: "CLUB_MEETING", name: "동호회 모임" })).toBe("동호회 모임");
    expect(nextEventTitle({ kind: "CLUB_MEETING", name: "동호회 모임", title: "  " })).toBe("동호회 모임");
    expect(nextEventTitle({ kind: "RIDE", name: "Race", title: "ignored" })).toBe("Race");
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

    setCallableImplementation("listVisibleEventEnvelopes",()=>new Promise(()=>{}));
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
    expect(isEligibleNextEvent({ visibility:"GROUP" },true,true)).toBe(true);
    expect(isEligibleNextEvent({},true,true)).toBe(true);
    expect(isEligibleNextEvent({ visibility:"PRIVATE" },true,true)).toBe(false);
    expect(isEligibleNextEvent({ visibility:"PUBLIC",kind:"CLUB_MEETING" },true,true)).toBe(false);
  });
});


describe("bounded next-event discovery continuation", () => {
  beforeEach(() => { installEventDiscoveryFixture(); });

  it("reports an empty private scan window as incomplete without automatic requests", async () => {
    setCallableImplementation("listVisibleEventEnvelopes", () => ({ data: { rows: [], nextCursor: "~ed1_" + "a".repeat(48) } }));
    const { result } = renderHook(() => useGroupNextEvents(["g1"], undefined, true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.incompleteGroups.has("g1")).toBe(true);
    expect(result.current.eventByGroup.size).toBe(0);
    expect(mockCallableInvocations.filter(call => call.name === "listVisibleEventEnvelopes")).toHaveLength(1);
  });

  it("offers continuation when the first page contains only the excluded event", async () => {
    setCallableImplementation("listVisibleEventEnvelopes", () => ({ data: { rows: [{ id: "current", data: { info: { groupId: "g1", visibility: "PUBLIC", status: "OPEN", startTime: 100 } } }], nextCursor: "current" } }));
    const { result } = renderHook(() => useGroupNextEvents(["g1"], "current", true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.incompleteGroups.has("g1")).toBe(true);
    expect(result.current.eventByGroup.size).toBe(0);
  });

  it("clears incomplete state on group changes and does not mark a resolved next event incomplete", async () => {
    setCallableImplementation("listVisibleEventEnvelopes", () => ({ data: { rows: [], nextCursor: "~ed1_" + "b".repeat(48) } }));
    const { result, rerender } = renderHook(({ groups }) => useGroupNextEvents(groups, undefined, true), { initialProps: { groups: ["g1"] } });
    await waitFor(() => expect(result.current.incompleteGroups.has("g1")).toBe(true));
    setCallableImplementation("listVisibleEventEnvelopes", () => ({ data: { rows: [{ id: "next", data: { info: { groupId: "g2", visibility: "PUBLIC", status: "OPEN", startTime: 100 } } }], nextCursor: "next" } }));
    rerender({ groups: ["g2"] });
    await waitFor(() => expect(result.current.eventByGroup.get("g2")?.id).toBe("next"));
    expect(result.current.incompleteGroups.size).toBe(0);
    rerender({ groups: [] });
    expect(result.current.incompleteGroups.size).toBe(0);
  });
});
