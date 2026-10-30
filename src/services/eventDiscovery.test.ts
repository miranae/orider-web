import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDocs } from "firebase/firestore";
import { mockCallableInvocations, setCallableImplementation, setCallableResult } from "../__tests__/mocks/firebase";
import { ensureAppCheckReady } from "./firebase";
import { getPublicEvents, getVisibleEventPage } from "./eventDiscovery";

describe("authorized event discovery adapter", () => {
  beforeEach(() => { vi.mocked(getDocs).mockClear(); });
  it("keeps member scope and pagination while consuming only server-authorized rows", async () => {
    setCallableResult("listVisibleEventEnvelopes", { data: { rows: [{ id: "meeting", data: { info: { kind: "CLUB_MEETING", startTime: 123 } } }], nextCursor: "meeting" } });
    const options = { groupId: "club", publicOnly: false, statuses: ["OPEN"], limit: 20 };
    const page = await getVisibleEventPage(options);
    expect(ensureAppCheckReady).toHaveBeenCalled();
    expect(mockCallableInvocations.at(-1)).toEqual({ name: "listVisibleEventEnvelopes", data: options });
    expect(page.docs[0].id).toBe("meeting");
    expect(page.docs[0].data().info.startTime).toBe(123);
    expect(page.nextCursor).toBe("meeting");
    expect(getDocs).not.toHaveBeenCalled();
  });
  it("paginates public discovery with the same explicit status scope", async () => {
    setCallableImplementation("listVisibleEventEnvelopes", value => {
      const request = value as { cursor?: string };
      return { data: { rows: [{ id: request.cursor ? "second" : "first", data: { info: { visibility: "PUBLIC" } } }], nextCursor: request.cursor ? null : "first" } };
    });
    const result = await getPublicEvents(["OPEN", "LIVE", "FINISHED"]);
    expect(result.docs.map(doc => doc.id)).toEqual(["first"]);
    expect(mockCallableInvocations.filter(call => call.name === "listVisibleEventEnvelopes")).toHaveLength(1);
    const second = await getPublicEvents(["OPEN", "LIVE", "FINISHED"], result.nextCursor!);
    expect(second.docs.map(doc => doc.id)).toEqual(["second"]);
    expect(mockCallableInvocations.filter(call => call.name === "listVisibleEventEnvelopes").map(call => call.data)).toEqual([
      { publicOnly: true, statuses: ["OPEN", "LIVE", "FINISHED"], limit: 250 },
      { publicOnly: true, statuses: ["OPEN", "LIVE", "FINISHED"], limit: 250, cursor: "first" },
    ]);
  });
  it("does not auto-scan private windows and resumes only on another explicit page action", async () => {
    const token = "~ed1_" + "a".repeat(48);
    setCallableImplementation("listVisibleEventEnvelopes", value => {
      const request = value as { cursor?: string };
      if (!request.cursor) return { data: { rows: [], nextCursor: token } };
      return { data: { rows: [
        { id: "public", data: { info: { visibility: "PUBLIC" } } },
        { id: "legacy", data: { info: {} } },
        { id: "group", data: { info: { visibility: "GROUP" } } },
      ], nextCursor: null } };
    });
    const first = await getPublicEvents(["OPEN", "LIVE"]);
    expect(first.docs).toEqual([]);expect(first.nextCursor).toBe(token);
    expect(mockCallableInvocations.filter(call => call.name === "listVisibleEventEnvelopes")).toHaveLength(1);
    const result = await getPublicEvents(["OPEN", "LIVE"], first.nextCursor!);
    expect(result.docs.map(doc => doc.id)).toEqual(["public", "legacy", "group"]);
    expect(mockCallableInvocations.filter(call => call.name === "listVisibleEventEnvelopes").map(call => call.data)).toEqual([
      { publicOnly: true, statuses: ["OPEN", "LIVE"], limit: 250 },
      { publicOnly: true, statuses: ["OPEN", "LIVE"], limit: 250, cursor: token },
    ]);
    expect(getDocs).not.toHaveBeenCalled();
  });
  it("keeps a group widget bounded and preserves scope on an explicit next page", async () => {
    const token = "~ed1_" + "b".repeat(48);
    setCallableImplementation("listVisibleEventEnvelopes", value => {
      const request = value as { cursor?: string };
      return { data: request.cursor
        ? { rows: [{ id: "visible-meeting", data: { info: { kind: "CLUB_MEETING" } } }], nextCursor: "visible-meeting" }
        : { rows: [], nextCursor: token } };
    });
    const options = { groupId: "club", publicOnly: false, statuses: ["OPEN", "LIVE"], descending: true, limit: 3 };
    const first = await getVisibleEventPage(options);
    expect(first.docs).toEqual([]);expect(first.nextCursor).toBe(token);
    expect(mockCallableInvocations.filter(call => call.name === "listVisibleEventEnvelopes")).toHaveLength(1);
    const page = await getVisibleEventPage({...options,cursor:first.nextCursor!});
    expect(page.docs.map(doc => doc.id)).toEqual(["visible-meeting"]);
    expect(page.nextCursor).toBe("visible-meeting");
    expect(mockCallableInvocations.filter(call => call.name === "listVisibleEventEnvelopes").map(call => call.data)).toEqual([
      options, { ...options, cursor: token },
    ]);
    expect(getDocs).not.toHaveBeenCalled();
  });
  it("rejects a cycling empty continuation instead of looping or claiming a complete empty page", async () => {
    setCallableImplementation("listVisibleEventEnvelopes", () => ({ data: { rows: [], nextCursor: "same-cursor" } }));
    await expect(getVisibleEventPage({ groupId: "club", publicOnly: true, limit: 3, cursor:"same-cursor" })).rejects.toThrow("made no progress");
    expect(mockCallableInvocations.filter(call => call.name === "listVisibleEventEnvelopes")).toHaveLength(1);
    expect(getDocs).not.toHaveBeenCalled();
  });
  it("fails closed on server rejection without a raw Firestore collection fallback", async () => {
    setCallableImplementation("listVisibleEventEnvelopes", () => { throw new Error("permission-denied"); });
    await expect(getVisibleEventPage({ groupId: "club", publicOnly: false })).rejects.toThrow("permission-denied");
    expect(getDocs).not.toHaveBeenCalled();
  });
});
