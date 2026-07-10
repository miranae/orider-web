import { calculateTSS } from "./powerMetrics";
import { calcVirtualPowerStream } from "./virtualPower";

export interface VirtualPowerToolInput {
  speedKmh: number;
  gradePercent: number;
  durationMin: number;
  riderWeightKg: number;
  bikeWeightKg: number;
  ftp: number;
}

export interface VirtualPowerToolResult {
  averageWatts: number;
  estimatedTss: number | null;
  ftpEstimate: number;
  distanceKm: number;
}

export function calculateVirtualPowerTool(input: VirtualPowerToolInput): VirtualPowerToolResult {
  const speedMps = Math.max(0, input.speedKmh) / 3.6;
  const seconds = Math.max(30, Math.round(input.durationMin * 60));
  const samples = Math.max(31, Math.min(3600, seconds));
  const time = Array.from({ length: samples }, (_, i) => i);
  const altitude = time.map((sec) => speedMps * sec * (input.gradePercent / 100));
  const velocity_smooth = time.map(() => speedMps);
  const watts = calcVirtualPowerStream(
    { time, altitude, velocity_smooth },
    {
      riderWeightKg: Math.max(35, input.riderWeightKg),
      bikeWeightKg: Math.max(5, input.bikeWeightKg),
      rollingResistance: 0.005,
      cdA: 0.32,
    },
  );
  const activeWatts = watts.filter((w) => Number.isFinite(w) && w > 0);
  const averageWatts = activeWatts.length > 0
    ? Math.round(activeWatts.reduce((sum, w) => sum + w, 0) / activeWatts.length)
    : 0;
  const estimatedTss = input.ftp > 0 ? calculateTSS(watts, input.ftp, time) : null;
  return {
    averageWatts,
    estimatedTss: estimatedTss == null ? null : Math.round(estimatedTss),
    ftpEstimate: Math.round(averageWatts * 0.95),
    distanceKm: Math.round((input.speedKmh * input.durationMin / 60) * 10) / 10,
  };
}
