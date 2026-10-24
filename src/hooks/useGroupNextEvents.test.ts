import { installEventDiscoveryFixture } from "../__tests__/fixtures/eventDiscovery";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCollectionDocs, setCallableImplementation, mockCallableInvocations } from "../__tests__/mocks/firebase";
import { logClientError } from "../services/errorLogger";
import { formatNextLabel, isEligibleNextEvent, useGroupNextEvents } from "./useGroupNextEvents";

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
  beforeEach(() => installEventDiscoveryFixture());

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
