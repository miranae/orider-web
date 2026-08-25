import { renderHook, waitFor } from "@testing-library/react";
import { collection } from "firebase/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReactNode } from "react";
import { FirebaseServicesProvider } from "../contexts/FirebaseServicesContext";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import { normalizePlanSport, usePlanModel } from "./usePlanModel";

const mocks = vi.hoisted(() => ({
  user: { uid: "owner" } as { uid: string } | null,
  freshTraining: vi.fn(() => ({ revalidating: false, justRecomputed: false })),
  fitnessTimeseries: vi.fn(() => ({ timeseries: null, loaded: true })),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("./useFreshTraining", () => ({
  useFreshTraining: mocks.freshTraining,
}));

vi.mock("./useFitnessTimeseries", () => ({
  useFitnessTimeseries: mocks.fitnessTimeseries,
}));

const firestore = { name: "embedded-firestore" };
const services = {
  firestore,
  auth: {},
  functions: {},
  ensureAppCheckReady: vi.fn(),
} as never;

function wrapper({ children }: { children: ReactNode }) {
  return <FirebaseServicesProvider services={services}>{children}</FirebaseServicesProvider>;
}

describe("usePlanModel", () => {
  beforeEach(() => {
    mocks.user = { uid: "owner" };
    mocks.freshTraining.mockClear();
    mocks.fitnessTimeseries.mockClear();
    vi.mocked(collection).mockClear();
  });

  it.each([
    ["bike", "bike"],
    ["run", "run"],
    ["swim", "swim"],
    ["tri", "bike"],
    ["RUN", "bike"],
    ["", "bike"],
    [null, "bike"],
  ])("normalizes sport %j to %s", (input, expected) => {
    expect(normalizePlanSport(input)).toBe(expected);
  });

  it("assembles the active goal, plan weeks, and progress with injected Firestore", async () => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    setCollectionDocs("goals", [{
      id: "goal-run",
      userId: "owner",
      discipline: "run",
      status: "active",
      eventDate: tomorrow,
      courseName: "10K",
    }]);
    setCollectionDocs("goals/goal-run/plan", [{
      id: "week-01",
      weekNumber: 1,
      phase: "build",
      startDate: tomorrow,
      plannedTSS: 80,
      days: [{
        date: tomorrow,
        dayOfWeek: 1,
        workout: "tempoRun",
        plannedTSS: 80,
        plannedDurationMin: 45,
        actualTSS: 40,
        completed: true,
        skipped: false,
      }],
    }]);

    const { result } = renderHook(() => usePlanModel("run"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.discipline).toBe("run");
    expect(result.current.goal?.id).toBe("goal-run");
    expect(result.current.weeks).toHaveLength(1);
    expect(result.current.totalTSS).toBe(80);
    expect(result.current.completedTSS).toBe(40);
    expect(result.current.progress).toBe(50);
    expect(collection).toHaveBeenCalledWith(firestore, "goals");
    expect(collection).toHaveBeenCalledWith(firestore, "goals", "goal-run", "plan");
    expect(mocks.freshTraining).toHaveBeenCalledWith("run");
    expect(mocks.fitnessTimeseries).toHaveBeenCalledWith("owner", "run");
  });

  it("uses the bike model for an unsupported embedded sport value", async () => {
    setCollectionDocs("goals", []);

    const { result } = renderHook(() => usePlanModel("rowing"), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.discipline).toBe("bike");
    expect(result.current.goal).toBeNull();
    expect(mocks.freshTraining).toHaveBeenCalledWith("bike");
    expect(mocks.fitnessTimeseries).toHaveBeenCalledWith("owner", "bike");
  });
});
