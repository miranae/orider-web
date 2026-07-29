import { maxWeightedAverage, sampleDurationsSec, totalDurationSec, type SampleTiming } from "./sampleTime";
import type { StreamTimeArray } from "./streamTime";

export interface PowerCurvePoint {
  durationSeconds: number;
  maxPower: number;
}

export function calculatePowerCurve(watts: number[], time?: StreamTimeArray, timing?: SampleTiming): PowerCurvePoint[] {
  const durations = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];
  const sampleDurations = sampleDurationsSec(watts.length, time, timing);
  const total = totalDurationSec(watts.length, time, timing);
  return durations
    .filter(d => d <= total)
    .flatMap(d => {
      const maxPower = maxWeightedAverage(watts, sampleDurations, d, timing?.segmentStarts);
      return maxPower == null ? [] : [{ durationSeconds: d, maxPower: Math.round(maxPower) }];
    });
}
