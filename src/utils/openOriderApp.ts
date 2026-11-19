import { ORIDER_APP_STORE_URL, ORIDER_PLAY_STORE_URL } from "../constants/appStoreLinks";

/** 앱이 열리지 않았다고 보고 스토어로 넘어가기까지 기다리는 시간. */
const STORE_FALLBACK_MS = 1600;

/**
 * O-Rider 앱을 연다. 앱이 없어 화면이 그대로 남아 있으면 기기에 맞는 스토어로 보낸다.
 * 웹 코치 분석의 '러닝 훈련 기준 설정'·'기록 전체 보기'처럼 앱에서 이어 할 일을 넘길 때 쓴다.
 */
export function openOriderApp(path: string, win: Window = window): void {
  const ua = win.navigator.userAgent;
  const store = /android/i.test(ua) ? ORIDER_PLAY_STORE_URL : ORIDER_APP_STORE_URL;
  let left = false;
  const onHide = () => { if (win.document.visibilityState === "hidden") left = true; };
  win.document.addEventListener("visibilitychange", onHide);
  win.setTimeout(() => {
    win.document.removeEventListener("visibilitychange", onHide);
    if (!left && win.document.visibilityState === "visible") win.location.href = store;
  }, STORE_FALLBACK_MS);
  win.location.href = `orider://${path.replace(/^\/+/, "")}`;
}
