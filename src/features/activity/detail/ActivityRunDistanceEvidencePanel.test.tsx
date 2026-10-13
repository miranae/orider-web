import { useLocale } from "../../../contexts/LocaleContext";
import type { MetricsLike } from "./metricsPresentation";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import type { ActivityRunDistanceEvidenceResponse } from "@shared/activity-run-distance-evidence";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { manualDistanceEpoch, manualDistanceFixture } from "../../../services/activityRunDistanceEvidence.fixture";
import ActivityRunDistanceEvidencePanel from "./ActivityRunDistanceEvidencePanel";
const mocks = vi.hoisted(() => ({ inspect: vi.fn(), available: true, state: "idle", response: null as ActivityRunDistanceEvidenceResponse | null }));
vi.mock("../../../hooks/useActivityRunDistanceEvidence", () => ({ useActivityRunDistanceEvidence: () => mocks }));
const activity = { id: "ride", userId: "owner", type: "Run", startTime: manualDistanceEpoch, summary: { distance: 520 } } as Activity;
beforeEach(() => { mocks.inspect.mockReset(); mocks.available = true; mocks.state = "idle"; mocks.response = null; });
describe("single activity manual distance evidence", () => {
  it("shows a manual CTA without initial reads despite empty old stored distance records", () => {
    renderWithProviders(<ActivityRunDistanceEvidencePanel activity={activity} metrics={{ runMetrics: { distanceRecords: {} } } as MetricsLike} />);
    expect(mocks.inspect).not.toHaveBeenCalled(); expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "거리 원본 확인" })); expect(mocks.inspect).toHaveBeenCalledOnce();
  });
  it("shows ONE400m stopped elapsed server anchor, factual source/window and14 selection without reads", () => {
    mocks.state = "available"; mocks.response = manualDistanceFixture();
    renderWithProviders(<ActivityRunDistanceEvidencePanel activity={activity} metrics={null} />);
    expect(screen.getByText("정지 포함 경과시간: 0:02")).toBeInTheDocument();
    expect(screen.getByText(/원본 관측 범위 0:30–0:32.5 · 표본 2개/)).toBeInTheDocument();
    expect(screen.getByText(/품질과 전체 활동을 포함하는지는 알 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/ko/activity/ride");
    expect(within(screen.getByRole("combobox")).getAllByRole("option")).toHaveLength(14);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "1km" } });
    expect(screen.getByText(/이번에 확인한 관측 입력에서 이 거리의 기록이 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText("정지 포함 경과시간: 0:02")).not.toBeInTheDocument(); expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it.each(["loading", "pending", "changed_input", "unavailable", "error"])("shows honest %s with no stale facts and manual retry only", state => {
    mocks.state = state;
    if (state === "unavailable") mocks.response = { mode: "run_distance_evidence", activityId: "ride", state, reason: "unknown_axis", sourceLayer: null, distanceInputRevision: null, evidence: null };
    renderWithProviders(<ActivityRunDistanceEvidencePanel activity={activity} metrics={null} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument(); expect(screen.queryByRole("combobox")).not.toBeInTheDocument(); expect(mocks.inspect).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveProperty("disabled", state === "loading");
  });
  it("hides the entire CTA when the owner/auth/stage hook gate is unavailable", () => {
    mocks.available = false;
    const view = renderWithProviders(<ActivityRunDistanceEvidencePanel activity={activity} metrics={null} />);
    expect(view.container.textContent).toBe(""); expect(mocks.inspect).not.toHaveBeenCalled();
  });
});

it("keeps API640m evidence distinct from stored empty old5 and never invents a1km effort", () => {
  const response = manualDistanceFixture(); if (response.state !== "available") throw new Error("fixture");
  response.sourceLayer = response.evidence.sourceLayer = "api_streams"; response.evidence.observedEndOffsetSec = 35;
  const f = response.evidence.facts[0]!; f.exactElapsedSec = 3.125; f.elapsedSec = 3; f.endFraction = 400 / 640; f.endTimeSec = f.endOffsetSec = 33.125;
  mocks.state = "available"; mocks.response = response;
  renderWithProviders(<ActivityRunDistanceEvidencePanel activity={{ ...activity, summary: { distance: 640 } }} metrics={{ runMetrics: { distanceRecords: {} } } as MetricsLike} />);
  expect(screen.getByText("정지 포함 경과시간: 0:03")).toBeInTheDocument();
  expect(screen.getByRole("link")).toHaveTextContent("가져온 거리 스트림");
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "1km" } });
  expect(screen.getByText(/이번에 확인한 관측 입력에서 이 거리의 기록이 없습니다/)).toBeInTheDocument();
  expect(mocks.inspect).not.toHaveBeenCalled();
});

it("keeps stopped elapsed/source bounds unchanged in imperial settings and selects exact mile identity locally", () => {
  mocks.state = "available"; mocks.response = manualDistanceFixture();
  function Settings() { const { setUnits } = useLocale(); return <><button onClick={() => void setUnits("imperial")}>imperial</button><ActivityRunDistanceEvidencePanel activity={activity} metrics={null} /></>; }
  renderWithProviders(<Settings />);
  fireEvent.click(screen.getByRole("button", { name: "imperial" }));
  expect(screen.getByText("정지 포함 경과시간: 0:02")).toBeInTheDocument();
  expect(screen.getByText(/원본 관측 범위 0:30–0:32.5 · 표본 2개/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "half_mile" } });
  expect(screen.getByRole("combobox")).toHaveValue("half_mile");
  expect(screen.getByText(/이번에 확인한 관측 입력에서 이 거리의 기록이 없습니다/)).toBeInTheDocument();
  expect(mocks.inspect).not.toHaveBeenCalled();
});
