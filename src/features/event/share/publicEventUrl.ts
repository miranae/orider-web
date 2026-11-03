/** 공유·캘린더에는 호스트 승인이 필요한 임베드 주소나 일회용 로그인 코드를 넣지 않는다. */
export function publicEventUrl(currentUrl: string, eventId: string, results = false): string {
  const current = new URL(currentUrl);
  const lang = /^\/(ko|en)(?:\/|$)/.exec(current.pathname)?.[1] ?? "ko";
  return `${current.origin}/${lang}/event/${encodeURIComponent(eventId)}${results ? "/results" : ""}`;
}
