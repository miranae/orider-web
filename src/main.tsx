import { StrictMode } from "react";
import "./i18n";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OriderThemeProvider } from "./theme";
import { ensureAppCheckReady, initFirebase } from "./services/firebase";
import { loadRuntimeConfig } from "./services/runtimeConfig";
import { reportWebVitals } from "./services/webVitals";
import { installSlowFetchTracker } from "./services/slowRequests";
import { captureError } from "./services/sentry";
import { initAnalytics } from "./services/analytics";
import { isChunkLoadError } from "./utils/lazyWithRetry";
import App from "./App";

// 느린 fetch (>= 2s) 자동 기록 — Firebase / Firestore SDK 가 fetch 참조를 캡쳐하기
// 전에 install 해야 Firestore 슬로우 쿼리까지 wrap 됨. analytics 미초기화 시점 호출은
// track() 의 null-guard 가 흡수.
installSlowFetchTracker();

// modulepreload 실패(vite:preloadError) 자동 복구 — 새 배포 후 옛 탭이 사라진
// 청크 해시를 preload 하다 실패하는 케이스. lazyWithRetry 와 같은 가드를 공유한다.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (e) => {
    const ev = e as Event & { payload?: unknown };
    if (!isChunkLoadError(ev.payload)) return;
    const KEY = "orider:chunk-reload-ts";
    try {
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last < 10_000) return; // 무한 새로고침 가드
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch { /* sessionStorage 불가 — 그대로 새로고침 */ }
    e.preventDefault();
    window.location.reload();
  });
}
// 폰트 self-host (perf, 2026-06): 옛 index.html 의 jsdelivr/Google Fonts <link>(3rd-party,
// 렌더차단)를 same-origin 번들로 대체 → 모바일 Slow 4G 에서 교차출처 연결 비용 제거(FCP/LCP).
// Vite 가 woff2 를 same-origin hashed asset 으로 emit, dynamic-subset 은 unicode-range 별 on-demand.
// family 명("Pretendard Variable"/"JetBrains Mono")은 동일 → index.css 변수 변경 불필요.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
// mapbox-gl CSS 는 RouteMap.tsx 에서 import — 메인 entry 가 vendor-mapbox(1.6MB)
// 청크를 끌어오던 문제 해소. 지도 페이지 진입 시점에 함께 로드됨.
import "./index.css";
import "./theme/components/components.css";

// 전역 uncaught 에러·unhandled rejection 을 즉시 포착(#544).
// Sentry 본체는 초기 화면 로딩 대역에서 받지 않고, 실제 에러가 발생했을 때만
// captureError 가 lazy-load 후 큐를 flush 한다.
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    // 이미지/아이콘 같은 resource load error 는 e.error 가 없고 target 이 window 가 아니다.
    // 이런 404까지 Sentry lazy-load 를 깨우면 초기/후속 로딩 대역이 불필요하게 커진다.
    if (!e.error && e.target && e.target !== window) return;
    captureError(e.error ?? e.message, { tags: { source: "window.onerror" } });
  });
  window.addEventListener("unhandledrejection", (e) => {
    captureError(e.reason, { tags: { source: "unhandledrejection" } });
  });
}

function mountApp() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <ThemeProvider>
          <OriderThemeProvider>
            <AuthProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </AuthProvider>
          </OriderThemeProvider>
        </ThemeProvider>
      </BrowserRouter>
    </StrictMode>,
  );
  // Core Web Vitals 측정 시작 — 라이브러리가 페이지 lifecycle 보고 시점 자체 관리.
  // web_vitals 이벤트는 track() 큐를 거치므로 analytics 지연 init 전이어도 유실 없음.
  reportWebVitals();
  // Analytics는 getAnalytics() 시 Firebase Installations 왕복을 만들 수 있다. 단순 idle은
  // 100ms대에도 실행되어 Firestore/이미지 discovery와 경쟁하므로 LCP 이후로 고정 지연.
  const initAnalyticsAfterFirstPaint = () => {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      (window as Window).requestIdleCallback?.(() => { initAnalytics(); }, { timeout: 2000 });
    } else {
      initAnalytics();
    }
  };
  setTimeout(initAnalyticsAfterFirstPaint, 3500);
  // App Check(reCAPTCHA Enterprise)는 첫 공개 피드 로딩과 경쟁하지 않도록 짧게 뒤로
  // 미룬다. enforceAppCheck Callable 은 각 호출 직전에 ensureAppCheckReady() 를 await.
  if (typeof window !== "undefined") {
    setTimeout(() => {
      // 백그라운드 warmup 실패는 다음 Callable 호출에서 재시도된다.
      ensureAppCheckReady().catch(() => {});
    }, 2500);
  }
}

loadRuntimeConfig()
  .then(initFirebase)
  .then(mountApp)
  .catch((err) => {
    captureError(err, { tags: { source: "firebase-init" } });
    const root = document.getElementById("root")!;
    const container = document.createElement("div");
    container.style.cssText = "padding:2rem;text-align:center;color:#666";
    const h2 = document.createElement("h2");
    h2.textContent = "앱을 불러오지 못했습니다";
    const p = document.createElement("p");
    p.style.fontSize = "14px";
    p.textContent = err.message;
    const btn = document.createElement("button");
    btn.textContent = "새로고침";
    btn.style.cssText = "margin-top:1rem;padding:8px 16px;background:#f97316;color:white;border:none;border-radius:8px;cursor:pointer";
    btn.addEventListener("click", () => location.reload());
    container.append(h2, p, btn);
    root.replaceChildren(container);
  });
