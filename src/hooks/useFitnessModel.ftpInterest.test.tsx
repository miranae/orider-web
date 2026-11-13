import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FitnessTimeseriesDoc } from "@shared/types/fitness-timeseries";
import { onSnapshot } from "firebase/firestore";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import { clearTrainingSurfaceCache } from "../embedded/trainingSurfaceCache";
import { useFitnessModel } from "./useFitnessModel";
const mocks = vi.hoisted(() => ({user:{uid:"rider-a",isAnonymous:false},firestore:{}, auth:{currentUser:{uid:"rider-a"}}, functions:{}, ensureAppCheckReady: vi.fn().mockResolvedValue(undefined), timeseries:null as FitnessTimeseriesDoc|null}));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user, profile: null }) }));
vi.mock("../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => mocks }));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("./useTrainingDecision", () => ({useTrainingDecision:()=>({enabled:false,envelope:null})}));
vi.mock("./useMobile", () => ({ useMobile: () => false }));
vi.mock("./usePdc", () => ({ usePdc: () => ({ pdc: null }) }));
vi.mock("./useBikeFtpDecision", () => ({ useBikeFtpDecision: () => ({ decision: null }) }));
vi.mock("./useCoachRiderInsight", () => ({ useCoachRiderInsight: () => ({ insight: null }) }));
vi.mock("./useUserFitness", () => ({ useUserFitness: () => ({ fitness: null }) }));
vi.mock("./useFitnessClock", () => ({ useFitnessClock: () => Date.now() }));
vi.mock("./useConsistencyStreak", () => ({ useConsistencyStreak: () => ({ summary: null }) }));
vi.mock("./useRunRecords", () => ({ useRunRecords: () => ({ run: null }) }));
vi.mock("./useMilestones", () => ({ useMilestones: () => ({ achieved: new Map(), markCelebrated: vi.fn() }) }));
vi.mock("./useFreshTraining", () => ({ useFreshTraining: () => ({ revalidating: false, justRecomputed: false }) }));
vi.mock("./useFitnessTimeseries", () => ({ useFitnessTimeseries: () => ({
  timeseries: mocks.timeseries, loaded: true, error: null, cacheHit: true, freshLoaded: true,
}) }));

const path = "users/rider-a/ftpHistory";
beforeEach(() => {
  clearTrainingSurfaceCache();
  vi.mocked(onSnapshot).mockClear();
  setCollectionDocs(path, Array.from({ length: 501 }, (_, i) => ({ id: `ftp-${i}`, value: 250, source: "manual", changedAt: Date.now() - i * 1000 })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const ftpCalls = () => vi.mocked(onSnapshot).mock.calls.filter(([ref]) => (ref as unknown as { path: string }).path === path);
describe("fitness FTP feature interest", () => {
  it("starts no lifetime FTP listener on run/swim/tri and preserves all 501 entries on active bike", async () => {
    const view = renderHook(({ sport, active }) => useFitnessModel(sport, { active, enableCoachRiderInsight: false }),
      { initialProps: { sport: "run", active: true } });
    expect(ftpCalls()).toHaveLength(0);
    view.rerender({ sport: "swim", active: true }); expect(ftpCalls()).toHaveLength(0);
    view.rerender({ sport: "tri", active: true }); expect(ftpCalls()).toHaveLength(0);
    view.rerender({ sport: "bike", active: false }); expect(ftpCalls()).toHaveLength(0);
    view.rerender({ sport: "bike", active: true });
    await waitFor(() => expect(view.result.current.ftpHistory).toHaveLength(501));
    expect(ftpCalls()).toHaveLength(2);
    view.rerender({ sport: "run", active: true });
    expect(ftpCalls()).toHaveLength(2);
  });
});
