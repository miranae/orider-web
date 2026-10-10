import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ActivityAnalysisModel } from "../../../hooks/useActivityAnalysisModel";
import type { RidePeakEffort } from "@shared/types/activity-metrics";
import ActivityDetailedCharts from "./ActivityDetailedCharts";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: "metric" }) }));
vi.mock("./ActivityPerformanceCharts", () => ({ default: () => <div data-testid="performance-chart" /> }));
const request = vi.fn();
const peak = { durationSec: 60, startOffsetSec: 0, fromKm: 0, toKm: 0.2 } as RidePeakEffort;
const streams = { distance: [0, 100, 200], time: [0, 10, 20], altitude: [0, 1, 2] };
const model = { activity: { id: "a" }, sport: "ride", streams, effectiveStreams: streams,
  serverMetrics: { metrics: null }, requestStreams: request, loadingStreams: false } as unknown as ActivityAnalysisModel;
describe("ActivityDetailedCharts peak selection", () => {
  it("로그인 필요는 재시도·오류 코드를 숨기고 기존 로그인 액션을 실행한다", () => {
    const signIn = vi.fn();
    const requiredModel = { ...model, streams: null, effectiveStreams: null, streamsSignInRequired: true, streamsError: "SIGN_IN_REQUIRED" };
    request.mockClear();
    const { rerender } = render(<ActivityDetailedCharts model={requiredModel} onSignIn={signIn} />);
    fireEvent.click(screen.getByRole("button", { name: "page.detailedCharts" }));
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByText("page.analysisSignInTitle")).toBeInTheDocument();
    expect(screen.queryByText("SIGN_IN_REQUIRED")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "page.retry" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "kudosCard.loginAction" }));
    expect(signIn).toHaveBeenCalledOnce();
    rerender(<ActivityDetailedCharts model={{ ...model, streamsSignInRequired: false }} onSignIn={signIn} />);
    expect(screen.queryByText("page.analysisSignInTitle")).not.toBeInTheDocument();
    expect(screen.getByTestId("performance-chart")).toBeInTheDocument();
  });

  it("호스트 로그인 액션이 없는 임베드는 실행되지 않는 버튼을 만들지 않는다", () => {
    render(<ActivityDetailedCharts model={{ ...model, streams: null, effectiveStreams: null, streamsSignInRequired: true }} highlightedPeak={peak} />);
    expect(screen.getByText("page.analysisSignInTitle")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "kudosCard.loginAction" })).not.toBeInTheDocument();
  });

  it("clears forced-open peak selection on hide and permits an ordinary reopen without stream reads", () => {
    const clear = vi.fn();
    function Host() {
      const [selection, setSelection] = useState<RidePeakEffort | null>(peak);
      return <ActivityDetailedCharts model={model} highlightedPeak={selection} onClearHighlightedPeak={() => {
        clear(); setSelection(null);
      }} />;
    }
    render(<Host />);
    expect(screen.getByTestId("performance-chart")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "page.hideDetailedCharts" }));
    expect(clear).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("performance-chart")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "page.detailedCharts" }));
    expect(screen.getByTestId("performance-chart")).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
});
