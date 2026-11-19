/** 앱이 열리지 않았다고 보고 웹 목적지로 넘어가기까지 기다리는 시간. */
const WEB_FALLBACK_MS = 1600;

/** 앱을 열 수 있는 휴대폰 브라우저인가. 데스크톱은 앱 대신 웹 페이지로 간다. */
export function canOpenOriderApp(win: Window = window): boolean {
  return /iphone|ipad|ipod|android/i.test(win.navigator.userAgent);
}

/**
 * O-Rider 앱을 연다. 앱이 없어 화면이 그대로 남아 있으면 원래 웹 목적지(`fallbackUrl`)로 간다.
 * 웹 코치 분석의 '러닝 훈련 기준 설정'·'기록 전체 보기'처럼 앱에서 이어 할 일을 넘길 때 쓴다.
 */
export function openOriderApp(path: string, fallbackUrl: string, win: Window = window): void {
  let left = false;
  const onHide = () => { if (win.document.visibilityState === "hidden") left = true; };
  win.document.addEventListener("visibilitychange", onHide);
  win.setTimeout(() => {
    win.document.removeEventListener("visibilitychange", onHide);
    if (!left && win.document.visibilityState === "visible") win.location.href = fallbackUrl;
  }, WEB_FALLBACK_MS);
  win.location.href = `orider://${path.replace(/^\/+/, "")}`;
}
