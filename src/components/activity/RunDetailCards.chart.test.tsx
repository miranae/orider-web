import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ActivityStreams } from "@shared/types";
import { RunLeftCards } from "./RunDetailCards";

describe("RunLeftCards chart palette", () => {
  it("uses semantic heart-rate line and five ordered zone colors", () => {
    const streams = { laps: [
      { distanceKm: 1, durationMs: 300000, avgHeartRate: 110 },
      { distanceKm: 1, durationMs: 310000, avgHeartRate: 130 },
      { distanceKm: 1, durationMs: 320000, avgHeartRate: 150 },
      { distanceKm: 1, durationMs: 330000, avgHeartRate: 165 },
      { distanceKm: 1, durationMs: 340000, avgHeartRate: 180 },
    ] } as unknown as ActivityStreams;
    const { container } = render(<RunLeftCards streams={streams} hrZoneSec={[60, 120, 180, 120, 60]} />);

    expect(container.querySelector('path[stroke="var(--chart-heart-rate)"]')).not.toBeNull();
    expect(container.querySelector('linearGradient#hrFill stop[stop-color="var(--chart-heart-rate)"]')).not.toBeNull();
    for (let zone = 1; zone <= 5; zone++) {
      expect(container.querySelector(`[style*="background: var(--zone-${zone})"]`)).not.toBeNull();
    }
  });
});

it("does not infer HR zones from lap averages without canonical durations", () => {
 const { container } = render(<RunLeftCards streams={{ laps: [{ distanceKm: 1, durationMs: 300000, avgHeartRate: 150 }] } as unknown as ActivityStreams} />);
 expect(container.querySelector('[data-testid="run-canonical-hr-zones"]')).toBeNull();
});
it("does not manufacture pace paths for missing lap duration", () => {
 const { container } = render(<RunLeftCards streams={{ laps: [{ distanceKm: 1 }] } as unknown as ActivityStreams} />);
 expect(container.querySelector('path[stroke="var(--chart-pace)"]')).toBeNull();
});
