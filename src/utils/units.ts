export type Units = 'metric' | 'imperial';
export type Sport = 'bike' | 'run' | 'swim';

const M_PER_MI = 1609.344;
const M_PER_FT = 0.3048;
const KG_PER_LB = 0.45359237;

export function formatDistance(meters: number, units: Units): string {
  if (units === 'imperial') {
    const mi = meters / M_PER_MI;
    return `${mi.toFixed(1)}mi`;
  }
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export function formatSpeed(mps: number, units: Units, _sport: Sport): string {
  if (units === 'imperial') {
    const mph = (mps * 3600) / M_PER_MI;
    return `${mph.toFixed(1)}mph`;
  }
  return `${(mps * 3.6).toFixed(1)}km/h`;
}

export function formatPace(secPerKm: number, units: Units): string {
  const secPerUnit = units === 'imperial' ? secPerKm * (M_PER_MI / 1000) : secPerKm;
  let m = Math.floor(secPerUnit / 60);
  let s = Math.round(secPerUnit - m * 60);
  if (s === 60) { m += 1; s = 0; }
  const unit = units === 'imperial' ? '/mi' : '/km';
  return `${m}:${String(s).padStart(2, '0')}${unit}`;
}

export function formatElev(meters: number, units: Units): string {
  if (units === 'imperial') return `${Math.round(meters / M_PER_FT)}ft`;
  return `${Math.round(meters)}m`;
}

export function formatTemp(celsius: number, units: Units): string {
  if (units === 'imperial') return `${Math.round((celsius * 9) / 5 + 32)}°F`;
  return `${Math.round(celsius)}°C`;
}

export function formatWeight(kg: number, units: Units): string {
  if (units === 'imperial') return `${(kg / KG_PER_LB).toFixed(1)}lb`;
  return `${kg.toFixed(1)}kg`;
}

export function formatPower(watts: number): string {
  return `${Math.round(watts)}W`;
}

export function formatHr(bpm: number): string {
  return `${Math.round(bpm)}bpm`;
}

/**
 * 차트 툴팁·라벨 등에서 raw 숫자를 표시할 때 쓰는 범용 포맷터.
 * 부동소수점 누적값(135.30000000000001)을 반올림하고 불필요한 끝자리 0을 제거한다.
 * 예: formatNum(135.30000000000001) → "135.3", formatNum(190.0) → "190", formatNum(7.02, 1) → "7"
 */
export function formatNum(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '0';
  return Number(value.toFixed(digits)).toString();
}
