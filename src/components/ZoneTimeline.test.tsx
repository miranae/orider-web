import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import ZoneTimeline from "./ZoneTimeline";

describe("ZoneTimeline", () => {
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
