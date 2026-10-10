import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { periodFixture } from "../../../services/trainingAnalysisPeriods.fixture";
import TrainingPeriodZonesPanel from "./TrainingPeriodZonesPanel";

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
