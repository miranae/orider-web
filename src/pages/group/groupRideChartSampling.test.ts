import { expect, it } from "vitest";
import { sampleRideChart } from "./groupRideChartSampling";
import { sampleChartSeries } from "../../theme/charts/seriesSampling";

it("keeps the group ride compatibility alias on the shared display sampler", () => {
  expect(sampleRideChart).toBe(sampleChartSeries);
});
