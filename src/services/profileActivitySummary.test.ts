import { auth } from "./firebase";
import { getDocs, limit, where } from "firebase/firestore";
import { simulateLogin as mockLogin, simulateLogout as mockLogout, getCurrentUser } from "../__tests__/mocks/firebase";
import { createMockActivity } from "../__tests__/fixtures/mockData";
import { buildProfileActivitySummary, readOwnProfileActivitySummary } from "./profileActivitySummary";
import { seoulWeekStartMs, WEEK_MS } from "../utils/seoulWeek";
const now = Date.parse("2026-10-21T12:00:00+09:00");
const monday = seoulWeekStartMs(now);
const row = (id: string, time: number) => createMockActivity({ id, userId: "owner", startTime: time, endTime: time + 3600000, source: "strava", type: "Ride" });
beforeEach(() => { vi.mocked(getDocs).mockReset(); });
it("selects a valid own latest activity independently of the feed and excludes uncommitted rows", () => {
  const old = row("valid", monday);
  const pending = { ...row("pending", now - 1), _stravaImportPending: { runId: "import" } };
  expect(buildProfileActivitySummary([pending, old], [old], now).latest?.id).toBe("valid");
});
it("does not claim a bounded invalid latest page proves there are no activities", () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({ ...row(String(index), now - index), invalidSummary: true }));
  expect(buildProfileActivitySummary(rows, [], now)).toMatchObject({ latest: null, latestComplete: false });
});
it("marks truncated history and preserves a lower-bound streak", () => {
  const rows = Array.from({ length: 401 }, (_, index) => row(String(index), monday + 10000 - index));
  expect(buildProfileActivitySummary([], rows, now)).toMatchObject({ limited: true, weeksCount: 1, atLeast: true });
});
it("reads only bounded owner queries and deduplicates repeated requests for two minutes", async () => {
  simulateLogin({ uid: "cached-owner" });
  vi.mocked(getDocs).mockResolvedValue({ docs: [] } as never);
  await Promise.all([readOwnProfileActivitySummary("cached-owner"), readOwnProfileActivitySummary("cached-owner")]);
  expect(getDocs).toHaveBeenCalledTimes(2);
  expect(limit).toHaveBeenCalledWith(20); expect(limit).toHaveBeenCalledWith(401);
  expect(where).toHaveBeenCalledWith("userId", "==", "cached-owner");
  await readOwnProfileActivitySummary("cached-owner"); expect(getDocs).toHaveBeenCalledTimes(2);
});
it("blocks another owner and discards results after logout", async () => {
  simulateLogin({ uid: "changed-owner" });
  await expect(readOwnProfileActivitySummary("someone-else")).rejects.toThrow("owner-required");
  vi.mocked(getDocs).mockImplementation(async () => { simulateLogout(); return { docs: [] } as never; });
  await expect(readOwnProfileActivitySummary("changed-owner")).rejects.toThrow("owner-required");
});
it("does not reuse a cached activity result for another account", async () => {
  simulateLogin({ uid: "new-owner" });
  vi.mocked(getDocs).mockResolvedValue({ docs: [] } as never);
  await readOwnProfileActivitySummary("new-owner"); expect(getDocs).toHaveBeenCalledTimes(2);
});
it("honors a real historical week longer than thirteen weeks", () => {
  const activities = Array.from({ length: 16 }, (_, index) => row(String(index), monday - index * WEEK_MS + 1000));
  expect(buildProfileActivitySummary(activities.slice(0, 20), activities, now)).toMatchObject({ weeksCount: 16, atLeast: false });
});

it("keeps an unread same-timestamp row beyond the cap unknown rather than proving zero", () => {
  const invalid = Array.from({ length: 400 }, (_, index) => ({ ...row(String(index), monday), invalidSummary: true }));
  const result = buildProfileActivitySummary([], [...invalid, row("lookahead", monday)], now);
  expect(result).toMatchObject({ limited: true, weeksCount: null, atLeast: true });
  expect(result.week[0]?.active).toBeNull();
});
it("rejects an offline cached snapshot rather than reporting a verified zero", async () => {
  simulateLogin({ uid: "offline-owner" });
  vi.mocked(getDocs).mockResolvedValue({ docs: [], metadata: { fromCache: true } } as never);
  await expect(readOwnProfileActivitySummary("offline-owner")).rejects.toThrow("server-confirmation-required");
});

it("does not reuse an earlier session cache after same-uid reauthentication", async () => {
  simulateLogin({ uid: "same-owner" });
  vi.mocked(getDocs).mockResolvedValue({ docs: [] } as never);
  await readOwnProfileActivitySummary("same-owner");
  simulateLogout(); simulateLogin({ uid: "same-owner" });
  await readOwnProfileActivitySummary("same-owner");
  expect(getDocs).toHaveBeenCalledTimes(4);
});

function simulateLogin(user: Parameters<typeof mockLogin>[0]) { mockLogin(user); auth.currentUser = getCurrentUser() as typeof auth.currentUser; }
function simulateLogout() { mockLogout(); auth.currentUser = null; }
