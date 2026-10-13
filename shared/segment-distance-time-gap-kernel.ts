import { SEGMENT_GAP_LIMITS as L, SEGMENT_GAP_POLICY, type SegmentGapComparison, type SegmentGapReason,
  type SegmentGapSource, type SegmentGapPoint } from "./segment-distance-time-gap";
type Point = [number, number];
export interface StoredSegmentWindow { coordinates: Point[]; elapsedSec: number[]; distanceM: number[]; source: SegmentGapSource }
export class SegmentGapInputError extends Error { constructor(readonly reason: SegmentGapReason) { super(reason); } }
const fail = (reason: SegmentGapReason): never => { throw new SegmentGapInputError(reason); };
const dense = (a: unknown[]): boolean => { for (let i = 0; i < a.length; i++) if (!Object.prototype.hasOwnProperty.call(a, i)) return false; return true; };
const validPoint = (p: Point): boolean => Array.isArray(p) && p.length === 2 && dense(p) && Number.isFinite(p[0]) && Math.abs(p[0]) <= 90 && Number.isFinite(p[1]) && Math.abs(p[1]) <= 180;
function meters(a: Point, b: Point): number {
  const rad = Math.PI / 180, x = Math.sin((b[0] - a[0]) * rad / 2), y = Math.sin((b[1] - a[1]) * rad / 2);
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(x * x + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * y * y)));
}
interface Profile { progress: number[]; times: number[]; gaps: boolean[] }
/** 지정된 저장 구간만 투영하며 다른 통과 구간을 찾지 않는다. */
function project(input: StoredSegmentWindow, route: Point[], cumulative: number[], length: number): Profile {
  const n = input.coordinates.length;
  if (n < 2 || n > L.windowSamples || input.elapsedSec.length !== n || input.distanceM.length !== n
    || !dense(input.coordinates) || !dense(input.elapsedSec) || !dense(input.distanceM)) fail("invalid_input");
  if (n * (route.length - 1) > L.projectionChecks) fail("input_limit");
  const tolerance = Math.min(50, length * .08), maxGap = Math.max(60, Math.min(150, length * .25));
  const progress: number[] = [], gaps: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const p = input.coordinates[i]!, time = input.elapsedSec[i]!, distance = input.distanceM[i]!;
    if (!validPoint(p) || !Number.isFinite(time) || time < 0 || !Number.isFinite(distance) || distance < 0) fail("invalid_input");
    if (i && (time <= input.elapsedSec[i - 1]! || distance < input.distanceM[i - 1]!)) fail("invalid_input");
    if (i && (distance - input.distanceM[i - 1]! > maxGap || meters(p, input.coordinates[i - 1]!) > maxGap)) fail("geometry_not_forward");
    const candidates: { error: number; position: number }[] = [];
    for (let j = 0; j < route.length - 1; j++) {
      const a = route[j]!, b = route[j + 1]!, scale = Math.cos(p[0] * Math.PI / 180);
      const dx = (b[1] - a[1]) * scale, dy = b[0] - a[0], square = dx * dx + dy * dy;
      const fraction = Math.max(0, Math.min(1, square > 0 ? ((p[1] - a[1]) * scale * dx + (p[0] - a[0]) * dy) / square : 0));
      const projected: Point = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
      candidates.push({ error: meters(p, projected), position: cumulative[j]! + (cumulative[j + 1]! - cumulative[j]!) * fraction });
    }
    candidates.sort((a, b) => a.error - b.error || a.position - b.position);
    const best = candidates[0]!;
    if (best.error > tolerance || candidates.some(c => c.error <= best.error + 1e-6 && Math.abs(c.position - best.position) > 1e-3)) fail("geometry_not_forward");
    if (i && best.position < progress[i - 1]! - 1e-6) fail("geometry_not_forward");
    progress.push(i ? Math.max(progress[i - 1]!, best.position) : best.position);
    gaps.push(i > 0 && time - input.elapsedSec[i - 1]! > 30);
  }
  const traveled = input.distanceM[n - 1]! - input.distanceM[0]!;
  if (input.source.observedElapsedSec !== input.elapsedSec[n - 1]! - input.elapsedSec[0]!
    || input.source.storedElapsedSec !== input.source.observedElapsedSec) fail("invalid_input");
  if (meters(input.coordinates[0]!, route[0]!) > 50 || meters(input.coordinates[n - 1]!, route[route.length - 1]!) > tolerance
    || traveled < length * .8 || traveled > length * 1.35 + tolerance * 2) fail("geometry_not_forward");
  // 기존 matcher의 경로 비례 checkpoint 간격/허용 범위를 저장 구간에만 적용한다.
  // 이미 선택된 인덱스를 이동하거나 다른 통과를 찾지 않는다.
  const step = Math.max(10, length / 200); let cursor = 0;
  for (let j = 0; j < route.length - 1; j++) {
    const count = Math.max(1, Math.ceil((cumulative[j + 1]! - cumulative[j]!) / step));
    for (let k = 0; k <= count; k++) {
      const fraction = k / count, s = cumulative[j]! + (cumulative[j + 1]! - cumulative[j]!) * fraction;
      if (s < progress[0]! || s > progress[n - 1]!) continue;
      while (cursor + 1 < n - 1 && progress[cursor + 1]! < s) cursor++;
      const width = progress[cursor + 1]! - progress[cursor]!;
      const f = width > 0 ? (s - progress[cursor]!) / width : 0;
      const a = input.coordinates[cursor]!, b = input.coordinates[cursor + 1]!;
      const observation: Point = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      const checkpoint: Point = [route[j]![0] + (route[j + 1]![0] - route[j]![0]) * fraction,
        route[j]![1] + (route[j + 1]![1] - route[j]![1]) * fraction];
      if (meters(checkpoint, observation) > tolerance) fail("geometry_not_forward");
    }
  }
  return { progress, times: input.elapsedSec, gaps };
}
function arrival(profile: Profile, s: number): [number | null, number | null] {
  let first = -1;
  for (let i = 0; i < profile.progress.length; i++) {
    const p = profile.progress[i]!;
    if (Math.abs(p - s) <= 1e-6) { first = i; break; }
    if (p > s) {
      if (!i || profile.gaps[i]) return [null, null];
      const prior = profile.progress[i - 1]!, width = p - prior;
      if (!(width > 0)) return [null, null];
      const t = profile.times[i - 1]! + (profile.times[i]! - profile.times[i - 1]!) * (s - prior) / width;
      return [t, t];
    }
  }
  if (first < 0) return [null, null];
  let last = first;
  while (last + 1 < profile.progress.length && Math.abs(profile.progress[last + 1]! - s) <= 1e-6) {
    if (profile.gaps[last + 1]) return [profile.times[first]!, null];
    last++;
  }
  return [profile.times[first]!, profile.times[last]!];
}
export function compareStoredSegmentWindows(route: Point[], inputs: [StoredSegmentWindow, StoredSegmentWindow], geometryRevision: string): SegmentGapComparison {
  if (!Array.isArray(route) || route.length < 2 || route.length > L.geometryPoints || !dense(route) || !route.every(validPoint)) fail("missing_geometry");
  const cumulative = [0];
  for (let i = 1; i < route.length; i++) {
    const d = meters(route[i - 1]!, route[i]!);
    if (!(d > 0) || !Number.isFinite(d)) fail("missing_geometry");
    cumulative.push(cumulative[i - 1]! + d);
  }
  const length = cumulative[cumulative.length - 1]!;
  const profiles = inputs.map(input => project(input, route, cumulative, length)) as [Profile, Profile];
  const from = Math.max(profiles[0].progress[0]!, profiles[1].progress[0]!), to = Math.min(profiles[0].progress[profiles[0].progress.length - 1]!, profiles[1].progress[profiles[1].progress.length - 1]!);
  if (!(to > from)) fail("no_common_observation");
  const origins = profiles.map(p => arrival(p, from)[0]);
  if (origins.some(o => o === null)) fail("no_common_observation");
  const events: SegmentGapComparison["events"] = [], positions = new Set<number>([from, to]);
  for (let k = 0; k < 2; k++) {
    const p = profiles[k]!;
    for (let i = 1; i < p.progress.length; i++) {
      const s = p.progress[i]!;
      if (s < from || s > to) continue;
      if (p.gaps[i] || Math.abs(s - p.progress[i - 1]!) <= 1e-6) {
        events.push({ distanceM: s, source: k as 0 | 1, kind: p.gaps[i] ? "unobserved_gap" : "plateau" });
        positions.add(s);
        if (p.gaps[i] && p.progress[i - 1]! >= from) {
          positions.add(p.progress[i - 1]!);
          if (s > p.progress[i - 1]!) positions.add((s + p.progress[i - 1]!) / 2);
        }
      }
    }
  }
  if (events.length > L.events) fail("input_limit");
  for (let i = 1; i < L.plotPoints - 1; i++) positions.add(from + (to - from) * i / (L.plotPoints - 1));
  if (positions.size > L.combinedPoints) fail("input_limit");
  const marker = (s: number): Point => {
    const j = Math.max(1, cumulative.findIndex(p => p >= s));
    const f = (s - cumulative[j - 1]!) / (cumulative[j]! - cumulative[j - 1]!);
    return [route[j - 1]![0] + (route[j]![0] - route[j - 1]![0]) * f, route[j - 1]![1] + (route[j]![1] - route[j - 1]![1]) * f];
  };
  const points: SegmentGapPoint[] = [...positions].sort((a, b) => a - b).map(distanceM => {
    const values = profiles.map((p, i) => arrival(p, distanceM).map(t => t === null ? null : t - origins[i]!));
    const elapsedSec: SegmentGapPoint["elapsedSec"] = [values[0]![0]!, values[1]![0]!];
    return { distanceM, elapsedSec, departureSec: [values[0]![1]!, values[1]![1]!],
      gapSec: elapsedSec[0] === null || elapsedSec[1] === null ? null : elapsedSec[0] - elapsedSec[1], marker: marker(distanceM) };
  });
  return { policy: SEGMENT_GAP_POLICY, direction: "current_stored_geometry_revalidated", historicalGeometryAttested: false,
    originalClockVerified: false, quality: "unknown", basis: "common_observed_first_arrival", presentation: "sample_bracket_interpolation",
    geometryRevision, sources: inputs.map(i => i.source) as SegmentGapComparison["sources"], fromDistanceM: from, toDistanceM: to,
    geometryLengthM: length, fullCurrentGeometry: from <= 1e-6 && length - to <= 1e-6, points, events };
}
