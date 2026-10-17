import { cleanup, render, screen, within } from "@testing-library/react";
import i18n from "i18next";
import enDashboard from "../i18n/resources/en/dashboard.json";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Activity } from "@shared/types";
import DashboardPage, { KOREAN_CYCLING_COMMUNITIES } from "./DashboardPage";
import { ThemeProvider } from "../contexts/ThemeContext";
import { LocaleProvider } from "../contexts/LocaleContext";
import { ToastProvider } from "../contexts/ToastContext";
import { OriderThemeProvider } from "../theme";
import { useRunHistory } from "../hooks/useRunHistory";
import { useUserFitness } from "../hooks/useUserFitness";
import { useFitnessTimeseries } from "../hooks/useFitnessTimeseries";
import { useRunRecords } from "../hooks/useRunRecords";

const state = vi.hoisted(() => ({ canonicalEnabled: false, mobile: true, sportFilter: "run", feedScope: "self", user: { uid: "owner", isAnonymous: false } as { uid: string; isAnonymous: boolean } | null, runs: [] as Activity[], available: true, update: vi.fn(), weeklyLoad: undefined as Array<number | null> | undefined }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, profile: { createdAt: 1, thresholdPace: null }, loading: false, signInWithGoogle: vi.fn() }) }));
vi.mock("../hooks/useCanonicalFitnessSummary", () => ({ useCanonicalFitnessSummary: () => ({ enabled: state.canonicalEnabled, values: null, display: null }) }));
vi.mock("../hooks/useFitnessTimeseries", () => ({ useFitnessTimeseries: vi.fn(() => { throw new Error("중복 시계열 구독 금지"); }) }));
vi.mock("../hooks/useMobile", () => ({ useMobile: () => state.mobile }));
vi.mock("../hooks/useDashboardPreferences", () => ({ useDashboardPreferences: () => ({ preferences: { sportFilter: state.sportFilter, feedScope: state.feedScope, datePreset: "all" }, update: state.update }) }));
vi.mock("../hooks/useRunHistory", () => ({ useRunHistory: vi.fn(() => ({ runs: state.runs, loading: false, available: state.available })) }));
vi.mock("../hooks/useUserFitness", () => ({ useUserFitness: vi.fn(() => ({ fitness: null })) }));
vi.mock("../hooks/useRunRecords", () => ({ useRunRecords: vi.fn(() => ({ run: {}, loading: false })) }));
vi.mock("../hooks/useFirstSyncCelebration", () => ({ useFirstSyncCelebration: () => ({ show: false, activityId: null, dismiss: vi.fn() }) }));
vi.mock("../utils/runnerLevel", () => ({ estimateRunnerLevel: () => ({ level: "regular" }) }));
vi.mock("../utils/shoeStatus", () => ({ latestShoeStatus: () => ({ replacementDue: true }) }));
vi.mock("../utils/runWeeklyRecap", () => ({ computeRunWeeklyRecap: () => ({ lastWeek: { count: 1 } }), isRecapVisible: () => true }));
vi.mock("../components/mobile/MobileFeedPage", () => ({ default: ({ todayStrip, runningJourney, sportFilter, runSummary }: { todayStrip?: ReactNode; runningJourney?: ReactNode; sportFilter?: string; runSummary?: { available: boolean } }) => <div data-testid="mobile-journey-slot" data-sport-filter={sportFilter} data-run-summary={String(!!runSummary)}>{todayStrip}{runningJourney}</div> }));
vi.mock("../components/dashboard/RunEmptyState", () => ({ default: () => <div>run-empty-journey</div> }));
vi.mock("../components/dashboard/WeeklyRecapCard", () => ({ default: () => <div>run-weekly-recap</div> }));
vi.mock("../components/dashboard/ThresholdPaceNudge", () => ({ default: () => <div>run-threshold-nudge</div> }));
vi.mock("../components/dashboard/ShoeReplacementBadge", () => ({ default: () => <div>run-shoe-status</div> }));
vi.mock("../components/dashboard/CrossDisciplineLoadCard", () => ({ default: () => <div>run-cross-load</div> }));

vi.mock("../hooks/useActivities", async importOriginal => {
  const actual = await importOriginal<typeof import("../hooks/useActivities")>();
  return { ...actual, useWeeklyStats: (...args: Parameters<typeof actual.useWeeklyStats>) => {
    const result = actual.useWeeklyStats(...args);
    return state.weeklyLoad === undefined ? result : { ...result, coverage: "ready" as const, weeklyStats: result.weeklyStats.slice(-state.weeklyLoad.length).map((week, index) => ({ ...week, distance: [20, 40, 0][index] ?? 0, tss: state.weeklyLoad![index] ?? null, tssEstimated: index === 1, tssUnknownCount: index === 1 ? 1 : 0 })) };
  } };
});

function show(route = "/ko") {
  return render(<MemoryRouter initialEntries={[route]}><ThemeProvider><OriderThemeProvider><LocaleProvider><ToastProvider><DashboardPage /></ToastProvider></LocaleProvider></OriderThemeProvider></ThemeProvider></MemoryRouter>);
}

beforeEach(async () => { await i18n.changeLanguage("ko"); vi.clearAllMocks(); state.canonicalEnabled = false; state.mobile = true; state.sportFilter = "run"; state.feedScope = "self"; state.user = { uid: "owner", isAnonymous: false }; state.runs = []; state.available = true; state.weeklyLoad = undefined; });
afterEach(cleanup);

describe("owner running dashboard journey parity", () => {
  it("keeps communities below schedules without duplicating the global app installation footer", () => {
    state.mobile = false;
    show();
    const sidebar = screen.getByRole("complementary");
    const communityTitle = within(sidebar).getByText("한국 자전거 커뮤니티");
    expect(communityTitle.closest("details")).toBeNull();
    expect(within(sidebar).getByText("내 일정").compareDocumentPosition(communityTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const community of KOREAN_CYCLING_COMMUNITIES) {
      expect(within(sidebar).getByRole("link", { name: new RegExp(community.name) })).toHaveAttribute("href", community.url);
    }
    expect(within(sidebar).queryByRole("link", { name: "App Store" })).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("link", { name: "Google Play" })).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("link", { name: "iOS 매뉴얼" })).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("button", { name: /더보기/ })).not.toBeInTheDocument();
  });
  it.each([
    { lang: "ko", loads: [0, 100, 100, null], values: ["≈67+", "≈100+", "—"] },
    { lang: "en", loads: [null, null, 0], values: ["0", "0", "0"] },
    { lang: "ko", loads: [null, null, null], values: ["—", "—", "—"] },
  ])("aligns distance and TSS average, peak and calendar-week values ($lang, $loads)", async ({ lang, loads, values }) => {
    i18n.addResourceBundle("en", "dashboard", enDashboard, true, true);
    await i18n.changeLanguage(lang);
    state.weeklyLoad = loads;
    state.mobile = false;
    state.sportFilter = "bike";
    show(`/${lang}?sport=bike`);
    const table = screen.getByRole("table", { name: lang === "ko" ? "주간 거리와 훈련 부하 요약" : "Weekly distance and training load summary" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent(lang === "ko" ? "이동거리 (km)" : "Distance traveled (km)");
    expect(within(rows[1]!).getAllByRole("cell").map(cell => cell.textContent)).toEqual([loads.length === 4 ? "15" : "20", "40", "0"]);
    expect(within(rows[2]!).getAllByRole("cell").map(cell => cell.textContent)).toEqual(values);
    expect(rows[2]).toHaveTextContent(lang === "ko" ? "훈련 부하 (TSS)" : "Load (TSS)");
    expect(screen.queryByTestId("weekly-tss-bar")).not.toBeInTheDocument();
  });
  it.each([true, false])("falls back from direct home swim links before rendering/querying the selected discipline (mobile=%s)", mobile => {
    state.mobile = mobile;
    show("/ko?sport=swim");
    expect(screen.queryByTestId("dashboard-running-journey")).not.toBeInTheDocument();
    if (mobile) expect(screen.getByTestId("mobile-journey-slot")).toHaveAttribute("data-sport-filter", "bike");
    else {
      expect(screen.getByRole("tab", { name: "사이클" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: /수영/ })).toBeDisabled();
    }
    expect(state.update).not.toHaveBeenCalled();
  });
  it("uses bike for a saved home swim preference without silently persisting it", () => {
    state.sportFilter = "swim";
    show();
    expect(screen.getByTestId("mobile-journey-slot")).toHaveAttribute("data-sport-filter", "bike");
    expect(state.update).not.toHaveBeenCalled();
  });
  it("uses the mobile saved run filter without requiring a URL sport parameter", () => {
    show();
    expect(screen.getByTestId("mobile-journey-slot")).toHaveTextContent("run-empty-journey");
    expect(screen.getByTestId("H2-3-1")).toHaveTextContent("활동시간");
    expect(screen.getByTestId("H2-3-1")).not.toHaveTextContent("0시간 0분");
    expect(useRunHistory).toHaveBeenCalledWith(8, true);
    expect(useUserFitness).toHaveBeenCalledWith(true);
    expect(useRunRecords).toHaveBeenCalledWith(true);
  });
  it("does not claim a first-run empty state when running history is unavailable", () => {
    state.available = false;
    show();
    expect(screen.queryByText("run-empty-journey")).not.toBeInTheDocument();
  });
  it("reuses loaded owner run data for recap, threshold, shoes and cross-sport load on mobile", () => {
    state.runs = [{} as Activity];
    show();
    const slot = screen.getByTestId("mobile-journey-slot");
    for (const text of ["run-weekly-recap", "run-threshold-nudge", "run-shoe-status", "run-cross-load"]) expect(slot).toHaveTextContent(text);
    expect(screen.getByText("run-cross-load").closest("details")).not.toBeNull();
    expect(screen.getByTestId("dashboard-running-journey")).not.toHaveTextContent("run-cross-load");
    expect(screen.getAllByText("run-threshold-nudge")).toHaveLength(1);
    expect(screen.getByTestId("dashboard-running-journey")).toHaveTextContent("run-threshold-nudge");
    expect(slot).not.toHaveTextContent("run-empty-journey");
  });
  it("uses an explicit URL run selection on mobile even when the saved filter is bike", () => {
    state.sportFilter = "bike";
    show("/ko?sport=run");
    expect(screen.getByTestId("dashboard-running-journey")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-journey-slot")).toHaveAttribute("data-sport-filter", "run");
    expect(screen.getByTestId("mobile-journey-slot")).toHaveAttribute("data-run-summary", "true");
    expect(useRunHistory).toHaveBeenCalledWith(8, true);
  });
  it.each(["all", "friends"])("keeps personal guidance and recap independent of feed scope on the mobile %s feed", scope => {
    state.feedScope = scope; state.runs = [{} as Activity];
    show();
    expect(screen.getByTestId("dashboard-running-journey")).toBeInTheDocument();
    expect(screen.getByTestId("H2-3-4")).toHaveTextContent("run-weekly-recap");
    expect(useRunHistory).toHaveBeenCalledWith(8, true);
  });
  it.each([null, { uid: "guest", isAnonymous: true }])("does not show an owner journey for a guest account", user => {
    state.user = user;
    show();
    expect(screen.queryByTestId("dashboard-running-journey")).not.toBeInTheDocument();
    expect(useRunHistory).toHaveBeenCalledWith(8, false);
    expect(useUserFitness).toHaveBeenCalledWith(false);
    expect(useRunRecords).toHaveBeenCalledWith(false);
  });
  it("places desktop cross-sport context in the sidebar below running history rather than before primary activity", () => {
    state.mobile = false;
    state.runs = [{} as Activity];
    show("/ko?sport=run");
    const sidebar = screen.getByRole("complementary");
    const cross = within(sidebar).getByText("run-cross-load");
    expect(screen.getByTestId("dashboard-running-journey")).not.toHaveTextContent("run-cross-load");
    expect(screen.getByTestId("run-monthly-distance").compareDocumentPosition(cross) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("renders the desktop running weekly distances as bars with distance-only summaries", () => {
    state.mobile = false;
    state.weeklyLoad = [100, null, null];
    show("/ko?sport=run");
    const chart = screen.getByTestId("run-weekly-activity");
    expect(within(chart).getAllByTestId("weekly-distance-bar")).toHaveLength(3);
    expect(within(chart).getByTestId("weekly-zero-marker")).toHaveAttribute("data-current-week", "true");
    expect(within(chart).getByText("20.0km")).toBeInTheDocument();
    const peakWeekSummary = within(chart).getByText("최고주", { selector: "dt" }).parentElement!;
    expect(within(peakWeekSummary).getByRole("definition")).toHaveTextContent("40.0km");
    expect(within(chart).getByText("0m")).toBeInTheDocument();
    expect(chart).not.toHaveTextContent("TSS");
    expect(within(chart).queryByRole("button", { name: /활동별 TSS/ })).not.toBeInTheDocument();
  });
  it("preserves desktop URL-run behavior even when the mobile preference is bike", () => {
    state.mobile = false;
    state.sportFilter = "bike";
    state.feedScope = "all";
    show("/ko?sport=run");
    expect(screen.getByTestId("dashboard-running-journey")).toHaveTextContent("run-empty-journey");
    expect(screen.getByRole("heading", { name: "최근 7일 내 러닝·걷기·하이킹" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "훈련 상태" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("H2-3-1")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "월간 운동일지 →" })).toHaveAttribute("href", "/ko/athlete/me/activities?sport=run");
    expect(screen.getByTestId("H2-1-1")).toHaveTextContent("역치 페이스");
    expect(screen.getByTestId("run-weekly-activity")).toBeInTheDocument();
    expect(screen.getByTestId("run-monthly-distance")).toBeInTheDocument();
    expect(screen.queryByText("한국 자전거 커뮤니티")).not.toBeInTheDocument();
    expect(useRunHistory).toHaveBeenCalledWith(8, true);
  });
});

it("정본 API가 켜진 자전거 홈은 현재 Fitness와 시계열을 중복 구독하지 않는다", () => {
  state.sportFilter = "bike";
  state.canonicalEnabled = true;
  show();
  expect(useUserFitness).toHaveBeenCalledWith(false);
  expect(useFitnessTimeseries).not.toHaveBeenCalled();
});


it.each(["self", "friends", "all"].flatMap(scope => ["bike", "run"].map(sport => [scope, sport])))("uses the selected fixed sport icon for an empty desktop %s feed in %s", async (scope, sport) => {
  state.mobile = false;
  state.feedScope = scope;
  const view = show(`/ko?sport=${sport}`);
  const icon = await screen.findByTestId("dashboard-feed-empty-icon");
  expect(icon.tagName.toLowerCase()).toBe("svg");
  expect(icon).toHaveAttribute("data-icon", sport);
  expect(view.container).not.toHaveTextContent("🚴");
  expect(screen.getByRole("tab", { name: /수영/ })).toBeDisabled();
});
