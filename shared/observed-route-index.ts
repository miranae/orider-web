import type { ActivityRouteEvidence, ObservedRouteDirectionComparison } from './activity-route-comparison';
import type { ObservedRouteGeometryDescriptor, ObservedRouteIndexMatch, RouteGeometryDescriptorResult, RouteGeometryPoint } from './activity-route-index';
import { OBSERVED_ROUTE_POLICY_V1 as policy, prepareObservedRouteGeometry } from './observed-route-comparison';

export const OBSERVED_ROUTE_INDEX_MAX_BYTES = 64 * 1024;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const keys = (value: unknown, expected: string): boolean => !!value && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).sort().join(',') === expected.split(',').sort().join(',');
function coordinate(value: unknown): value is RouteGeometryPoint {
  if (!keys(value, 'lat,lon')) return false;
  const p = value as RouteGeometryPoint;
  return finite(p.lat) && Math.abs(p.lat) <= 90 && finite(p.lon) && Math.abs(p.lon) <= 180;
}
function fingerprint(d: Pick<ObservedRouteGeometryDescriptor, 'actualStart' | 'actualEnd' | 'samples'>): string {
  return JSON.stringify([[d.actualStart.lat, d.actualStart.lon], [d.actualEnd.lat, d.actualEnd.lon],
    d.samples.map(p => [p.lat, p.lon])]);
}
function byteSize(value: unknown): number {
  try { return new TextEncoder().encode(JSON.stringify(value)).length; } catch { return Infinity; }
}
/** 입력을 저장하거나 조회하지 않는다. 기존 원본 준비 경로만 공유한다. */
function buildDescriptor(evidence: ActivityRouteEvidence): RouteGeometryDescriptorResult {
  const prepared = prepareObservedRouteGeometry(evidence);
  if (prepared.state !== 'available') return prepared;
  const descriptor: ObservedRouteGeometryDescriptor = {
    policyVersion: 'observed-route-index-v1', scope: 'observed_gps',
    source: { ...prepared.source }, diagnostics: { ...prepared.diagnostics },
    actualStart: { ...prepared.actualStart }, actualEnd: { ...prepared.actualEnd },
    samples: prepared.samples.map(p => ({ ...p })),
    fingerprintKind: 'canonical_geometry_json_v1', geometryFingerprint: '',
  };
  descriptor.geometryFingerprint = fingerprint(descriptor);
  if (byteSize(descriptor) > OBSERVED_ROUTE_INDEX_MAX_BYTES) return { state: 'unavailable', reason: 'serialization_limit' };
  if (!isObservedRouteGeometryDescriptor(descriptor)) return { state: 'unavailable', reason: 'invalid_input' };
  return { state: 'available', descriptor };
}
export function buildObservedRouteGeometryDescriptor(evidence: ActivityRouteEvidence): RouteGeometryDescriptorResult {
  try { return buildDescriptor(evidence); } catch { return { state: 'unavailable', reason: 'invalid_input' }; }
}
/** wire 값의 엄격한 구조 검증이다. 출처의 진위나 원본 수집 완전성을 인증하지 않는다. */
function validDescriptor(value: unknown): value is ObservedRouteGeometryDescriptor {
  if (!keys(value, 'policyVersion,scope,source,actualStart,actualEnd,samples,diagnostics,fingerprintKind,geometryFingerprint')) return false;
  const d = value as ObservedRouteGeometryDescriptor;
  if (d.policyVersion !== 'observed-route-index-v1' || d.scope !== 'observed_gps'
    || d.fingerprintKind !== 'canonical_geometry_json_v1' || typeof d.geometryFingerprint !== 'string'
    || d.geometryFingerprint.length > OBSERVED_ROUTE_INDEX_MAX_BYTES
    || !coordinate(d.actualStart) || !coordinate(d.actualEnd) || !Array.isArray(d.samples)
    || d.samples.length !== policy.maxComparisonPoints) return false;
  for (let i = 0; i < d.samples.length; i++) if (!coordinate(d.samples[i])) return false;
  if (!keys(d.source, 'activityId,routeInputRevision,routeFingerprint,sourceLayer,sourceSchemaVersion,accuracy,timingBasis,timeOrigin,originEpochMs,coverage')
    || !keys(d.diagnostics, 'inputPointCount,observedLengthM,observedElapsedSec,elapsedSpanSec,observedStartElapsedSec,observedEndElapsedSec,gapCount,omittedGapElapsedSec,coverage')) return false;
  const s = d.source; const x = d.diagnostics;
  const opaque = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 256;
  const digest = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  if (!opaque(s.activityId) || s.activityId.includes('/') || !opaque(s.sourceSchemaVersion)
    || !digest(s.routeInputRevision) || !digest(s.routeFingerprint)
    || !['raw_parts', 'api_streams'].includes(s.sourceLayer) || s.accuracy !== 'unknown'
    || s.timingBasis !== 'elapsed' || !['activity_start', 'relative_to_first_gps_observation'].includes(s.timeOrigin)
    || (s.originEpochMs !== null && (!finite(s.originEpochMs) || s.originEpochMs < 0))
    || !['complete', 'partial', 'unknown'].includes(s.coverage) || x.coverage !== s.coverage) return false;
  const numbers = [x.inputPointCount, x.observedLengthM, x.observedElapsedSec, x.elapsedSpanSec,
    x.observedStartElapsedSec, x.observedEndElapsedSec, x.gapCount, x.omittedGapElapsedSec];
  if (!numbers.every(v => finite(v) && v >= 0) || !Number.isInteger(x.inputPointCount)
    || x.inputPointCount < 2 || x.inputPointCount > policy.maxInputPoints
    || !Number.isInteger(x.gapCount) || x.gapCount >= x.inputPointCount
    || x.observedLengthM <= policy.minimumObservedMeters
    || x.observedLengthM > (x.inputPointCount - 1) * policy.maxGapMeters
    || x.elapsedSpanSec <= 0 || x.observedElapsedSec <= 0
    || x.observedEndElapsedSec < x.observedStartElapsedSec
    || Math.abs(x.elapsedSpanSec - (x.observedEndElapsedSec - x.observedStartElapsedSec)) > 1e-6
    || Math.abs(x.observedElapsedSec + x.omittedGapElapsedSec - x.elapsedSpanSec) > Math.max(1e-6, x.elapsedSpanSec * 1e-10)
    || (x.gapCount === 0 && x.omittedGapElapsedSec !== 0)) return false;
  return fingerprint(d) === d.geometryFingerprint && byteSize(d) <= OBSERVED_ROUTE_INDEX_MAX_BYTES;
}
export function isObservedRouteGeometryDescriptor(value: unknown): value is ObservedRouteGeometryDescriptor {
  try { return validDescriptor(value); } catch { return false; }
}
function distance(a: RouteGeometryPoint, b: RouteGeometryPoint): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
function compare(a: ObservedRouteGeometryDescriptor, b: ObservedRouteGeometryDescriptor, reverse: boolean): ObservedRouteDirectionComparison {
  const separations = a.samples.map((p, i) => distance(p, b.samples[reverse ? b.samples.length - 1 - i : i]!));
  const sorted = [...separations].sort((x, y) => x - y);
  return { meanSeparationM: separations.reduce((sum, n) => sum + n, 0) / separations.length,
    p95SeparationM: sorted[Math.ceil(sorted.length * .95) - 1]!,
    // 준비된 edge의 양끝 대신 실제 최초·최종 GPS 표본을 비교한다.
    startSeparationM: distance(a.actualStart, reverse ? b.actualEnd : b.actualStart),
    endSeparationM: distance(a.actualEnd, reverse ? b.actualStart : b.actualEnd) };
}
export function matchObservedRouteGeometryDescriptors(first: unknown, second: unknown): ObservedRouteIndexMatch {
  try {
    if (!isObservedRouteGeometryDescriptor(first) || !isObservedRouteGeometryDescriptor(second)) {
      return { state: 'unavailable', reason: 'invalid_descriptor' };
    }
    const forward = compare(first, second, false); const reverse = compare(first, second, true);
    const direction = Math.abs(forward.meanSeparationM - reverse.meanSeparationM) < 1e-9 ? 'undetermined'
      : reverse.meanSeparationM < forward.meanSeparationM ? 'reverse' : 'forward';
    const lengthRatio = Math.min(first.diagnostics.observedLengthM, second.diagnostics.observedLengthM)
      / Math.max(first.diagnostics.observedLengthM, second.diagnostics.observedLengthM);
    const best = direction === 'reverse' ? reverse : forward;
    const close = lengthRatio >= policy.minimumLengthRatio && best.startSeparationM <= policy.maximumEndpointSeparationM
      && best.endSeparationM <= policy.maximumEndpointSeparationM && best.meanSeparationM <= policy.maximumMeanSeparationM
      && best.p95SeparationM <= policy.maximumP95SeparationM;
    const coverage = first.source.coverage === 'complete' && second.source.coverage === 'complete' ? 'complete' : 'not_complete';
    const limitations: Extract<ObservedRouteIndexMatch, { state: 'available' }>['limitations'] = ['sample_based', 'no_loop_rotation'];
    if (first.diagnostics.gapCount > 0 || second.diagnostics.gapCount > 0) limitations.push('gaps');
    if (coverage !== 'complete') limitations.push('coverage_not_complete');
    return { state: 'available', direction, guidance: close ? 'observed_similar' : 'observed_different',
      forwardCandidate: close && direction === 'forward', coverage, lengthRatio, forward, reverse, limitations };
  } catch {
    return { state: 'unavailable', reason: 'invalid_descriptor' };
  }
}
