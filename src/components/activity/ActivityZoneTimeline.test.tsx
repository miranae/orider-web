import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { ActivityZoneTimeline } from "./ActivityZoneTimeline";
import type { ActivityMetricsDoc } from "../../hooks/useActivityMetrics";

/** 존 타임라인은 서버 `renderSeries` 를 그린다 — 스트림에서 존을 다시 판정하지 않는다 (#2437). */
const metrics = (over: Partial<ActivityMetricsDoc>): ActivityMetricsDoc => ({
  durationSec: 20, movingTimeSec: 20,
  contextSnapshot: { ftp: 300, maxHr: 190 },
  hrZoneBoundaries: null,
  renderSeries: { resolution: 2, axes: {} },
  ...over,
} as ActivityMetricsDoc);

describe("ActivityZoneTimeline", () => {
  it("파워 축약 시계열을 FTP 기준 존으로 색칠한다", () => {
    renderWithProviders(<ActivityZoneTimeline metrics={metrics({ renderSeries: { resolution: 2, axes: { watts: [100, 500] } } })} />);
    expect(screen.getByRole("region", { name: "존 타임라인" })).toBeInTheDocument();
    const z7 = screen.getAllByRole("img", { name: /Z7 100%$/ });
    expect(z7).not.toHaveLength(0);
    z7.forEach((interval) => expect(interval.firstElementChild).toHaveStyle({ background: "var(--violet)" }));
  });

  it("심박은 서버 존 경계로 판정한다", () => {
    renderWithProviders(<ActivityZoneTimeline metrics={metrics({
      renderSeries: { resolution: 4, axes: { heartrate: [100, 140, 160, 180] } },
      hrZoneBoundaries: {
        reference: "max_hr", referenceBpm: 190, sport: "bike",
        zones: [0, 60, 70, 80, 90].map((minPct, i) => ({ zone: i + 1, minPct, maxPct: null, minBpm: Math.ceil(190 * minPct / 100), maxBpmExclusive: null })),
      },
    })} />);
    expect(screen.getByLabelText("심박 존")).toBeInTheDocument();
  });

  it("축약 시계열이 없으면 그리지 않는다 — 스트림에서 다시 만들지 않는다", () => {
    const { container } = renderWithProviders(<ActivityZoneTimeline metrics={metrics({ renderSeries: null })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
