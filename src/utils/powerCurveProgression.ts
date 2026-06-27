import { calculatePowerCurve, type PowerCurvePoint } from "./powerCurve";

export interface PowerCurveProgression {
  label: string;
  color: string;
  points: PowerCurvePoint[];
}

/**
 * 여러 활동의 watts 배열에서 기간별 최고 파워 커브 계산.
 * 각 기간의 모든 활동에서 각 duration의 최대값을 취함.
 */
export function calculatePowerCurveProgression(
  periods: { label: string; color: string; wattsArrays: number[][] }[],
): PowerCurveProgression[] {
  return periods
    .map((period) => {
      if (period.wattsArrays.length === 0) return { ...period, points: [] };

      const curves = period.wattsArrays.map((watts) => calculatePowerCurve(watts));
      const durationMax = new Map<number, number>();

      for (const curve of curves) {
        for (const p of curve) {
          const current = durationMax.get(p.durationSeconds) ?? 0;
          if (p.maxPower > current) durationMax.set(p.durationSeconds, p.maxPower);
        }
      }

      const points: PowerCurvePoint[] = Array.from(durationMax.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([durationSeconds, maxPower]) => ({ durationSeconds, maxPower }));

      return { label: period.label, color: period.color, points };
    })
    .filter((p) => p.points.length > 0);
}
