/**
 * 실내 활동 판정 — 화면 전체의 단일 기준.
 *
 * - `trainer === true`: Strava 의 trainer 필드(스마트 트레이너·트레드밀). Strava 동기화가 저장하고,
 *   서버 코치·분석도 같은 필드로 실내를 판정한다. Wear OS 앱도 트레드밀 러닝에 이 값을 보낸다.
 * - `type` 에 "virtual" 포함: Strava sport_type 의 VirtualRide·VirtualRun 등 — trainer 가 빠진
 *   옛 문서도 실내로 본다.
 *
 * TrailRun 등 나머지 종목은 trainer 가 없으면 실외다.
 */
export type IndoorActivityInput = {
  type?: string | null;
  trainer?: boolean | null;
};

/** Strava sport_type 이 가상(Virtual*) 종목인지 — 종목 라벨 자체가 이미 "가상"을 말한다. */
export function isVirtualActivityType(type?: string | null): boolean {
  return (type ?? "").toLowerCase().includes("virtual");
}

export function isIndoorActivity(activity: IndoorActivityInput): boolean {
  return activity.trainer === true || isVirtualActivityType(activity.type);
}
