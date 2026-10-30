/** Provider values are evidence, never aliases for Orider calculations. Units match Strava API. */
export interface StravaSummaryV1 {
  version: 1;
  distance?: number | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
  average_speed?: number | null;
  max_speed?: number | null;
  total_elevation_gain?: number | null;
  average_watts?: number | null;
  max_watts?: number | null;
  weighted_average_watts?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_cadence?: number | null;
  max_cadence?: number | null;
  kilojoules?: number | null;
  calories?: number | null;
  suffer_score?: number | null;
  average_temp?: number | null;
}
const fields = ['distance', 'moving_time', 'elapsed_time', 'average_speed', 'max_speed',
  'total_elevation_gain', 'average_watts', 'max_watts', 'weighted_average_watts',
  'average_heartrate', 'max_heartrate', 'average_cadence', 'max_cadence',
  'kilojoules', 'calories', 'suffer_score', 'average_temp'] as const;
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const number = (v: unknown, signed = false): number | null => typeof v === 'number' && Number.isFinite(v) && (signed || v >= 0) ? v : null;
/** Omitted fields stay omitted, so list responses cannot erase detail-only values. */
export function captureStravaSummary(input: unknown): StravaSummaryV1 {
  const raw = record(input); const result: StravaSummaryV1 = { version: 1 };
  for (const key of fields) if (Object.prototype.hasOwnProperty.call(raw, key)) result[key] = number(raw[key], key === 'average_temp');
  return result;
}
export function stravaRecordOf(activity: unknown): StravaSummaryV1 | null {
  const a = record(activity);
  if (a.source !== 'strava') return null;
  const redact = (value: StravaSummaryV1): StravaSummaryV1 => ({ ...value,
    ...(a.hidePower === true ? { average_watts: null, max_watts: null, weighted_average_watts: null, kilojoules: null } : {}),
    ...(a.hideHr === true ? { average_heartrate: null, max_heartrate: null, suffer_score: null } : {}),
  });
  const raw = record(a.stravaSummaryV1);
  if (raw.version === 1) return redact(captureStravaSummary(raw));
  // Legacy import fields retained the provider summary. Calories/TSS were estimates: never relabel them.
  const s = record(a.summary);
  const moving = number(s.ridingTimeMillis);
  const start = number(a.startTime), end = number(a.endTime);
  return redact(captureStravaSummary({ distance: s.distance, moving_time: moving == null ? null : moving / 1000,
    elapsed_time: start != null && end != null && end >= start ? (end - start) / 1000 : null,
    average_speed: number(s.averageSpeed) == null ? null : (s.averageSpeed as number) / 3.6,
    max_speed: number(s.maxSpeed) == null ? null : (s.maxSpeed as number) / 3.6,
    total_elevation_gain: s.elevationGain, average_watts: s.averagePower, max_watts: s.maxPower,
    weighted_average_watts: s.normalizedPower, average_heartrate: s.averageHeartRate,
    max_heartrate: s.maxHeartRate, average_cadence: s.averageCadence, max_cadence: s.maxCadence,
    calories: s.caloriesSource === 'provider' ? s.calories : null, suffer_score: s.relativeEffort }));
}
/** Source-only text is also the safe placeholder while current analysis is loading. */
export function formatStravaRecord(record: StravaSummaryV1, lang: 'ko' | 'en'): string {
  const ko = lang === 'ko'; const lines = [ko ? '▰ Strava 원본' : '▰ Strava record'];
  const add = (label: string, value: number | null | undefined, unit: string, digits = 0) => {
    if (number(value) != null) lines.push(`${label} ${value!.toFixed(digits)}${unit}`);
  };
  add(ko ? '거리' : 'Distance', record.distance == null ? null : record.distance / 1000, 'km', 2);
  if (record.moving_time != null) {
    const n = Math.round(record.moving_time);
    lines.push(`${ko ? '이동' : 'Moving'} ${[Math.floor(n / 3600), Math.floor(n % 3600 / 60), n % 60].map(v => String(v).padStart(2, '0')).join(':')}`);
  }
  add(ko ? '평균 속도' : 'Average speed', record.average_speed == null ? null : record.average_speed * 3.6, 'km/h', 1);
  add(ko ? '최고 속도' : 'Maximum speed', record.max_speed == null ? null : record.max_speed * 3.6, 'km/h', 1);
  add(ko ? '획득 고도' : 'Elevation gain', record.total_elevation_gain, 'm');
  add(ko ? '평균 파워' : 'Average power', record.average_watts, 'W');
  add(ko ? '가중평균 파워' : 'Weighted average power', record.weighted_average_watts, 'W');
  add(ko ? '칼로리' : 'Calories', record.calories, 'kcal');
  add('Relative Effort', record.suffer_score, '');
  return lines.join('\n');
}
