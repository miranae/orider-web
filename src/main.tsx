import { StrictMode } from "react";
import "./i18n";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { auth, ensureAppCheckReady, initFirebase } from "./services/firebase";
import { consumeAppHandoffCode, stashHandoffCode } from "./services/appHandoff";
import { applyImpersonationTokenFromUrl, stashImpersonationToken } from "./services/impersonation";
import { loadRuntimeConfig } from "./services/runtimeConfig";
import { reportWebVitals } from "./services/webVitals";
import { installSlowFetchTracker } from "./services/slowRequests";
import { captureError } from "./services/sentry";
import { initAnalytics } from "./services/analytics";
import { isChunkLoadError } from "./utils/lazyWithRetry";
import { reloadWhenOnline, shouldReloadChunkOnce } from "./utils/chunkReload";
import {
  executeFirestoreSessionRecovery,
  findFirestoreFatalError,
  firestoreRecoveryLogContext,
  prepareFirestoreSessionRecovery,
} from "./utils/firestoreSessionRecovery";
import { isEmbeddedRoutePath } from "./App";
import AppRoot from "./AppRoot";

// 느린 fetch (>= 2s) 자동 기록 — Firebase / Firestore SDK 가 fetch 참조를 캡쳐하기
// 전에 install 해야 Firestore 슬로우 쿼리까지 wrap 됨. analytics 미초기화 시점 호출은
// track() 의 null-guard 가 흡수.
// 앱→웹 로그인 인계 코드는 **모듈 본문 첫 문장**에서 URL 로부터 제거해 보관 —
// 에러 리스너/Sentry/후속 리소스 로드가 코드 포함 URL 을 관측하는 창을 최소화(리뷰 MINOR).
stashHandoffCode();
// 위임 로그인 토큰(fragment)도 같은 이유로 모듈 본문에서 즉시 제거해 보관한다 —
// TTL 1시간짜리 실제 자격증명이라 Sentry Replay 초기 녹화에 남으면 그대로 유출된다.
stashImpersonationToken();

installSlowFetchTracker();

// modulepreload 실패(vite:preloadError) 자동 복구 — 새 배포 후 옛 탭이 사라진
// 청크 해시를 preload 하다 실패하는 케이스. lazyWithRetry 와 같은 가드를 공유한다.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (e) => {
    const ev = e as Event & { payload?: unknown };
    if (!isChunkLoadError(ev.payload)) return;
    e.preventDefault();
    reloadWhenOnline();
    if (shouldReloadChunkOnce()) {
      window.location.reload();
    }
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
// Manifest-generated FOUC defaults are loaded after legacy layout CSS so the
// same values used by OriderThemeProvider win before React mounts.
import "./theme/generated.css";
import "./theme/components/components.css";

// 전역 uncaught 에러·unhandled rejection 을 즉시 포착(#544).
// Sentry 본체는 초기 화면 로딩 대역에서 받지 않고, 실제 에러가 발생했을 때만
// captureError 가 lazy-load 후 큐를 flush 한다.
if (typeof window !== "undefined") {
  const captureGlobalError = (
    error: unknown,
    source: "window.onerror" | "unhandledrejection",
    recoveryError: unknown = error,
  ) => {
    const recovery = prepareFirestoreSessionRecovery(recoveryError);
    const selectedRecoverySignature = recovery.kind && recoveryError !== error
      ? {
          firestoreRecoverySelectedSignature: recovery.kind === "internal-get-type-error"
            ? "TypeError: *.tc.get-not-callable-or-iterable"
            : recovery.kind === "b815"
              ? "Firestore internal assertion b815"
              : "Firestore AsyncQueue already failed",
        }
      : {};
    captureError(error, {
      tags: { source },
      extra: {
        pathname: window.location.pathname,
        signedIn: Boolean(auth?.currentUser),
        ...firestoreRecoveryLogContext(recovery),
        ...selectedRecoverySignature,
      },
    });
    // Sentry 큐에 진단 정보를 넣은 다음 현재 stack을 벗어나 hard reload한다.
    // prepare 단계가 세션 마커와 동시 발생 guard를 먼저 설정하므로 error와
    // unhandledrejection이 연달아 와도 reload는 세션당 한 번만 실행된다.
    executeFirestoreSessionRecovery(recovery);
  };

  window.addEventListener("error", (e) => {
    // 이미지/아이콘 같은 resource load error 는 e.error 가 없고 target 이 window 가 아니다.
    // 이런 404까지 Sentry lazy-load 를 깨우면 초기/후속 로딩 대역이 불필요하게 커진다.
    if (!e.error && e.target && e.target !== window) return;
    // 일부 브라우저/확장 환경은 error 객체와 message를 다르게 래핑한다. 한쪽에
    // Firestore fatal signature가 남아 있으면 그 후보를 진단·복구 대상으로 삼는다.
    const error = e.error ?? e.message;
    const recoveryError = findFirestoreFatalError(e.error, e.message) ?? error;
    captureGlobalError(error, "window.onerror", recoveryError);
  });
  window.addEventListener("unhandledrejection", (e) => {
    captureGlobalError(e.reason, "unhandledrejection");
  });
}

function mountApp(embedded: boolean) {
  const routedApp = <BrowserRouter><AppRoot /></BrowserRouter>;
  createRoot(document.getElementById("root")!).render(
    embedded ? routedApp : <StrictMode>{routedApp}</StrictMode>,
  );
  if (embedded) return;
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

const isEmbeddedEntry = typeof window !== "undefined"
  && isEmbeddedRoutePath(window.location.pathname);

// 임베드 진입은 일반 Firebase 를 초기화하지 않는다. 인계 코드 소비도 여기서 하지 않고
// EmbeddedBootstrapRoot 가 **임베드 전용 named app** 의 Auth 로 수행한다 — 여기서 소비하면
// 일반 앱 세션에 로그인돼 임베드는 여전히 비로그인 상태가 된다(계정 격리).
const initializeEntry = isEmbeddedEntry
  ? loadRuntimeConfig().then(async () => {
      const { initEmbeddedFirebase } = await import("./embedded/embeddedFirebase");
      await initEmbeddedFirebase();
    })
  : loadRuntimeConfig()
      .then(initFirebase)
  // 앱 → 웹 로그인 인계: #handoff= 일회용 코드(옛 ?handoff=도 수신)가 있으면
  // AuthProvider 마운트 전에 custom token 로그인까지 끝낸다(코드 없으면 즉시 통과).
      .then(() => consumeAppHandoffCode())
  // 관리자 위임 로그인: #impersonateToken= fragment 가 있으면 마운트 전에 그 사용자로
  // 로그인한다(토큰 없으면 즉시 통과). admin.orider.co.kr 의 지원 접근 페이지와 CLI 가
  // 이 형식으로 링크를 만든다 — 쿼리스트링 형식은 유출 때문에 거부한다.
      .then(() => applyImpersonationTokenFromUrl(auth));

initializeEntry
  .then(() => mountApp(isEmbeddedEntry))
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
    btn.style.cssText = "margin-top:1rem;padding:8px 16px;background:#008986;color:white;border:none;border-radius:8px;cursor:pointer";
    btn.addEventListener("click", () => location.reload());
    container.append(h2, p, btn);
    root.replaceChildren(container);
  });
