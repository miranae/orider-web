import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import type { AvailablePowerWindowInput } from "../../../utils/powerDurationWindows";
import Panel from "./PowerDurationWindowsPanel";
const mock = vi.hoisted(() => ({ calculate: vi.fn() }));
vi.mock("../../../hooks/usePowerDurationWindows", () => ({ usePowerDurationWindows: mock.calculate }));
const input: AvailablePowerWindowInput = { state: "available", reason: null, inputRevision: "a".repeat(64), algorithmVersion: "sample-time-weighted-v1", timingBasis: "elapsed", scope: "selected_range", rangeStartElapsedSec: 100, rangeEndElapsedSec: 3700, provenance: "strava_api", startsSec: [100], durationsSec: [3600], watts: [200], segmentStarts: [true], longestContinuousSeconds: 3600 };
beforeEach(() => mock.calculate.mockReset().mockReturnValue({ state: "available", points: [{ durationSeconds: 1, maxPower: 220 }, { durationSeconds: 3600, maxPower: 200 }], point: { durationSeconds: 17, maxPower: 210 } }));
describe("selected-range calculated power durations", () => {
  it("shows measured scope, exact17s and disables90min/2hr outside known continuous duration", () => {
    renderWithProviders(<Panel input={input} identity="synthetic-owner:activity:r1" />);
    expect(screen.getByText(/선택 범위 1:40–1:01:40/)).toBeInTheDocument();
    expect(screen.getByText(/0W를 포함하며 결측/)).toBeInTheDocument();
    expect(screen.getByText("0:17 · 210.0 W")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "1:30:00" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "2:00:00" })).toBeDisabled();
    expect(screen.getByRole("img")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: "지속시간 직접 입력 (초)" }), { target: { value: "5400" } });
    expect(screen.getByRole("spinbutton")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/연속 측정 범위 안의 양수/)).toBeInTheDocument();
    expect(mock.calculate).toHaveBeenLastCalledWith(input, "synthetic-owner:activity:r1", 5400);
  });
  it("starts with a supported duration when the continuous interval is shorter than17seconds", () => {
    renderWithProviders(<Panel input={{ ...input, rangeEndElapsedSec: 110, durationsSec: [10], longestContinuousSeconds: 10 }} identity="synthetic-short" />);
    expect(screen.getByRole("spinbutton")).toHaveValue(10);
    expect(screen.getByRole("spinbutton")).toHaveAttribute("aria-invalid", "false");
  });
  it("keeps zeroW and actual fractional duration without claiming interpolated values", () => {
    mock.calculate.mockReturnValue({ state: "available", points: [{ durationSeconds: 1, maxPower: 0 }], point: { durationSeconds: 17, maxPower: 0 } });
    renderWithProviders(<Panel input={input} identity="synthetic" />);
    expect(screen.getByText("0:17 · 0.0 W")).toBeInTheDocument();
    expect(screen.getByText(/점 사이 값을 기록으로 보간하지/)).toBeInTheDocument();
  });
  it("uses explicit unavailable provenance and does not render duration controls", () => {
    const { startsSec: _starts, durationsSec: _durations, watts: _watts, segmentStarts: _segments, longestContinuousSeconds: _longest, provenance: _source, ...common } = input;
    renderWithProviders(<Panel input={{ ...common, state: "unavailable", reason: "virtual_power" }} identity="synthetic" />);
    expect(screen.getByText(/가상 파워에서는 측정/)).toBeInTheDocument();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });
});
