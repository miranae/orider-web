import { auth } from "./firebase";
import { getDocs } from "firebase/firestore";
import { simulateLogin as mockLogin, simulateLogout as mockLogout, getCurrentUser } from "../__tests__/mocks/firebase";
import { fetchRecentActivityTracks } from "./activityTracks";

beforeEach(() => { vi.mocked(getDocs).mockReset(); });
it("rejects another owner and anonymous sessions before reading geometry", async () => {
  simulateLogin({ uid: "owner" });
  await expect(fetchRecentActivityTracks("other")).rejects.toThrow("owner-required");
  simulateLogin({ uid: "owner", isAnonymous: true });
  await expect(fetchRecentActivityTracks("owner")).rejects.toThrow("owner-required");
  expect(getDocs).not.toHaveBeenCalled();
});
it("discards late geometry when the same uid signs into a new session", async () => {
  simulateLogin({ uid: "owner" });
  vi.mocked(getDocs).mockImplementation(async () => {
    simulateLogout(); simulateLogin({ uid: "owner" });
    return { docs: [{ data: () => ({ userId: "owner", thumbnailTrack: "37,127" }) }] } as never;
  });
  await expect(fetchRecentActivityTracks("owner")).rejects.toThrow("owner-required");
});
it("requires server-confirmed geometry and excludes mismatched owners", async () => {
  simulateLogin({ uid: "owner" });
  vi.mocked(getDocs).mockResolvedValueOnce({ docs: [], metadata: { fromCache: true } } as never);
  await expect(fetchRecentActivityTracks("owner")).rejects.toThrow("server-confirmation-required");
  vi.mocked(getDocs).mockResolvedValueOnce({ docs: [
    { data: () => ({ userId: "owner", thumbnailTrack: "37,127" }) },
    { data: () => ({ userId: "other", thumbnailTrack: "38,128" }) },
  ] } as never);
  await expect(fetchRecentActivityTracks("owner")).resolves.toEqual([{ thumbnailTrack: "37,127" }]);
});

function simulateLogin(user: Parameters<typeof mockLogin>[0]) { mockLogin(user); auth.currentUser = getCurrentUser() as typeof auth.currentUser; }
function simulateLogout() { mockLogout(); auth.currentUser = null; }
