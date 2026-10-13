import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ActivityMetrics, RidePeakEffort } from "@shared/types/activity-metrics";
import ko from "../../../i18n/resources/ko/activity.json";
import ActivityPeakEffortInspector from "./ActivityPeakEffortInspector";

vi.mock("../../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: "metric" }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => {
  let text: unknown = ko;
  for (const part of key.split(".")) text = (text as Record<string, unknown>)?.[part];
  return typeof text === "string" ? text.replace(/{{(\w+)}}/g, (_, name: string) => String(params?.[name] ?? "")) : key;
} }) }));
const peak = { durationSec: 60, startIndex: 100, endIndex: 160, startOffsetSec: 3600, fromKm: 1, toKm: 2,
  avgPowerW: 250, maxPowerW: 400, avgHr: null, maxHr: 180, avgSpeedKmh: 30,
  maxSpeedKmh: 40, avgCadence: 90, containsMaxHr: false, leadsToMaxHr: false } satisfies RidePeakEffort;
const metrics = { discipline: "bike", isVirtualPower: false, computedAt: 1,
  peakEfforts: { peaks: [peak, { ...peak, durationSec: 120, avgPowerW: 220 }], highlight: peak, indexAxis: "route" } } as ActivityMetrics;
describe("ActivityPeakEffortInspector", () => {
  it("opens canonical sensor values without asking for location or streams; only explicit locate requests it", () => {
    const locate = vi.fn();
    render(<ActivityPeakEffortInspector activityId="a" metrics={metrics} isOwner onLocate={locate} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "최고 노력 자세히 보기" }));
    expect(screen.getByText("250 W")).toBeInTheDocument();
    expect(screen.getByText("활동 경과 60:00–61:00", { exact: false })).toBeInTheDocument();
    expect(locate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "차트·지도에서 구간 보기" }));
    expect(locate).toHaveBeenCalledWith(peak);
    fireEvent.click(screen.getByRole("button", { name: "2분" }));
    expect(screen.getByText("220 W")).toBeInTheDocument();
    expect(locate).toHaveBeenLastCalledWith(null);
  });
  it("does not offer route location for sensor/unknown axis and never shows missing HR as zero", () => {
    render(<ActivityPeakEffortInspector activityId="a" metrics={{ ...metrics, peakEfforts: { ...metrics.peakEfforts!, indexAxis: "sensor" } }} isOwner onLocate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "최고 노력 자세히 보기" }));
    expect(screen.queryByRole("button", { name: "차트·지도에서 구간 보기" })).not.toBeInTheDocument();
    expect(screen.queryByText("0 bpm")).not.toBeInTheDocument();
    expect(screen.getByText(ko.peakInspector.noLocation)).toBeInTheDocument();
  });
  it("withholds invalidated heart rate and cadence without discarding confirmed power", () => {
    render(<ActivityPeakEffortInspector activityId="a" metrics={metrics} isOwner suppressHeartRate suppressCadence />);
    fireEvent.click(screen.getByRole("button", { name: "최고 노력 자세히 보기" }));
    expect(screen.getByText("250 W")).toBeInTheDocument();
    expect(screen.queryByText("180 bpm")).not.toBeInTheDocument();
    expect(screen.queryByText("90 rpm")).not.toBeInTheDocument();
  });
  it("resets opened state on activity/canonical revision changes and suppresses public/invalidated values", () => {
    const view = render(<ActivityPeakEffortInspector activityId="a" metrics={metrics} isOwner />);
    fireEvent.click(screen.getByRole("button", { name: "최고 노력 자세히 보기" }));
    view.rerender(<ActivityPeakEffortInspector activityId="b" metrics={metrics} isOwner />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "최고 노력 자세히 보기" }));
    view.rerender(<ActivityPeakEffortInspector activityId="b" metrics={{ ...metrics, computedAt: 2 }} isOwner />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    view.rerender(<ActivityPeakEffortInspector activityId="b" metrics={metrics} isOwner={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    view.rerender(<ActivityPeakEffortInspector activityId="b" metrics={metrics} isOwner invalidated />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
