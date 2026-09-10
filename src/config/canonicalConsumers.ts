/**
 * 정본 소비 전환 스위치 — 면(surface) 별로 따로 (#887, 에픽 app#2237 의 stage 4).
 *
 * 날씨·코스·정비·마일스톤은 서버 배포와 백필 시점이 서로 다르다. 하나의 스위치로 묶으면 한 면의
 * 백필이 늦어질 때 나머지도 못 켠다 — 그래서 **면마다 독립적으로** 켜고 끈다.
 *
 * `milestones` 는 특히 늦다: 서버 누적 원장(`run_lifetime`)이 러닝 전용이라 자전거 사용자의
 * 누적 거리 배지를 아직 판정하지 못한다. 켜기 전까지 클라 판정을 그대로 쓴다.
 *
 * 기본은 모두 꺼짐이다. 꺼져 있으면 화면은 오늘과 똑같이 그려진다(회귀 없음). 서버 문서가
 * 실제로 채워진 뒤에 켜는 것이 순서다.
 *
 * 값은 `runtime-config.json`(운영) 또는 `VITE_CANONICAL_*` 빌드 환경변수(로컬·테스트)에서 온다 —
 * 이 저장소의 다른 플래그와 같은 경로다.
 */
import { getRuntimeConfig } from "../services/runtimeConfig";

export const CANONICAL_SURFACES = ["weather", "course", "maintenance", "milestones"] as const;
export type CanonicalSurface = (typeof CANONICAL_SURFACES)[number];

export type CanonicalConsumerFlags = Record<CanonicalSurface, boolean>;

/** 기본값. 명시적으로 true 가 들어오기 전까지 네 면 모두 꺼져 있다. */
export const CANONICAL_CONSUMER_DEFAULTS: CanonicalConsumerFlags = {
  weather: false,
  course: false,
  maintenance: false,
  milestones: false,
};

export function canonicalConsumerFlags(): CanonicalConsumerFlags {
  const config = getRuntimeConfig();
  return {
    weather: config.canonicalWeatherEnabled === true,
    course: config.canonicalCourseEnabled === true,
    maintenance: config.canonicalMaintenanceEnabled === true,
    milestones: config.canonicalMilestonesEnabled === true,
  };
}

export function canonicalConsumerEnabled(surface: CanonicalSurface): boolean {
  return canonicalConsumerFlags()[surface];
}
