import { maxWeightedAverage, sampleDurationsSec, totalDurationSec } from "./sampleTime";
import type { StreamTimeArray } from "./streamTime";

export interface PowerCurvePoint {
  durationSeconds: number;
  maxPower: number;
}

export function calculatePowerCurve(watts: number[], time?: StreamTimeArray): PowerCurvePoint[] {
  const durations = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];
  const sampleDurations = sampleDurationsSec(watts.length, time);
  const total = totalDurationSec(watts.length, time);
  return durations
    .filter(d => d <= total)
    .map(d => ({
      durationSeconds: d,
      maxPower: Math.round(maxWeightedAverage(watts, sampleDurations, d) ?? 0),
    }));
}
