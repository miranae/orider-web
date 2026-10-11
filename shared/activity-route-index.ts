import type { ObservedRouteDiagnostics, ObservedRouteDirectionComparison, RouteComparisonAttribution } from './activity-route-comparison';

export interface RouteGeometryPoint { lat: number; lon: number }
/** 압축한 관측 형태다. 코스 식별자·GPS 정확도·전체 경로 수집 증명이 아니다. */
export interface ObservedRouteGeometryDescriptor {
  policyVersion: 'observed-route-index-v1';
  scope: 'observed_gps';
  source: RouteComparisonAttribution;
  actualStart: RouteGeometryPoint;
  actualEnd: RouteGeometryPoint;
  samples: RouteGeometryPoint[];
  diagnostics: ObservedRouteDiagnostics;
  /** 시간·활동 ID를 제외한 좌표 직렬화. 동일 코스 식별에 사용하지 않는다. */
  fingerprintKind: 'canonical_geometry_json_v1';
  geometryFingerprint: string;
}
export type RouteGeometryDescriptorResult = {
  state: 'available'; descriptor: ObservedRouteGeometryDescriptor;
} | { state: 'unavailable'; reason: 'invalid_input' | 'input_limit' | 'insufficient_observed_length' | 'serialization_limit' };

/** 숫자는 ORider 관측 형태 정책이다. Strava의 코스 판정 규칙을 주장하지 않는다. */
export type ObservedRouteIndexMatch = {
  state: 'available';
  direction: 'forward' | 'reverse' | 'undetermined';
  guidance: 'observed_similar' | 'observed_different';
  /** 정방향으로 가까운 관측 형태만 후보가 된다. 전체 코스나 PR 판정이 아니다. */
  forwardCandidate: boolean;
  coverage: 'complete' | 'not_complete';
  lengthRatio: number;
  forward: ObservedRouteDirectionComparison;
  reverse: ObservedRouteDirectionComparison;
  limitations: ('sample_based' | 'no_loop_rotation' | 'gaps' | 'coverage_not_complete')[];
} | { state: 'unavailable'; reason: 'invalid_descriptor' };
