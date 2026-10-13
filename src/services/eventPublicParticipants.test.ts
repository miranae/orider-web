import { beforeEach, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";
import { getEventPublicParticipants, publicParticipantTimestampMs } from "./eventPublicParticipants";
const mocks = vi.hoisted(() => ({ callable: vi.fn(), ready: vi.fn(), functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => mocks.callable) }));
vi.mock("./firebase", () => ({ functions: mocks.functions, ensureAppCheckReady: mocks.ready }));
beforeEach(() => { vi.clearAllMocks(); mocks.ready.mockResolvedValue(undefined); });
it("prepares AppCheck and forwards the anonymous-safe public roster callable", async () => {
  const data = { participants: [{ userId: "canonical", displayName: "Rider" }], counters: { totalRegistered: 1, byCategory: {} } };
  mocks.callable.mockResolvedValue({ data });
  expect(await getEventPublicParticipants("tour")).toEqual(data);
  expect(mocks.ready).toHaveBeenCalledOnce();
  expect(httpsCallable).toHaveBeenCalledWith(mocks.functions, "getEventPublicParticipants");
  expect(mocks.callable).toHaveBeenCalledWith({ eventId: "tour" });
});
it("fails closed when AppCheck fails without calling the roster", async () => {
  mocks.ready.mockRejectedValue(new Error("appcheck"));
  await expect(getEventPublicParticipants("tour")).rejects.toThrow("appcheck");
  expect(mocks.callable).not.toHaveBeenCalled();
});
it("propagates callable denial without a raw Firestore fallback", async () => {
  mocks.callable.mockRejectedValue(new Error("permission-denied"));
  await expect(getEventPublicParticipants("group")).rejects.toThrow("permission-denied");
});

it.each([
  [100123, 100123], [{ _seconds: 100, _nanoseconds: 123456789 }, 100123.456789],
  [{ seconds: 100, nanoseconds: 987654321 }, 100987.654321],
  [{ seconds: 100 }, 100000], [{ toMillis: () => 100123.5 }, 100123.5],
  [NaN, null], [Infinity, null], [{ seconds: Infinity }, null],
  [{ seconds: 100, nanoseconds: NaN }, null], [{ seconds: 100, nanoseconds: -1 }, null],
  [{ seconds: 100, nanoseconds: 1000000000 }, null], [{ seconds: "100" }, null],
  [{ toMillis: () => Infinity }, null], [{ toMillis: () => { throw new Error("invalid"); } }, null],
])("normalizes public participant timestamps without dropping subsecond precision %#", (input, expected) => {
  expect(publicParticipantTimestampMs(input)).toBe(expected);
});
