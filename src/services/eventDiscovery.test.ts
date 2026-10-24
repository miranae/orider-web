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
    expect(result.docs.map(doc => doc.id)).toEqual(["first", "second"]);
    expect(mockCallableInvocations.filter(call => call.name === "listVisibleEventEnvelopes").map(call => call.data)).toEqual([
      { publicOnly: true, statuses: ["OPEN", "LIVE", "FINISHED"], limit: 250 },
      { publicOnly: true, statuses: ["OPEN", "LIVE", "FINISHED"], limit: 250, cursor: "first" },
    ]);
  });
  it("fails closed on server rejection without a raw Firestore collection fallback", async () => {
    setCallableImplementation("listVisibleEventEnvelopes", () => { throw new Error("permission-denied"); });
    await expect(getVisibleEventPage({ groupId: "club", publicOnly: false })).rejects.toThrow("permission-denied");
    expect(getDocs).not.toHaveBeenCalled();
  });
});
