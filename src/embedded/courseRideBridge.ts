/**
 * 앱 코스 상세 임베드에서 찾은 코스를 바로 주행·저장하게 하는 브리지 계약(앱 #3959).
 *
 * 협상: 웹은 `bootstrap.ready.capabilities` 에 이 문자열을 넣어 "주행·저장 경로를 보낼 수 있다"고
 * 알리고, 호스트는 두 경로를 처리할 때만 `host.sessionAccepted.capabilities` 에 같은 문자열을 넣는다.
 * 호스트가 알리지 않으면(구버전 앱) 웹은 종전 「앱으로 보내기」를 그대로 보인다.
 *
 * 메시지는 기존 `navigation.openNative` 봉투(`{ path }`)를 그대로 쓴다 — 경로에 언어 접두가 없다.
 */
export const COURSE_RIDE_CAPABILITY = "host.courseRide.v1" as const;

/** 이 코스로 주행을 시작하는 앱 경로. */
export function courseRidePath(courseId: string): string {
  return `/course/${encodeURIComponent(courseId)}/ride`;
}

/** 이 코스를 내 코스에 저장하는 앱 경로. */
export function courseImportPath(courseId: string): string {
  return `/course/${encodeURIComponent(courseId)}/import`;
}
