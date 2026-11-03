import { render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/useFitnessModel", () => ({
  useFitnessModel: () => ({
    loading: false, cacheHit: false, freshLoaded: true, derivedMetricsSettled: true, derivedMetricsError: false,
    error: null, timeseriesLoaded: true, timeseriesError: null, mobilePageProps: {}, t: (key: string) => key, retryLoad: vi.fn(),
  }),
}));
vi.mock("../../pages/coach/CoachQuestionEntry", () => ({ CoachQuestionEntry: () => null }));
vi.mock("../../pages/coach/CoachConditionPage", () => ({ default: () => <div>condition page</div> }));
vi.mock("../../pages/coach/CoachAnalysisPage", () => ({ default: () => <div>analysis page</div> }));
vi.mock("../../pages/coach/CoachTodayPage", () => ({ default: () => <div>today page</div> }));
vi.mock("../../pages/TrainingLogPage", () => ({ default: () => <div>training log page</div> }));

import FitnessSurface from "./FitnessSurface";

function Search() {
  return <span data-testid="search">{useLocation().search}</span>;
}

describe("coach records subpage in the embed", () => {
  it("normalizes integrated condition to a supported sport on analysis entry", async () => {
    render(<MemoryRouter initialEntries={["/ko/embed/fitness?sport=tri&page=analysis"]}>
      <FitnessSurface onReady={vi.fn()} retryKey={0} /><Search />
    </MemoryRouter>);
    expect(await screen.findByText("analysis page")).toBeInTheDocument();
    expect(screen.getByTestId("search")).toHaveTextContent("sport=bike");
    expect(screen.getByTestId("search")).toHaveTextContent("page=analysis");
  });
  // 오늘 탭의 "활동 기록·수행 확인" 은 앱 밖 웹이 아니라 코치 임베드 안에서 그린다(2026-11-03).
  it("renders the training log inside the fitness surface and keeps the activity sport filter", async () => {
    render(<MemoryRouter initialEntries={["/ko/embed/fitness?sport=all&page=records"]}>
      <FitnessSurface onReady={vi.fn()} retryKey={0} /><Search />
    </MemoryRouter>);
    expect(await screen.findByText("training log page")).toBeInTheDocument();
    expect(screen.queryByText("today page")).not.toBeInTheDocument();
    // 기록 화면의 "전체" 활동 필터를 코치 부하 종목(bike)으로 바꾸지 않는다.
    expect(screen.getByTestId("search")).toHaveTextContent("sport=all");
  });
});
