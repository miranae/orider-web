import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import { BIKE_DISTANCE_TARGETS, type ActivityBikeDistanceEvidenceResponse } from "@shared/activity-bike-distance-evidence";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { useLocale } from "../../../contexts/LocaleContext";
import ko from "../../../i18n/resources/ko/activity.json";
import en from "../../../i18n/resources/en/activity.json";
import { manualBikeDistanceEpoch, manualBikeDistanceFixture } from "../../../services/activityBikeDistanceEvidence.fixture";
import ActivityBikeDistanceEvidencePanel from "./ActivityBikeDistanceEvidencePanel";
const mocks = vi.hoisted(() => ({ inspect: vi.fn(), available: true, state: "idle", response: null as ActivityBikeDistanceEvidenceResponse | null }));
vi.mock("../../../hooks/useActivityBikeDistanceEvidence", () => ({ useActivityBikeDistanceEvidence: () => mocks }));
const activity = { id: "ride", userId: "owner", type: "Ride", startTime: manualBikeDistanceEpoch, summary: { distance: 12000 } } as Activity;
beforeEach(() => { mocks.inspect.mockReset(); mocks.available = true; mocks.state = "idle"; mocks.response = null; });
describe("manual BIKE13 observations", () => {
  it("starts without requests and inspects only on the explicit CTA", () => {
    renderWithProviders(<ActivityBikeDistanceEvidencePanel activity={activity} metrics={null} />);
    expect(mocks.inspect).not.toHaveBeenCalled(); expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "거리 원본 확인" })); expect(mocks.inspect).toHaveBeenCalledOnce();
  });
  it("shows one exact10km elapsed result and separates80km from50miles without new reads", () => {
    mocks.state = "available"; mocks.response = manualBikeDistanceFixture();
    renderWithProviders(<ActivityBikeDistanceEvidencePanel activity={activity} metrics={null} />);
    const select = screen.getByRole("combobox"); expect(select).toHaveValue("10km");
    expect(within(select).getAllByRole("option").map(option => (option as HTMLOptionElement).value)).toEqual([...BIKE_DISTANCE_TARGETS]);
    expect(screen.getByText("정지 포함 경과시간: 16:40")).toBeInTheDocument();
    expect(screen.getByText(/원본 관측 범위 0:30–20:30 · 표본 2개/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/ko/activity/ride");
    for (const distance of ["80km", "50miles"]) { fireEvent.change(select, { target: { value: distance } }); expect(select).toHaveValue(distance); expect(screen.getByText(/이번에 확인한 관측 입력에서 이 거리의 기록이 없습니다/)).toBeInTheDocument(); }
    expect(screen.queryByText("정지 포함 경과시간: 16:40")).not.toBeInTheDocument(); expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("keeps virtual cycling observations and unknown quality separate from GPS eligibility or stored PR", () => {
    mocks.state = "available"; mocks.response = manualBikeDistanceFixture();
    renderWithProviders(<ActivityBikeDistanceEvidencePanel activity={{ ...activity, type: "VirtualRide" }} metrics={null} />);
    expect(screen.getByText(/품질과 전체 활동을 포함하는지는 알 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByText("정지 포함 경과시간: 16:40")).toBeInTheDocument();
  });
  it.each(["loading", "pending", "changed_input", "unavailable", "error"])("shows honest%s without stale results or automatic retry", state => {
    mocks.state = state;
    if (state === "unavailable") mocks.response = { mode: "bike_distance_evidence", activityId: "ride", state, reason: "unknown_axis", sourceLayer: null, distanceInputRevision: null, evidence: null };
    renderWithProviders(<ActivityBikeDistanceEvidencePanel activity={activity} metrics={null} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument(); expect(screen.queryByRole("combobox")).not.toBeInTheDocument(); expect(mocks.inspect).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toHaveProperty("disabled", state === "loading");
  });
  it("hides public/nonowner/nonbike/unavailable CTA via the actual hook gate", () => {
    mocks.available = false;
    const view = renderWithProviders(<ActivityBikeDistanceEvidencePanel activity={activity} metrics={null} />);
    expect(view.container.textContent).toBe(""); expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("does not turn empty observed facts into an all-history absence claim", () => {
    const r = manualBikeDistanceFixture(); if (r.state !== "available") throw new Error("fixture"); r.evidence.facts = [];
    mocks.state = "available"; mocks.response = r;
    renderWithProviders(<ActivityBikeDistanceEvidencePanel activity={activity} metrics={null} />);
    expect(screen.getByText(/전체 기록의 부재를 뜻하지 않습니다/)).toBeInTheDocument(); expect(screen.getByRole("link")).toBeInTheDocument();
  });
  it("preserves official mile identity and stopped elapsed in imperial settings", () => {
    mocks.state = "available"; mocks.response = manualBikeDistanceFixture();
    function Settings() { const { setUnits } = useLocale(); return <><button onClick={() => void setUnits("imperial")}>imperial</button><ActivityBikeDistanceEvidencePanel activity={activity} metrics={null} /></>; }
    renderWithProviders(<Settings />); fireEvent.click(screen.getByRole("button", { name: "imperial" }));
    expect(screen.getByText("정지 포함 경과시간: 16:40")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "50miles" } }); expect(screen.getByRole("combobox")).toHaveValue("50miles"); expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("has distinct canonical13 labels and complete honest disclosures in both locales", () => {
    for (const locale of [ko, en]) {
      expect(Object.keys(locale.manualBikeEvidence.distances)).toEqual([...BIKE_DISTANCE_TARGETS]);
      expect(locale.manualBikeEvidence.distances['80km']).not.toBe(locale.manualBikeEvidence.distances['50miles']);
      expect(locale.manualBikeEvidence.snapshot).toBeTruthy(); expect(locale.manualBikeEvidence.states.changed_input).toBeTruthy();
    }
  });
});

it.each(["strava", "apple_health", "health_connect", null])("displays declared stored source without calling it native or verified: %s", source => {
  const response=manualBikeDistanceFixture(); if(response.state!=="available")throw new Error("fixture");
  response.evidence.declaredActivitySource=source as typeof response.evidence.declaredActivitySource;
  mocks.state="available";mocks.response=response;
  renderWithProviders(<ActivityBikeDistanceEvidencePanel activity={activity} metrics={null}/>);
  expect(screen.getByText(/원본 시계 연결은 검증되지 않았습니다/)).toBeInTheDocument();
  expect(screen.getByRole("link")).toHaveTextContent("저장된 거리 표본");
  expect(screen.getByText(new RegExp(ko.manualBikeEvidence.declaredSources[source ?? "unknown"]))).toBeInTheDocument();
  expect(mocks.inspect).not.toHaveBeenCalled();
});
