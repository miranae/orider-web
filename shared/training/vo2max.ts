/**
 * VO2max 추정 — pure, Firebase 무관.
 *
 * 사이클 공식 (Storer/ACSM 계열):
 *   VO2max (ml/kg/min) = 10.8 × power(W) / weightKg + 7
 *   출처: Storer TW et al. (1990), "Direct Supervision of Maximal Cycle Ergometer Testing"
 *         Medicine & Science in Sports & Exercise; ACSM's Guidelines for Exercise Testing
 *         and Prescription (10th ed., Eq. 17-3).
 *
 * 러닝 공식 (Daniels/Daniels-Gilbert):
 *   vVO2max(m/min) → VO2max (ml/kg/min)
 *   VO2max = -4.6 + 0.182258 × v + 0.000104 × v²
 *   출처: Daniels J. (2005), "Daniels' Running Formula" (3rd ed.); Daniels & Gilbert (1979).
 */

/** 합리성 범위 (ml/kg/min). 범위 밖은 추정 불가로 처리. */
const VO2MAX_MIN = 20;
const VO2MAX_MAX = 95;

function guardRange(v: number): number | null {
  if (!Number.isFinite(v) || v < VO2MAX_MIN || v > VO2MAX_MAX) return null;
  return Math.round(v * 10) / 10;
}

/**
 * 사이클 파워 기반 VO2max 추정.
 *
 * @param opts.power5minW  5분 최대 파워(W). 있으면 우선 사용.
 * @param opts.cpW         CP (Critical Power, W). 5분 파워 없을 때 폴백.
 * @param opts.weightKg    체중(kg). 없으면 null 반환.
 * @returns 추정 VO2max (ml/kg/min), 추정 불가 시 null.
 */
export function estimateCyclingVo2max(opts: {
  power5minW?: number | null;
  cpW?: number | null;
  weightKg?: number | null;
}): number | null {
  const { power5minW, cpW, weightKg } = opts;
  if (weightKg == null || !Number.isFinite(weightKg) || weightKg <= 0) return null;
  const power = (power5minW != null && Number.isFinite(power5minW) && power5minW > 0)
    ? power5minW
    : (cpW != null && Number.isFinite(cpW) && cpW > 0)
      ? cpW
      : null;
  if (power == null) return null;
  return guardRange(10.8 * power / weightKg + 7);
}

/**
 * 러닝 vVO2max 기반 VO2max 추정 (Daniels-Gilbert 공식).
 *
 * @param vVO2maxMetersPerMin  vVO2max (m/min) — 최대 유산소 속도.
 * @returns 추정 VO2max (ml/kg/min), 추정 불가 시 null.
 */
export function estimateRunningVo2max(vVO2maxMetersPerMin: number): number | null {
  if (!Number.isFinite(vVO2maxMetersPerMin) || vVO2maxMetersPerMin <= 0) return null;
  const v = vVO2maxMetersPerMin;
  return guardRange(-4.6 + 0.182258 * v + 0.000104 * v * v);
}
