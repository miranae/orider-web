import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ActivityPage from "./ActivityPage";
import { withStoredSummary, STORED_ACTIVITY_SUMMARY } from "../__tests__/fixtures/activityDefaultSummary";
import { activityFeedSourceRevision } from "../services/activityFeedContent";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setDocData } from "../__tests__/mocks/firebase";
import { createMockActivity } from "../__tests__/fixtures/mockData";

// ActivityPage.test.tsx 가 파일 크기 예산(2,000줄)을 넘지 않게 나눈 탭 접근성·제목 편집·메모 표시 검사.
vi.mock("../hooks/useFitnessTimeseries", () => ({ useFitnessTimeseries: () => ({ timeseries: null, loaded: true }) }));
vi.mock("../hooks/usePdc", () => ({ usePdc: () => ({ status: "missing", pdc: null }) }));
vi.mock("../components/RouteMap", () => ({ default: () => <div data-testid="route-map">Map</div> }));
vi.mock("../components/ElevationChart", () => ({ default: () => <div data-testid="elevation-chart">Chart</div> }));
vi.mock("../components/activity/AiRideAnalysisCard", () => ({ default: () => <div data-testid="ai-ride-analysis-card">AI</div> }));
vi.mock("chart.js", async () => (await import("../__tests__/fixtures/activityChartRegistryMock")).activityChartRegistryMock);
vi.mock("react-router-dom", async importOriginal => ({ ...await importOriginal<typeof import("react-router-dom")>(), useParams: () => ({ activityId: "test-activity" }) }));

describe("ActivityPage tabs, title and memo", () => {
  vi.setConfig({ testTimeout: 15_000 });

  it("supports keyboard tab navigation and associates the active panel", async () => {
    setDocData("activities/test-activity", createMockActivity({ id: "test-activity", userId: "test-uid" }) as unknown as Record<string, unknown>);
    renderWithProviders(<ActivityPage />, { authenticated: true });
    const overview = await screen.findByRole("tab", { name: "개요" });
    overview.focus();
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "분석" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "분석" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "activity-tab-analysis");
    fireEvent.keyDown(screen.getByRole("tab", { name: "분석" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "비교" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "비교" }), { key: "Home" });
    expect(overview).toHaveFocus();
    expect(overview).toHaveAttribute("tabindex", "0");
  });

  it("exposes title editing as a keyboard-focusable button for owners", async () => {
    const activity = createMockActivity({
      id: "test-activity",
      userId: "test-uid",
      description: "키보드 편집 테스트",
    });
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);

    renderWithProviders(<ActivityPage />, { authenticated: true });

    const editButton = await screen.findByRole("button", { name: "활동 제목 편집" });
    expect(editButton).toHaveTextContent("키보드 편집 테스트");

    fireEvent.click(editButton);
    expect(screen.getByDisplayValue("키보드 편집 테스트")).toBeInTheDocument();
  });

  it.each(["orider", "strava"] as const)("uses the verified stored Orider memo without generating a provider fallback for %s", async source => {
    const activity = withStoredSummary(createMockActivity({ id: "test-activity", source }));
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    renderWithProviders(<ActivityPage />);
    const story = await screen.findByRole("region", { name: "활동 이야기" });
    expect(within(story).getByText(/저장된 활동 요약/).textContent).toBe(STORED_ACTIVITY_SUMMARY);
    expect(within(story).queryByText(/Strava 원본/)).not.toBeInTheDocument();
  });

  it.each([true, false])("only renders a memo and preview from the current complete projection revision (%s)", async valid => {
    const activity = createMockActivity({ id: "test-activity", source: "strava" });
    activity.feedContentV1 = { version: 1, sourceRevision: valid ? activityFeedSourceRevision(activity) : "stale",
      revision: "r1", memo: "수집된 원문 메모", memoTruncated: false, totalPhotoCount: 9,
      photos: [{ id: "one", url: "https://images.example/one.jpg", caption: null }] };
    setDocData("activities/test-activity", activity as unknown as Record<string, unknown>);
    renderWithProviders(<ActivityPage />);
    const story = await screen.findByRole("region", { name: "활동 이야기" });
    if (valid) {
      expect(within(story).getByText("수집된 원문 메모")).toBeInTheDocument();
      expect(within(story).getByRole("button", { name: "사진 1 / 9 보기" })).toBeInTheDocument();
    } else {
      expect(within(story).queryByText("수집된 원문 메모")).not.toBeInTheDocument();
      expect(within(story).queryByRole("button", { name: "사진 1 / 9 보기" })).not.toBeInTheDocument();
    }
  });
});
