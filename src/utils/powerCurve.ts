export interface PowerCurvePoint {
  durationSeconds: number;
  maxPower: number;
}

function maxRollingAverage(data: number[], window: number): number {
  if (data.length < window) return 0;
  let maxAvg = 0;
  let sum = 0;
  for (let i = 0; i < window; i++) sum += data[i]!;
  maxAvg = sum / window;
  for (let i = window; i < data.length; i++) {
    sum += data[i]! - data[i - window]!;
    maxAvg = Math.max(maxAvg, sum / window);
  }
  return Math.round(maxAvg);
}

export function calculatePowerCurve(watts: number[]): PowerCurvePoint[] {
  const durations = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];
  return durations
    .filter(d => d <= watts.length)
    .map(d => ({
      durationSeconds: d,
      maxPower: maxRollingAverage(watts, d),
    }));
}
