import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SavedActivityAnalysis } from "../../services/activityReanalysis";
import ActivityAnalysisSurface from "./ActivityAnalysisSurface";

const f = vi.hoisted(() => {
  const user = { uid: "owner" };
  return { user, services: { auth: { currentUser: user } }, history: vi.fn(), load: vi.fn(), request: vi.fn(),
    saved: { revisionId: "saved", metrics: { avgPower: 111, computedAt: 123, version: 1 } } as unknown as SavedActivityAnalysis,
    selected: undefined as SavedActivityAnalysis | undefined, failStreams: false, denied: false, owner: true };
});
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: f.user }) }));
vi.mock("../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => f.services }));
vi.mock("../../services/activityReanalysis", () => ({ createActivityReanalysisClient: () => ({ history: f.history, load: f.load, request: f.request }) }));
vi.mock("../../hooks/useActivityAnalysisModel", () => ({ useActivityAnalysisModel: (_id: string, _public: unknown, saved?: SavedActivityAnalysis) => {
  f.selected = saved;
  return { activity: { id: _id }, isActivityOwner: f.owner, sport: "ride", activityLoadError: f.denied ? Error("permission-denied") : null,
    loadingActivity: false, activityProcessing: false, loadingStreams: f.failStreams, streamsError: f.failStreams ? "offline" : null,
    showStreamSpinner: f.failStreams, serverMetrics: { metrics: saved?.metrics ?? { avgPower: 222, version: 999 } },
    overview: { loading: false, error: f.failStreams, response: null, retry: vi.fn() }, retryStreams: vi.fn(),
    analysisTabProps: { avgPower: saved?.metrics.avgPower ?? 222 }, requestStreams: vi.fn() };
} }));
vi.mock("../../components/AnalysisTab", () => ({ default: ({ avgPower }: { avgPower: number }) => <div>stored power {avgPower}</div> }));
vi.mock("../../components/activity/AiRideAnalysisCard", () => ({ default: ({ activityId, isActivityOwner }: { activityId: string; isActivityOwner: boolean }) => <div>shared AI history {activityId} {String(isActivityOwner)}</div> }));
vi.mock("../../features/activity/detail/ActivityDetailedCharts", () => ({ default: () => <div>current source chart</div> }));
vi.mock("../../features/activity/detail/ActivityPersonalBenchmark", () => ({ ActivityPersonalBenchmark: () => <div>current benchmark</div> }));
vi.mock("../../features/activity/detail/ActivityGrowthPanel", () => ({ ActivityGrowthPanel: () => null }));
vi.mock("../../features/activity/detail/ActivityOverviewEvidence", () => ({ default: () => <div>current overview</div> }));
vi.mock("../../features/activity/detail/ActivityPeakEffortInspector", () => ({ default: () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks(); f.user = { uid: "owner" }; f.services.auth.currentUser = f.user;
  f.failStreams = false; f.denied = false; f.owner = true;
  f.history.mockImplementation((_id: string, revision?: string) => Promise.resolve({ items: [{ revisionId: "saved", calculatorVersion: 1, calculatedAt: 123 }], nextCursor: null, selected: revision ? f.saved : null }));
});
const props = () => ({ activityId: "a", retryKey: 0, onError: vi.fn(), onReady: vi.fn() });
async function selectPrevious() {
  fireEvent.click(screen.getByText("reanalysis.history"));
  fireEvent.click(await screen.findByText("reanalysis.savedVersion"));
  await screen.findByText("stored power 111");
}
it("reuses the saved/current selector and shared AI card without mixing current source into old metrics", async () => {
  render(<ActivityAnalysisSurface {...props()} />);
  expect(screen.getByText("shared AI history a true")).toBeInTheDocument();
  await selectPrevious();
  expect(f.selected).toBe(f.saved);
  expect(screen.queryByText("current source chart")).not.toBeInTheDocument();
  expect(screen.queryByText("current benchmark")).not.toBeInTheDocument();
  expect(screen.queryByText("current overview")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("reanalysis.current"));
  expect(screen.getByText("stored power 222")).toBeInTheDocument();
  expect(screen.getByText("current source chart")).toBeInTheDocument();
  expect(f.request).not.toHaveBeenCalled();
});
it("preserves a selected old version after failed history read, source retry and clock passage", async () => {
  const p = props(); const view = render(<ActivityAnalysisSurface {...p} />);
  await selectPrevious(); f.history.mockRejectedValueOnce(Error("offline"));
  fireEvent.click(screen.getByText("reanalysis.history"));
  await screen.findByText("reanalysis.failed");
  f.failStreams = true;
  view.rerender(<ActivityAnalysisSurface {...p} retryKey={1} />);
  expect(screen.getByText("stored power 111")).toBeInTheDocument();
  expect(p.onError).not.toHaveBeenCalled();
  expect(f.saved.metrics.computedAt).toBe(123);
  expect(f.request).not.toHaveBeenCalled();
});
it("masks selection synchronously on exact SDK replacement and on activity change", async () => {
  const p = props(); const view = render(<ActivityAnalysisSurface {...p} />);
  await selectPrevious(); f.services.auth.currentUser = { uid: "owner" };
  view.rerender(<ActivityAnalysisSurface {...p} />);
  expect(screen.queryByText("stored power 111")).not.toBeInTheDocument();
  expect(f.selected).toBeUndefined();
  await selectPrevious();
  view.rerender(<ActivityAnalysisSurface {...p} activityId="b" />);
  expect(f.selected).toBeUndefined();
});
it("still reports actual activity denial and exposes no owner history controls for a visitor", () => {
  const p = props(); f.denied = true; f.owner = false;
  render(<ActivityAnalysisSurface {...p} />);
  expect(p.onError).toHaveBeenCalledWith("activity_load_failed");
  expect(screen.queryByText("reanalysis.history")).not.toBeInTheDocument();
  expect(screen.queryByText(/shared AI history/)).not.toBeInTheDocument();
});
it("revisits the activity and reads saved history again without starting a new calculation", async () => {
  const first = render(<ActivityAnalysisSurface {...props()} />); await selectPrevious(); first.unmount();
  render(<ActivityAnalysisSurface {...props()} />);
  expect(f.selected).toBeUndefined(); await selectPrevious();
  await waitFor(() => expect(f.history).toHaveBeenCalledTimes(4));
  expect(f.request).not.toHaveBeenCalled();
});
