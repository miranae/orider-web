import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import ZoneTimeline, { zoneColor } from "./ZoneTimeline";

describe("ZoneTimeline", () => {
  it("uses distinct existing tokens for the highest seven power zones without changing HR mapping", () => {
    expect(zoneColor("power", 5, 7)).toBe("var(--zone-4)");
    expect(zoneColor("power", 6, 7)).toBe("var(--zone-5)");
    expect(zoneColor("power", 7, 7)).toBe("var(--violet)");
    expect(zoneColor("hr", 7, 7)).toBe("var(--zone-5)");
  });

  it("exposes pause-safe effort-time intervals for each rendered zone segment", () => {
    renderWithProviders(
      <ZoneTimeline bucketCount={2} series={[{
        id: "power",
        label: "파워 존",
        values: [100, 200],
        time: [0, 600],
        timing: { durationsSec: [10, 10] },
        resolveZone: (value) => value === 100 ? 1 : 3,
        maxZone: 7,
      }]} />,
    );

    expect(screen.getByRole("img", { name: "00:00–00:10 · Z1" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "00:10–00:20 · Z3" })).toBeInTheDocument();
    expect(screen.getByText("운동 시간 20초")).toBeInTheDocument();
  });

  it("renders an explicit sensor gap as no data while keeping the summary moving time", () => {
    renderWithProviders(
      <ZoneTimeline movingDurationSec={80} bucketCount={6} series={[{
        id: "power",
        label: "파워 존",
        values: [100, 200, 300, 400],
        time: [0, 10, 40, 50],
        timing: { durationsSec: [10, 10, 10, 10], segmentStarts: [true, false, true, false] },
        resolveZone: (value) => Math.ceil(value / 100),
        maxZone: 7,
      }]} />,
    );

    expect(screen.getByRole("img", { name: "00:27–00:40 · 분류할 수 없는 구간" })).toBeInTheDocument();
    expect(screen.getByText("운동 시간 1분")).toBeInTheDocument();
  });

  it("renders nothing when every stream is missing", () => {
    const { container } = renderWithProviders(
      <ZoneTimeline series={[{
        id: "hr",
        label: "심박 존",
        values: undefined,
        time: undefined,
        resolveZone: () => 1,
        maxZone: 5,
      }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
