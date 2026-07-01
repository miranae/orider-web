import { StrictMode } from "react";
import "./i18n";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { OriderThemeProvider } from "./theme";
import { initFirebase } from "./services/firebase";
import { loadRuntimeConfig } from "./services/runtimeConfig";
import { reportWebVitals } from "./services/webVitals";
import { installSlowFetchTracker } from "./services/slowRequests";
import { captureError, loadSentry } from "./services/sentry";
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

// Sentry 모듈을 dynamic import + init — vendor-sentry(85KB gz) 가 entry chunk
// 의존성에서 제외, modulepreload 도 안 됨. init 전 발생 에러는 captureError 가
// 큐에 저장 → load 완료 시 자동 flush.
// 전역 uncaught 에러·unhandled rejection 을 즉시 포착(#544) — Sentry init(≤2s 지연) 전
// 부트스트랩 구간(가장 크래시 잦은)에 발생해도 captureError 큐에 쌓여 load 시 flush.
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
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
  // runtime-config.json 로드 이후 Sentry 를 초기화해야 stage/prod 별 DSN 이 정확히 반영된다.
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    (window as Window).requestIdleCallback?.(() => { void loadSentry(); }, { timeout: 2000 });
  } else {
    setTimeout(() => { void loadSentry(); }, 0);
  }
  // Analytics(gtag.js ~421kB) 지연 초기화 — initFirebase 완료 후 idle 시점에 켜서 콜드
  // 첫 로드 대역을 LCP/폰트 등 임계 리소스에 양보. init 전 이벤트는 큐에서 flush.
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    (window as Window).requestIdleCallback?.(() => { initAnalytics(); }, { timeout: 3000 });
  } else {
    setTimeout(() => { initAnalytics(); }, 0);
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
