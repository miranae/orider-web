/** Deterministic synthetic records. No user data or service imports. */
export type FixtureMetric = 'hr' | 'power' | 'speed' | 'cadence' | 'elevation';
export interface FixtureSample {
  distance: number;
  time: number;
  hr: number | null;
  power: number | null;
  speed: number | null;
  cadence: number | null;
  elevation: number | null;
}
export interface FixtureRecord { id: string; label: string; samples: FixtureSample[] }
export const FIXTURE_METRICS: { id: FixtureMetric; label: string; unit: string }[] = [
  { id: 'hr', label: '심박수', unit: 'bpm' },
  { id: 'power', label: '파워', unit: 'W' },
  { id: 'speed', label: '이동속도', unit: 'km/h' },
  { id: 'cadence', label: '케이던스', unit: 'rpm' },
];
export const FIXTURE_RECORDS: FixtureRecord[] = [0, 1].map(record => ({
  id: `fixture-${record}`, label: `라이더 ${record === 0 ? 'A' : 'B'}`,
  samples: Array.from({ length: 181 }, (_, index) => {
    const wave = Math.sin(index / 15 + record * 0.7), effort = Math.sin(index / 6 + record);
    const gap = index >= 75 && index <= 80;
    const stopped = index >= 126 && index <= 128;
    return {
      distance: index * 0.18,
      time: index * 0.5 + record * 2,
      hr: gap ? null : Math.round(139 + wave * 13 + effort * 3 + record * 2),
      power: gap ? null : stopped ? 0 : Math.round(180 + wave * 49 + effort * 20 + record * 12),
      speed: gap ? null : stopped ? 0 : Math.round((24 + wave * 5 + effort * 1.2 + record * 0.8) * 10) / 10,
      cadence: gap ? null : stopped ? 0 : Math.round(83 + wave * 6 + effort * 3 + record),
      elevation: Math.round(120 + Math.sin(index / 32) * 70 + record * 8),
    };
  }),
}));

export function fixtureCoordinate(sample: FixtureSample, axis: 'distance' | 'time') {
  return axis === 'distance' ? sample.distance : sample.time;
}
export function fixtureDomain(axis: 'distance' | 'time'): [number, number] {
  return [0, Math.max(...FIXTURE_RECORDS.map(record => fixtureCoordinate(record.samples[record.samples.length - 1]!, axis)))];
}
export function fixtureNearest(record: FixtureRecord, coordinate: number | null, axis: 'distance' | 'time') {
  if (coordinate == null) return null;
  const candidate = record.samples.reduce((best, sample) => Math.abs(fixtureCoordinate(sample, axis) - coordinate) < Math.abs(fixtureCoordinate(best, axis) - coordinate) ? sample : best);
  return Math.abs(fixtureCoordinate(candidate, axis) - coordinate) <= (axis === 'distance' ? 0.1 : 0.26) ? candidate : null;
}
/** Sample-owned interval intersections, weighted by actual sample duration; missing values excluded. */
export function fixtureObservedMean(record: FixtureRecord, metric: FixtureMetric, axis: 'distance' | 'time', range: [number, number]): number | null {
  let total = 0, observed = 0;
  for (let index = 0; index < record.samples.length - 1; index++) {
    const sample = record.samples[index]!, next = record.samples[index + 1]!;
    const value = sample[metric];
    if (value == null) continue;
    const start = fixtureCoordinate(sample, axis), end = fixtureCoordinate(next, axis);
    const overlap = Math.max(0, Math.min(end, range[1]) - Math.max(start, range[0]));
    const duration = (next.time - sample.time) * overlap / (end - start);
    if (!Number.isFinite(duration) || duration <= 0) continue;
    total += value * duration; observed += duration;
  }
  return observed > 0 ? total / observed : null;
}
export function fixtureRoute(progress: number): [number, number] {
  const t = Math.max(0, Math.min(1, progress));
  return [62 + t * 476, 132 + Math.sin(t * Math.PI * 3.6) * 44 + Math.sin(t * Math.PI * 7) * 14];
}
export function fixtureRoutePath(start = 0, end = 1): string {
  return Array.from({ length: 121 }, (_, index) => {
    const [x, y] = fixtureRoute(start + (end - start) * index / 120);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

export interface FixtureSummaryRow {
  id: string;
  label: string;
  distance: number;
  duration: number;
  power: number | null;
  hr: number | null;
  speed: number | null;
}
export type FixtureSummarySortKey = 'distance' | 'duration' | 'power';
export const FIXTURE_SUMMARY_ROWS: FixtureSummaryRow[] = [
  ...FIXTURE_RECORDS.map((record, index) => ({
    id: record.id,
    label: index === 0 ? '강변 아침 라이딩' : '퇴근 후 공원 순환 라이딩 · 긴 활동 이름 예시',
    distance: record.samples[record.samples.length - 1]!.distance,
    duration: 90,
    power: fixtureObservedMean(record, 'power', 'time', [0, 92]),
    hr: fixtureObservedMean(record, 'hr', 'time', [0, 92]),
    speed: fixtureObservedMean(record, 'speed', 'time', [0, 92]),
  })),
  { id: 'fixture-missing', label: '센서 미연결 라이딩', distance: 12.8, duration: 55, power: null, hr: null, speed: 14 },
  { id: 'fixture-zero', label: '정지 상태 점검', distance: 0, duration: 4, power: 0, hr: 92, speed: 0 },
];
/** Missing values remain last in both orders; equal values preserve the original record order. */
export function sortFixtureSummaries(rows: readonly FixtureSummaryRow[], key: FixtureSummarySortKey, direction: 'ascending' | 'descending') {
  return [...rows].sort((first, second) => {
    const a = first[key], b = second[key];
    if (a == null) return b == null ? 0 : 1;
    if (b == null) return -1;
    return direction === 'ascending' ? a - b : b - a;
  });
}
export const FIXTURE_COMBO_SAMPLES = FIXTURE_RECORDS[0]!.samples.filter((_, index) => index % 9 === 0 || index === 78);
