import { maxWeightedAverage, sampleDurationsSec, type SampleTiming } from "./sampleTime";
import type { StreamTimeArray } from "./streamTime";

export function calculateThreeSecondPowerMax(
  watts: number[],
  time?: StreamTimeArray,
  timing?: SampleTiming,
): number | null {
  return maxWeightedAverage(
    watts,
    sampleDurationsSec(watts.length, time, timing),
    3,
    timing?.segmentStarts,
  );
}
