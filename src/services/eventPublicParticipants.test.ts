import { beforeEach, expect, it, vi } from "vitest";
import { httpsCallable } from "firebase/functions";
import { getEventPublicParticipantsPage, publicParticipantTimestampMs } from "./eventPublicParticipants";
const mocks = vi.hoisted(() => ({ callable: vi.fn(), ready: vi.fn(), functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: vi.fn(() => mocks.callable) }));
vi.mock("./firebase", () => ({ functions: mocks.functions, ensureAppCheckReady: mocks.ready }));
beforeEach(() => { vi.clearAllMocks(); mocks.ready.mockResolvedValue(undefined); });
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

const pageServices = () => ({ functions: mocks.functions as never, auth: { currentUser: null } as never, ensureAppCheckReady: mocks.ready });
const validPage = () => ({ participants: [{ userId: "a" }], projectionVersion: 2, complete: false, nextCursor: "next", counters: null, countersStatus: "pending", counterRevision: null });
it("requests one bounded page and accepts pending counters without raw fallback", async () => {
  mocks.callable.mockResolvedValue({ data: validPage() });
  await expect(getEventPublicParticipantsPage("tour", "previous", pageServices())).resolves.toEqual(validPage());
  expect(mocks.callable).toHaveBeenCalledExactlyOnceWith({ eventId: "tour", mode: "page", pageSize: 50, cursor: "previous" });
});
it.each([
  { complete: true, nextCursor: "next" }, { nextCursor: null }, { nextCursor: "previous" },
  { participants: [{ userId: "a" }, { userId: "a" }] },
  { participants: Array.from({ length: 51 }, (_, i) => ({ userId: String(i) })) },
  { countersStatus: "ready" }, { projectionVersion: 1 },
])("rejects invalid page contracts without legacy fallback %#", async patch => {
  mocks.callable.mockResolvedValue({ data: { ...validPage(), ...patch } });
  await expect(getEventPublicParticipantsPage("tour", "previous", pageServices())).rejects.toThrow("event-page-invalid-response");
  expect(mocks.callable).toHaveBeenCalledTimes(1);
});
it("does not send a request after an account change during AppCheck", async () => {
  const services = pageServices();
  mocks.ready.mockImplementationOnce(async () => { services.auth.currentUser = {} as never; });
  await expect(getEventPublicParticipantsPage("tour", null, services)).rejects.toThrow("session-changed");
  expect(mocks.callable).not.toHaveBeenCalled();
});

it("fails closed on AppCheck failure and callable denial without another read path", async () => {
  mocks.ready.mockRejectedValueOnce(new Error("appcheck"));
  await expect(getEventPublicParticipantsPage("tour", null, pageServices())).rejects.toThrow("appcheck");
  expect(mocks.callable).not.toHaveBeenCalled();
  mocks.callable.mockRejectedValueOnce(new Error("permission-denied"));
  await expect(getEventPublicParticipantsPage("tour", null, pageServices())).rejects.toThrow("permission-denied");
  expect(mocks.callable).toHaveBeenCalledTimes(1);
});
it("uses the injected callable instance instead of global Firebase services", async () => {
  const services = { ...pageServices(), functions: {} as never };
  mocks.callable.mockResolvedValue({ data: validPage() });
  await getEventPublicParticipantsPage("tour", null, services);
  expect(httpsCallable).toHaveBeenCalledWith(services.functions, "getEventPublicParticipants");
});

it("does not issue a late callable after a timed-out AppCheck attempt or an abandoned event", async () => {
  vi.useFakeTimers();
  let release!: () => void;
  mocks.ready.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  try {
    const pending = expect(getEventPublicParticipantsPage("old", null, pageServices())).rejects.toThrow("event-page-timeout");
    await vi.advanceTimersByTimeAsync(12000);
    await pending;
    release();
    await Promise.resolve();
    expect(mocks.callable).not.toHaveBeenCalled();
    await expect(getEventPublicParticipantsPage("abandoned", null, pageServices(), () => false)).rejects.toThrow("session-changed");
    expect(mocks.callable).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

it("accepts an empty fenced page when its cursor advances", async () => {
  const data = { ...validPage(), participants: [] };
  mocks.callable.mockResolvedValue({ data });
  await expect(getEventPublicParticipantsPage("tour", "previous", pageServices())).resolves.toEqual(data);
});
