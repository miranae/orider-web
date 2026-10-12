import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "../../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { periodFixture, runningPeriodFixture, runningPacePeriodFixture } from "../../../services/trainingAnalysisPeriods.fixture";
import TrainingPeriodZonesPanel from "./TrainingPeriodZonesPanel";

const mocks = vi.hoisted(() => ({ hook: vi.fn(), enabled: true }));
vi.mock("../../../hooks/useTrainingAnalysisPeriods", () => ({ useTrainingAnalysisPeriods: (...args: unknown[]) => mocks.hook(...args) }));
vi.mock("../../../services/trainingAnalysisPeriods", async original => ({ ...await original<typeof import("../../../services/trainingAnalysisPeriods")>(), trainingAnalysisPeriodsAvailable: () => mocks.enabled }));
beforeEach(() => { mocks.enabled = true; mocks.hook.mockReset().mockReturnValue({ state: "idle", response: null }); });

describe("period zones display", () => {
  it("keeps recorded thresholds and measured/virtual groups separate, with observed denominators", () => {
    const response = periodFixture();
    response.periods[0]!.zones.power.groups.push({ ftp: 250, powerSource: "virtual", seconds: [0, 40, 0, 0, 0, 0, 0], observedSeconds: 40, activityIds: ["b"] });
    renderWithProviders(<TrainingPeriodZonesPanel response={response} />);
    expect(screen.getByText("실측 파워 · FTP 200 W")).toBeInTheDocument();
    expect(screen.getByText("추정 파워 · FTP 250 W")).toBeInTheDocument();
    expect(screen.getByText("LTHR 170 bpm")).toBeInTheDocument();
    const hr = screen.getByRole("region", { name: "심박 존", hidden: true });
    expect(within(hr).getAllByText(/50.0%/)).toHaveLength(2);
    expect(hr).not.toHaveTextContent("20.0%");
  });
  it("explains partial coverage, unavailable pace and missing channels without fake zero bars", () => {
    const response = periodFixture(); response.discipline = "run";
    const period = response.periods[0]!; period.status = "partial"; period.coverage.truncated = true;
    period.zones.heartRate.groups = []; period.zones.heartRate.eligibleActivityCount = 0; period.zones.heartRate.contextUnknownActivityCount = 1;
    period.zones.power.reason = "not_applicable";
    renderWithProviders(<TrainingPeriodZonesPanel response={response} />);
    expect(screen.getByText(/조회 한도에 도달/)).toBeInTheDocument();
    expect(screen.getByText(/기록 당시 기준 미확인 1개/)).toBeInTheDocument();
    expect(screen.getByText(/확정 존 기록이 없습니다/)).toBeInTheDocument();
    expect(screen.getByText(/페이스 존 정본이 없어/)).toBeInTheDocument();
    expect(screen.queryByText(/0.0%/)).not.toBeInTheDocument();
  });
  it("distinguishes zero observed zones and renders nothing without a parent response", () => {
    const response = periodFixture(); const group = response.periods[0]!.zones.heartRate.groups[0]!; group.observedSeconds = 0; group.seconds.fill(0);
    const { rerender } = renderWithProviders(<TrainingPeriodZonesPanel response={response} />);
    expect(screen.getByText(/이 그룹에서 관측된 이동 중 존 시간은 0초/)).toBeInTheDocument();
    rerender(<TrainingPeriodZonesPanel response={null} />);
    expect(screen.queryByText("기간별 훈련 강도")).not.toBeInTheDocument();
  });
});

it("adds a closed cycling distance section only beside existing bike period displays", () => {
  const response = periodFixture(); const view=renderWithProviders(<TrainingPeriodZonesPanel response={response}/>);
  expect(screen.getByText("기간별 사이클링 거리 관측 비교")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  view.rerender(<TrainingPeriodZonesPanel response={{...response,discipline:"run"}}/>);
  expect(screen.queryByText("기간별 사이클링 거리 관측 비교")).not.toBeInTheDocument();
});

describe("owner manual pace-period evidence", () => {
  it("does not submit at mount and snapshots the applied periods only on explicit action", () => {
    const response = runningPeriodFixture();
    const view = renderWithProviders(<TrainingPeriodZonesPanel response={response} ownerUid="test-uid" />, { authenticated: true });
    expect(mocks.hook).toHaveBeenLastCalledWith("test-uid", null, true);
    fireEvent.click(screen.getByRole("button", { name: "GAP 페이스존 근거 불러오기", hidden: true }));
    expect(mocks.hook.mock.lastCall?.[1].request).toEqual({ discipline: "run", includeRunningPaceZones: true, periods: response.periods.map(({ fromInclusive, toExclusive }) => ({ fromInclusive, toExclusive })) });
    const next = structuredClone(response); next.periods[0]!.fromInclusive += 1000;
    view.rerender(<TrainingPeriodZonesPanel response={next} ownerUid="test-uid" />);
    expect(mocks.hook).toHaveBeenLastCalledWith("test-uid", null, true);
    view.rerender(<TrainingPeriodZonesPanel response={{ ...next, discipline: "bike" }} ownerUid="test-uid" />);
    expect(screen.queryByText("GAP 페이스존 근거 불러오기")).not.toBeInTheDocument();
  });
  it("keeps a different owner, anonymous or unavailable capability from issuing pace queries", () => {
    const response = runningPeriodFixture();
    const view = renderWithProviders(<TrainingPeriodZonesPanel response={response} ownerUid="other-owner" />, { authenticated: true });
    expect(mocks.hook).not.toHaveBeenCalled();
    expect(screen.queryByText("GAP 페이스존 근거 불러오기")).not.toBeInTheDocument();
    Object.assign(getCurrentUser()!, { isAnonymous: true });
    view.rerender(<TrainingPeriodZonesPanel response={response} ownerUid="test-uid" />);
    expect(mocks.hook).not.toHaveBeenCalled();
    expect(screen.queryByText("GAP 페이스존 근거 불러오기")).not.toBeInTheDocument();
    Object.assign(getCurrentUser()!, { isAnonymous: false });
    mocks.enabled = false;
    view.rerender(<TrainingPeriodZonesPanel response={response} ownerUid="test-uid" />);
    expect(screen.getByRole("button", { name: "GAP 페이스존 근거 불러오기", hidden: true })).toBeDisabled();
    expect(mocks.hook).toHaveBeenLastCalledWith("test-uid", null, false);
  });
  it("shows own pace snapshot and recorded groups without implying the HR snapshot is the same", () => {
    const response = runningPacePeriodFixture();
    mocks.hook.mockReturnValue({ state: "ready", response });
    renderWithProviders(<TrainingPeriodZonesPanel response={runningPeriodFixture()} ownerUid="test-uid" />, { authenticated: true });
    expect(screen.getByText(/페이스존 조회 기준/)).toBeInTheDocument();
    expect(screen.getByText(/기존 심박·파워 통계와 조회 시점이 다를 수/)).toBeInTheDocument();
    expect(screen.getByText(/GAP 확인 1 \/ 후보 1건/)).toBeInTheDocument();
    expect(screen.getByText(/역치 없음 0건 · GAP 입력 없음 0건 · 프로필 읽기 실패 0건/)).toBeInTheDocument();
    expect(screen.getByText(/기준 역치 5:00/)).toBeInTheDocument();
  });
  it("keeps different recorded threshold/source groups separate rather than merging as growth", () => {
    const response = runningPacePeriodFixture(), pace = response.periods[0]!.zones.pace;
    if (!("groups" in pace)) throw new Error("fixture");
    pace.groups.push({ ...structuredClone(pace.groups[0]!), thresholdPaceSecPerKm: 360, thresholdSource: "thresholdPace", sources: [{ ...pace.groups[0]!.sources[0]!, sourceActivityId: "second" }] });
    pace.eligibleActivityCount = 2; pace.candidateActivityCount = 2;
    mocks.hook.mockReturnValue({ state: "ready", response });
    renderWithProviders(<TrainingPeriodZonesPanel response={runningPeriodFixture()} ownerUid="test-uid" />, { authenticated: true });
    expect(screen.getByText("기준 역치 5:00/km · 훈련 설정")).toBeInTheDocument();
    expect(screen.getByText("기준 역치 6:00/km · 프로필 설정")).toBeInTheDocument();
    expect(screen.getByText(/다른 기준의 분포 차이를 성장으로 해석하지 않습니다/)).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: "GAP 페이스존", hidden: true })).toHaveLength(2);
  });
  it("keeps threshold missing, profile failure and legacy unsupported counts distinct", () => {
    const response = runningPacePeriodFixture(), pace = response.periods[0]!.zones.pace;
    if (!("groups" in pace)) throw new Error("fixture");
    Object.assign(pace, { status: "unavailable", reason: "canonical_pace_zones_unavailable", candidateActivityCount: 3, eligibleActivityCount: 0,
      thresholdMissingActivityCount: 1, profileReadFailedActivityCount: 1, legacyUnsupportedActivityCount: 1, groups: [] });
    mocks.hook.mockReturnValue({ state: "ready", response });
    renderWithProviders(<TrainingPeriodZonesPanel response={runningPeriodFixture()} ownerUid="test-uid" />, { authenticated: true });
    expect(screen.getByText(/이전 형식 미지원 1건/)).toBeInTheDocument();
    expect(screen.getByText(/역치 없음 1건 · GAP 입력 없음 0건 · 프로필 읽기 실패 1건/)).toBeInTheDocument();
    expect(screen.queryByText(/Z1 ·/)).not.toBeInTheDocument();
  });
});
