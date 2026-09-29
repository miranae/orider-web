import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Activity } from "@shared/types";
import DashboardPage from "./DashboardPage";
import { ThemeProvider } from "../contexts/ThemeContext";
import { LocaleProvider } from "../contexts/LocaleContext";
import { ToastProvider } from "../contexts/ToastContext";
import { OriderThemeProvider } from "../theme";
import { useRunHistory } from "../hooks/useRunHistory";
import { useUserFitness } from "../hooks/useUserFitness";
import { useRunRecords } from "../hooks/useRunRecords";

const state = vi.hoisted(() => ({ mobile: true, sportFilter: "run", feedScope: "self", user: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null, runs: [] as Activity[] }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, profile: { createdAt: 1, thresholdPace: null }, loading: false, signInWithGoogle: vi.fn() }) }));
vi.mock("../hooks/useMobile", () => ({ useMobile: () => state.mobile }));
vi.mock("../hooks/useDashboardPreferences", () => ({ useDashboardPreferences: () => ({ preferences: { sportFilter: state.sportFilter, feedScope: state.feedScope, datePreset: "all" }, update: vi.fn() }) }));
vi.mock("../hooks/useRunHistory", () => ({ useRunHistory: vi.fn(() => ({ runs: state.runs, loading: false })) }));
vi.mock("../hooks/useUserFitness", () => ({ useUserFitness: vi.fn(() => ({ fitness: null })) }));
vi.mock("../hooks/useRunRecords", () => ({ useRunRecords: vi.fn(() => ({ run: {}, loading: false })) }));
vi.mock("../hooks/useFirstSyncCelebration", () => ({ useFirstSyncCelebration: () => ({ show: false, activityId: null, dismiss: vi.fn() }) }));
vi.mock("../utils/runnerLevel", () => ({ estimateRunnerLevel: () => ({ level: "regular" }) }));
vi.mock("../utils/shoeStatus", () => ({ latestShoeStatus: () => ({ replacementDue: true }) }));
vi.mock("../utils/runWeeklyRecap", () => ({ computeRunWeeklyRecap: () => ({ lastWeek: { count: 1 } }), isRecapVisible: () => true }));
vi.mock("../components/mobile/MobileFeedPage", () => ({ default: ({ runningJourney }: { runningJourney?: ReactNode }) => <div data-testid="mobile-journey-slot">{runningJourney}</div> }));
vi.mock("../components/dashboard/RunEmptyState", () => ({ default: () => <div>run-empty-journey</div> }));
vi.mock("../components/dashboard/WeeklyRecapCard", () => ({ default: () => <div>run-weekly-recap</div> }));
vi.mock("../components/dashboard/ThresholdPaceNudge", () => ({ default: () => <div>run-threshold-nudge</div> }));
vi.mock("../components/dashboard/ShoeReplacementBadge", () => ({ default: () => <div>run-shoe-status</div> }));
vi.mock("../components/dashboard/CrossDisciplineLoadCard", () => ({ default: () => <div>run-cross-load</div> }));

function show(route = "/ko") {
  return render(<MemoryRouter initialEntries={[route]}><ThemeProvider><OriderThemeProvider><LocaleProvider><ToastProvider><DashboardPage /></ToastProvider></LocaleProvider></OriderThemeProvider></ThemeProvider></MemoryRouter>);
}

beforeEach(() => { vi.clearAllMocks(); state.mobile = true; state.sportFilter = "run"; state.feedScope = "self"; state.user = { uid: "owner", isAnonymous: false }; state.runs = []; });
afterEach(cleanup);

describe("owner running dashboard journey parity", () => {
  it("uses the mobile saved run filter without requiring a URL sport parameter", () => {
    show();
    expect(screen.getByTestId("mobile-journey-slot")).toHaveTextContent("run-empty-journey");
    expect(useRunHistory).toHaveBeenCalledWith(8, true);
    expect(useUserFitness).toHaveBeenCalledWith(true);
    expect(useRunRecords).toHaveBeenCalledWith(true);
  });
  it("reuses loaded owner run data for recap, threshold, shoes and cross-sport load on mobile", () => {
    state.runs = [{} as Activity];
    show();
    const slot = screen.getByTestId("mobile-journey-slot");
    for (const text of ["run-weekly-recap", "run-threshold-nudge", "run-shoe-status", "run-cross-load"]) expect(slot).toHaveTextContent(text);
    expect(slot).not.toHaveTextContent("run-empty-journey");
  });
  it("does not use URL run when the mobile saved filter is bike", () => {
    state.sportFilter = "bike";
    show("/ko?sport=run");
    expect(screen.queryByTestId("dashboard-running-journey")).not.toBeInTheDocument();
    expect(useRunHistory).toHaveBeenCalledWith(8, false);
  });
  it.each(["all", "friends"])("does not fetch or show private owner journey on the mobile %s feed", scope => {
    state.feedScope = scope;
    show();
    expect(screen.queryByTestId("dashboard-running-journey")).not.toBeInTheDocument();
    expect(useRunHistory).toHaveBeenCalledWith(8, false);
  });
  it.each([null, { uid: "guest", isAnonymous: true }])("does not show an owner journey for a guest account", user => {
    state.user = user;
    show();
    expect(screen.queryByTestId("dashboard-running-journey")).not.toBeInTheDocument();
    expect(useRunHistory).toHaveBeenCalledWith(8, false);
    expect(useUserFitness).toHaveBeenCalledWith(false);
    expect(useRunRecords).toHaveBeenCalledWith(false);
  });
  it("preserves desktop URL-run behavior even when the mobile preference is bike", () => {
    state.mobile = false;
    state.sportFilter = "bike";
    state.feedScope = "all";
    show("/ko?sport=run");
    expect(screen.getByTestId("dashboard-running-journey")).toHaveTextContent("run-empty-journey");
    expect(useRunHistory).toHaveBeenCalledWith(8, true);
  });
});
