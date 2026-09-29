import { act, renderHook, waitFor } from "@testing-library/react";
import { getDocs, where, type QuerySnapshot } from "firebase/firestore";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import { useRunNextTraining } from "./useRunNextTraining";
const mocks = vi.hoisted(() => ({ user: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null, load: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../services/todayTrainingDecisionGuard", () => ({ loadTodayTrainingDecision: mocks.load }));
const goal = { id: "run-goal", userId: "owner", discipline: "run", status: "active", eventDate: Date.parse("2026-10-20T00:00:00+09:00") };
const week = { id: "week-01", weekNumber: 1, phase: "base", days: [{ date: Date.parse("2026-10-01T00:00:00+09:00"), workout: "easyRun", plannedDurationMin: 30, completed: false, skipped: false }] };
function snap(docs: Array<Record<string, unknown> & { id: string }>): QuerySnapshot {
 return { docs: docs.map(item => ({ id: item.id, data: () => item })) } as unknown as QuerySnapshot;
}
beforeEach(() => {
 vi.mocked(getDocs).mockReset(); mocks.load.mockReset(); mocks.user = { uid: "owner", isAnonymous: false };
 resetRuntimeConfigForTests({ trainingDecisionEnabled: false, trainingDecisionCanonicalEnabled: false });
 vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-30T12:00:00+09:00"));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it("reads only the owner's active running goal and saved weeks without any mutation", async () => {
 vi.mocked(getDocs).mockResolvedValueOnce(snap([goal])).mockResolvedValueOnce(snap([week]));
 const { result } = renderHook(() => useRunNextTraining("activity", "owner", true));
 await waitFor(() => expect(result.current.status).toBe("ready"));
 expect(where).toHaveBeenCalledWith("discipline", "==", "run");
 expect(where).toHaveBeenCalledWith("userId", "==", "owner");
 expect(result.current.session).toMatchObject({ durationMin: 30, source: "persisted-plan", localDate: "2026-10-01" });
 expect(mocks.load).not.toHaveBeenCalled();
});
it.each(["outsider", "anonymous", "missing-activity", "disabled"])("does not read a private plan for %s", mode => {
 if (mode === "outsider") mocks.user = { uid: "other", isAnonymous: false };
 if (mode === "anonymous") mocks.user = { uid: "owner", isAnonymous: true };
 const { result } = renderHook(() => useRunNextTraining(mode === "missing-activity" ? undefined : "activity", "owner", mode !== "disabled"));
 expect(result.current.status).toBe("none"); expect(getDocs).not.toHaveBeenCalled(); expect(mocks.load).not.toHaveBeenCalled();
});
it("clears prior-owner data synchronously on activity/auth changes and ignores pending prior results", async () => {
 let resolve!: (value: QuerySnapshot) => void;
 vi.mocked(getDocs).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
 const { result, rerender } = renderHook(({ owner }) => useRunNextTraining("activity", owner, true), { initialProps: { owner: "owner" } });
 rerender({ owner: "other" });
 expect(result.current.status).toBe("none");
 await act(async () => resolve(snap([goal])));
 expect(result.current.session).toBeNull(); expect(getDocs).toHaveBeenCalledTimes(1);
});
it("distinguishes ambiguous or failed/incomplete queries from a verified empty plan", async () => {
 vi.mocked(getDocs).mockResolvedValueOnce(snap([goal, { ...goal, id: "other-run-goal" }]));
 const first = renderHook(() => useRunNextTraining("activity", "owner", true));
 await waitFor(() => expect(first.result.current.status).toBe("error")); first.unmount();
 vi.mocked(getDocs).mockRejectedValueOnce(new Error("unavailable"));
 const second = renderHook(() => useRunNextTraining("activity", "owner", true));
 await waitFor(() => expect(second.result.current.status).toBe("error")); second.unmount();
 vi.mocked(getDocs).mockResolvedValueOnce(snap([]));
 const empty = renderHook(() => useRunNextTraining("activity", "owner", true));
 await waitFor(() => expect(empty.result.current.status).toBe("none"));
});
it("new canonical rollout never falls back to an old today decision", async () => {
 resetRuntimeConfigForTests({ trainingDecisionEnabled: true, trainingDecisionCanonicalEnabled: true });
 vi.mocked(getDocs).mockResolvedValueOnce(snap([goal])).mockResolvedValueOnce(snap([week]));
 const { result } = renderHook(() => useRunNextTraining("activity", "owner", true));
 await waitFor(() => expect(result.current.status).toBe("ready"));
 expect(mocks.load).not.toHaveBeenCalled();
});
it("rechecks at KST midnight instead of presenting yesterday's future plan as verified today", async () => {
 vi.restoreAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T23:59:59+09:00"));
 resetRuntimeConfigForTests({ trainingDecisionEnabled: false, trainingDecisionCanonicalEnabled: true });
 vi.mocked(getDocs).mockResolvedValueOnce(snap([goal])).mockResolvedValueOnce(snap([week])).mockResolvedValueOnce(snap([goal])).mockResolvedValueOnce(snap([week]));
 const { result } = renderHook(() => useRunNextTraining("activity", "owner", true));
 await act(async () => { await Promise.resolve(); await Promise.resolve(); });
 expect(result.current.status).toBe("ready");
 await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
 expect(result.current.status).toBe("none"); expect(result.current.session).toBeNull();
});

it("does not call cached or pending local writes a current saved next plan", async () => {
 const cached = { ...snap([goal]), metadata: { fromCache: true, hasPendingWrites: false } } as QuerySnapshot;
 vi.mocked(getDocs).mockResolvedValueOnce(cached);
 const { result } = renderHook(() => useRunNextTraining("activity", "owner", true));
 await waitFor(() => expect(result.current.status).toBe("error"));
 expect(result.current.session).toBeNull();
});
it("reports a bounded weeks query at its limit as unverified", async () => {
 vi.mocked(getDocs).mockResolvedValueOnce(snap([goal])).mockResolvedValueOnce(snap(Array.from({ length: 105 }, (_, index) => ({ ...week, id: `week-${index}` }))));
 const { result } = renderHook(() => useRunNextTraining("activity", "owner", true));
 await waitFor(() => expect(result.current.status).toBe("error"));
 expect(result.current.session).toBeNull();
});

it("keeps malformed week-day data neutral with an error instead of a no-plan claim", async () => {
 vi.mocked(getDocs).mockResolvedValueOnce(snap([goal])).mockResolvedValueOnce(snap([{ ...week, days: {} }]));
 const { result } = renderHook(() => useRunNextTraining("activity", "owner", true));
 await waitFor(() => expect(result.current.status).toBe("error"));
 expect(result.current.session).toBeNull();
});
