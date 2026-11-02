import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { createMockActivity, createMockSummary } from "../../../__tests__/fixtures/mockData";
import type { ActivityAnalysisModel } from "../../../hooks/useActivityAnalysisModel";
import ActivityDetailedCharts from "./ActivityDetailedCharts";

// 임베디드 상세 차트는 확대 없는 기존 차트다. 실제 구간 컨트롤·선택 모델로 시작 → 선택 → 지우기 → 재선택을 검증한다.
const chartProps = vi.hoisted(() => vi.fn());
vi.mock("./ActivityPerformanceCharts", () => ({
  default: (props: { rangeControls?: React.ReactNode; rangeAnalysis?: React.ReactNode }) => {
    chartProps(props);
    return <div data-testid="performance-chart">{props.rangeControls}{props.rangeAnalysis}</div>;
  },
}));
vi.mock("./ActivityRangeAnalysisPanel", async importOriginal => ({
  ...(await importOriginal<typeof import("./ActivityRangeAnalysisPanel")>()),
  default: () => <div data-testid="range-analysis" />,
}));

const latest = () => chartProps.mock.lastCall![0] as { range: [number, number]; onRangeChange?: (range: [number, number]) => void };

function ownerModel(): ActivityAnalysisModel {
  const epoch = 1791375809874, count = 101;
  const streams = {
    time: Array.from({ length: count }, (_, index) => epoch + index * 1000),
    distance: Array.from({ length: count }, (_, index) => index * 10),
    altitude: Array(count).fill(10), latlng: Array.from({ length: count }, () => [37, 127]),
  };
  const activity = createMockActivity({ id: "embedded-activity", userId: "test-uid", source: "orider", startTime: epoch,
    summary: createMockSummary({ ridingTimeMillis: 100000, elapsedTimeMillis: 100000 }) });
  return { activity, sport: "ride", streams, effectiveStreams: streams, isActivityOwner: true,
    serverMetrics: { metrics: null }, requestStreams: vi.fn(), loadingStreams: false } as unknown as ActivityAnalysisModel;
}

beforeEach(() => chartProps.mockClear());

describe("ActivityDetailedCharts range flow (embedded)", () => {
  it("starts with the button, then select → clear → drag again → end", async () => {
    renderWithProviders(<ActivityDetailedCharts model={ownerModel()} />, { authenticated: true });
    fireEvent.click(await screen.findByRole("button", { name: "상세 차트 보기" }));
    // 드래그로 열 수 없는 화면이라 시작 버튼이 있다. 시작 전에는 차트 범위 편집이 꺼져 있다.
    expect(latest().onRangeChange).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "구간 분석" }));
    expect(latest().onRangeChange).toBeDefined();

    act(() => latest().onRangeChange!([20, 40]));
    expect(latest().range).toEqual([20, 40]);
    expect(screen.getByLabelText("시작 시간")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "범위 지우기" }));
    expect(latest().range).toEqual([0, 100]);
    // 지운 뒤에도 다시 고를 수 있고, 종료 버튼으로 모드를 빠져나갈 수 있다.
    expect(latest().onRangeChange).toBeDefined();
    act(() => latest().onRangeChange!([30, 50]));
    expect(latest().range).toEqual([30, 50]);

    fireEvent.click(screen.getByRole("button", { name: "구간 선택 종료" }));
    expect(latest().onRangeChange).toBeUndefined();
    expect(latest().range).toEqual([0, 100]);
    expect(screen.getByRole("button", { name: "구간 분석" })).toHaveAttribute("aria-pressed", "false");
  });
});
