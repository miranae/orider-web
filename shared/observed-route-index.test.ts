import { describe, expect, it } from 'vitest';
import type { ActivityRouteEvidence } from './activity-route-comparison';
import type { ObservedRouteGeometryDescriptor } from './activity-route-index';
import { compareObservedRoutes, prepareObservedRouteGeometry } from './observed-route-comparison';
import { buildObservedRouteGeometryDescriptor as build, isObservedRouteGeometryDescriptor as valid,
  matchObservedRouteGeometryDescriptors as match, OBSERVED_ROUTE_INDEX_MAX_BYTES } from './observed-route-index';
function route(count = 100, seconds = 1): ActivityRouteEvidence {
  return { activityId: 'activity-one', routeInputRevision: 'a'.repeat(64), routeFingerprint: 'b'.repeat(64),
    sourceLayer: 'raw_parts', sourceSchemaVersion: 'paired-gps-v1', accuracy: 'unknown', timingBasis: 'elapsed',
    timeOrigin: 'activity_start', originEpochMs: 0, coverage: 'unknown',
    points: Array.from({ length: count }, (_, i) => ({ lat: 37, lon: 127 + i * .0001, elapsedSec: i * seconds })) };
}
function descriptor(e: ActivityRouteEvidence = route()): ObservedRouteGeometryDescriptor {
  const result = build(e); expect(result.state).toBe('available');
  if (result.state !== 'available') throw Error(result.reason);
  return result.descriptor;
}
describe('관측 경로 descriptor: 코스 ID가 아닌 순수 준비 결과', () => {
  it('같은 좌표·다른 속도에서 시간 제외 geometry만 동일하고 실제 시계 진단은 보존한다', () => {
    const a = descriptor(); const b = descriptor(route(100, 2));
    expect(a.geometryFingerprint).toBe(b.geometryFingerprint);
    expect(b.diagnostics.observedElapsedSec).toBe(a.diagnostics.observedElapsedSec * 2);
    expect(match(a, b)).toMatchObject({ direction: 'forward', forwardCandidate: true, guidance: 'observed_similar', coverage: 'not_complete' });
    expect(match(a, b)).toHaveProperty('limitations', ['sample_based', 'no_loop_rotation', 'coverage_not_complete']);
  });
  it('정책상 같은 좌표라도 30초보다 큰 간격을 동일화하지 않는다', () => {
    expect(build(route(100, 31))).toEqual({ state: 'unavailable', reason: 'insufficient_observed_length' });
    const gap = route(); gap.points = gap.points.map((p, i) => ({ ...p, elapsedSec: p.elapsedSec + (i > 50 ? 40 : 0) }));
    expect(descriptor(gap).diagnostics.gapCount).toBe(1);
    expect(descriptor(gap).geometryFingerprint).not.toBe(descriptor().geometryFingerprint);
  });
  it('30초 경계는 포함하고 500m를 넘는 공간 공백은 제외한다', () => {
    expect(descriptor(route(100, 30)).diagnostics.gapCount).toBe(0);
    const jump = route(); jump.points = jump.points.map((p, i) => ({ ...p, lon: p.lon + (i > 50 ? .01 : 0) }));
    expect(descriptor(jump).diagnostics.gapCount).toBe(1);
  });
  it('길이 비율 0.90보다 작은 경로를 정방향 후보로 만들지 않는다', () => {
    expect(match(descriptor(), descriptor(route(50)))).toMatchObject({ forwardCandidate: false, guidance: 'observed_different' });
  });
  it('JSON 속성 순서는 시간 제외 fingerprint에 영향을 주지 않는다', () => {
    const d = descriptor(); const reordered = { ...d, samples: d.samples.map(p => ({ lon: p.lon, lat: p.lat })) };
    expect(valid(reordered)).toBe(true);
  });
  it('UTF-8 다중 바이트 출처와 100000 표본도 전체 64KiB 안에 있다', () => {
    const e = route(100000); e.sourceSchemaVersion = '한'.repeat(256); e.activityId = '글'.repeat(256);
    e.points = e.points.map((p, i) => ({ ...p, lat: 37.12345678901234, lon: 127.12345678901234 + i * .0000001 }));
    const d = descriptor(e);
    expect(new TextEncoder().encode(JSON.stringify(d)).length).toBeLessThan(OBSERVED_ROUTE_INDEX_MAX_BYTES);
  });
  it('throwing 원본 getter도 builder에서 fail closed한다', () => {
    const e = route(); Object.defineProperty(e, 'points', { get() { throw Error('malicious'); } });
    expect(build(e)).toEqual({ state: 'unavailable', reason: 'invalid_input' });
  });
  it('역방향 형태는 가까워도 정방향 그룹 후보가 아니다', () => {
    const reverse = route(); reverse.points = [...reverse.points].reverse().map((p, i) => ({ ...p, elapsedSec: i }));
    expect(match(descriptor(), descriptor(reverse))).toMatchObject({ direction: 'reverse', guidance: 'observed_similar', forwardCandidate: false });
  });
  it('정지 표본은 실제 시간에 포함하지만 geometry를 바꾸지 않는다', () => {
    const stopped = route(); stopped.points = [stopped.points[0]!, ...stopped.points.map(p => ({ ...p, elapsedSec: p.elapsedSec + 1 }))];
    expect(descriptor(stopped).geometryFingerprint).toBe(descriptor().geometryFingerprint);
    expect(descriptor(stopped).diagnostics.observedElapsedSec).toBe(100);
  });
  it('첫 edge가 공백이면 trimmed sample 대신 실제 처음 GPS 좌표가 끝점 조건을 거부한다', () => {
    const gap = route(); gap.points = [{ lat: 37.02, lon: 127, elapsedSec: 0 }, ...gap.points.map(p => ({ ...p, elapsedSec: p.elapsedSec + 40 }))];
    const a = descriptor(); const b = descriptor(gap);
    expect(b.samples).toEqual(a.samples); expect(b.actualStart).not.toEqual(a.actualStart);
    expect(match(a, b)).toMatchObject({ direction: 'forward', forwardCandidate: false, guidance: 'observed_different' });
  });
  it('마지막 공백도 실제 최종 GPS 좌표를 보존한다', () => {
    const gap = route(); gap.points = [...gap.points, { lat: 37.02, lon: 127.0099, elapsedSec: 150 }];
    expect(match(descriptor(), descriptor(gap))).toMatchObject({ forwardCandidate: false, guidance: 'observed_different' });
  });
  it('짧은 우회·평행 도로를 동일 코스로 주장하지 않고 표본 한계를 유지한다', () => {
    const parallel = route(); parallel.points = parallel.points.map(p => ({ ...p, lat: p.lat + .0001 }));
    const detour = route(); detour.points = detour.points.map((p, i) => ({ ...p, lat: p.lat + (i === 50 ? .0001 : 0) }));
    for (const value of [parallel, detour]) {
      const result = match(descriptor(), descriptor(value));
      expect(result).toMatchObject({ guidance: 'observed_similar' });
      expect(result).toHaveProperty('limitations'); expect(result).not.toHaveProperty('courseId');
    }
    const distant = route(); distant.points = distant.points.map(p => ({ ...p, lat: p.lat + .002 }));
    expect(match(descriptor(), descriptor(distant))).toMatchObject({ guidance: 'observed_different', forwardCandidate: false });
  });
  it('순환 시작점은 회전 정렬하지 않으며 방향 동률은 그룹하지 않는다', () => {
    const loop = route(121); loop.points = loop.points.map((p, i) => ({ ...p, lat: 37 + .003 * Math.sin(i * Math.PI / 60), lon: 127 + .003 * Math.cos(i * Math.PI / 60) }));
    const shifted = { ...loop, points: loop.points.map((_, i) => ({ ...loop.points[(i + 30) % 120]!, elapsedSec: i })) };
    expect(match(descriptor(loop), descriptor(shifted))).toMatchObject({ forwardCandidate: false, guidance: 'observed_different' });
    const outBack = route(); outBack.points = outBack.points.map((p, i) => ({ ...p, lon: 127 + Math.min(i, 99 - i) * .0001 }));
    expect(match(descriptor(outBack), descriptor(outBack))).toMatchObject({ direction: 'undetermined', forwardCandidate: false });
  });
  it.each(['dateline', 'pole'])('%s에서 구면 준비를 그대로 공유한다', kind => {
    const e = route(); e.points = e.points.map((p, i) => ({ ...p, lat: kind === 'pole' ? 89.99 : 0,
      lon: kind === 'pole' ? i : ((179.99 + i * .0003 + 180) % 360) - 180 }));
    const d = descriptor(e); expect(valid(d)).toBe(true);
    expect(match(d, d)).toMatchObject({ direction: 'forward', forwardCandidate: true });
  });
  it('기존 manual kernel의 준비 통계와 sample 비교 수치를 그대로 보존한다', () => {
    const a = route(); const b = route(100, 2);
    const legacy = compareObservedRoutes(a, b); const result = match(descriptor(a), descriptor(b));
    expect(legacy.state).toBe('available'); expect(result.state).toBe('available');
    if (legacy.state !== 'available' || result.state !== 'available') throw Error('unexpected');
    expect(result.forward).toEqual(legacy.forward);
    expect(result.reverse.meanSeparationM).toBe(legacy.reverse!.meanSeparationM);
    expect(result.reverse.p95SeparationM).toBe(legacy.reverse!.p95SeparationM);
    // 기존 edge 보간 endpoint의 부동소수점 반올림과 실제 endpoint는 미세하게 다르다.
    expect(result.reverse.startSeparationM).toBeCloseTo(legacy.reverse!.startSeparationM, 9);
    expect(result.reverse.endSeparationM).toBeCloseTo(legacy.reverse!.endSeparationM, 9);
    expect(descriptor(a).diagnostics).toEqual(legacy.diagnostics[0]);
    const prepared = prepareObservedRouteGeometry(a);
    expect(Object.isFrozen(prepared)).toBe(true);
    if (prepared.state === 'available') {
      expect(Object.isFrozen(prepared.samples)).toBe(true); expect(Object.isFrozen(prepared.samples[0])).toBe(true);
    }
  });
  it('100000 원본 표본을 256 geometry 표본/64KiB 이하로 제한하며 초과는 fail closed', () => {
    const e = route(100000); e.points = e.points.map((p, i) => ({ ...p, lon: 127 + i * .0000001 }));
    const d = descriptor(e); expect(d.samples).toHaveLength(256);
    expect(d.diagnostics.inputPointCount).toBe(100000);
    expect(new TextEncoder().encode(JSON.stringify(d)).length).toBeLessThanOrEqual(OBSERVED_ROUTE_INDEX_MAX_BYTES);
    expect(build(route(100001))).toEqual({ state: 'unavailable', reason: 'input_limit' });
  });
  it.each([NaN, Infinity, -Infinity])('비유한 GPS %s 거부', bad => {
    const e = route(); e.points = e.points.map((p, i) => i === 5 ? { ...p, lat: bad } : p);
    expect(build(e)).toEqual({ state: 'unavailable', reason: 'invalid_input' });
  });
  it('sparse·역행 시계·짧은 길이 거부', () => {
    const sparse = route(); const points = [...sparse.points]; delete points[10]; sparse.points = points;
    expect(build(sparse)).toEqual({ state: 'unavailable', reason: 'invalid_input' });
    const reversed = route(); reversed.points = reversed.points.map(p => ({ ...p, elapsedSec: 100 - p.elapsedSec }));
    expect(build(reversed)).toEqual({ state: 'unavailable', reason: 'invalid_input' });
    expect(build(route(2))).toEqual({ state: 'unavailable', reason: 'insufficient_observed_length' });
  });
  it('coverage complete도 GPS 정확도·코스·PR 확정을 만들지 않는다', () => {
    const e = { ...route(), coverage: 'complete' as const };
    expect(match(descriptor(e), descriptor(e))).toMatchObject({ coverage: 'complete', guidance: 'observed_similar' });
    expect(descriptor(e).source.accuracy).toBe('unknown');
  });
  it('검증을 통과한 뒤 비교에서 던지는 stateful getter도 fail closed한다', () => {
    const d = descriptor(); const samples = d.samples; let reads = 0;
    Object.defineProperty(d, 'samples', { enumerable: true, configurable: true, get() { reads++; return samples; } });
    expect(valid(d)).toBe(true); const validationReads = reads; reads = 0;
    Object.defineProperty(d, 'samples', { enumerable: true, configurable: true,
      get() { if (++reads > validationReads) throw Error('changed after validation'); return samples; } });
    expect(match(d, descriptor())).toEqual({ state: 'unavailable', reason: 'invalid_descriptor' });
    expect(reads).toBe(validationReads + 1);
  });
  it.each(['extra', 'count', 'geometry', 'sparse', 'source', 'diagnostics', 'version', 'overflow', 'fingerprint', 'long_source', 'prototype'])('악성 wire %s 거부', kind => {
    const d = structuredClone(descriptor());
    switch (kind) {
      case 'extra': Object.assign(d, { unsafe: 'x' }); break;
      case 'count': d.samples.push(d.samples[0]!); break;
      case 'geometry': d.samples[1]!.lat = 91; break;
      case 'sparse': delete d.samples[1]; break;
      case 'source': d.source.originEpochMs = Infinity; break;
      case 'diagnostics': d.diagnostics.gapCount = .5; break;
      case 'version': Object.assign(d, { policyVersion: 'unknown' }); break;
      case 'overflow': d.diagnostics.observedLengthM = Number.MAX_VALUE; break;
      case 'fingerprint': d.geometryFingerprint += 'x'; break;
      case 'long_source': d.source.sourceSchemaVersion = '한'.repeat(100000); break;
      case 'prototype': Object.defineProperty(d, 'samples', { get() { throw Error('malicious getter'); } }); break;
    }
    expect(valid(d)).toBe(false); expect(match(descriptor(), d)).toEqual({ state: 'unavailable', reason: 'invalid_descriptor' });
  });
});
