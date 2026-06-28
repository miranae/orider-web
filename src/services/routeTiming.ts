/**
 * SPA 라우트 로드 타이밍 RUM 계측.
 *
 * 사용자가 페이지 전환할 때 lazy 청크 로드 + 렌더가 얼마나 걸리는지를 측정.
 * 기존 page_view 는 시작 시점만 찍고 지속시간이 없어 "이 페이지 들어가면 느림"을
 * 분석하기 어려웠음 — route_load 이벤트가 duration_ms 를 포함해 이를 보완한다.
 *
 * 이벤트 필드:
 *  - route        : 라우트 식별자 (App.tsx 좌변 변수명, e.g. "ActivityPage")
 *  - page_path    : 실제 pathname (e.g. "/ko/activity/123")
 *  - duration_ms  : beginNavigation → 첫 페인트 후까지 elapsed ms
 *  - chunk_load_ms: lazy 청크 네트워크 로드 시간. 캐시 히트 시 0
 *  - first_visit  : 세션 중 이 라우트의 첫 방문 여부 (콜드 청크 vs 재방문)
 *  - nav_type     : "initial"(첫 로드) | "navigation"(SPA 라우팅)
 *  - 네트워크/디바이스 컨텍스트 (effective_type, rtt_ms, downlink_mbps, device_memory_gb)
 *
 * 설계 원칙:
 *  - lazyTimed() 의 factory/recordChunkLoad 는 청크당 1회 (React lazy 캐시)
 *  - RouteProbe 는 매 마운트마다 reportRouteReady() → duration_ms 는 라우트별 매 방문 측정
 *  - 더블 rAF 로 post-paint 시점 기록 (레이아웃+페인트 완료 후)
 *  - 상위 네비게이션에 의해 supersede 된 경우 무효화 (idAtMount 체크)
 */
import React from "react";
import { track } from "./analytics";
import { readNetwork, readDeviceMemory, reportSlowPage } from "./slowRequests";
import { isChunkLoadError } from "../utils/lazyWithRetry";

const SLOW_ROUTE_MS = 3000;

// ── 모듈 상태 (클로저) ──────────────────────────────────────────────────────
let navId = 0;
let navStart = 0;
let navPath = "";
let navType: "initial" | "navigation" = "initial";
let pending = false;
let lastChunkMs: number | null = null;
let lastNavKey: string | null = null;
const seenRoutes = new Set<string>();

// ── 내부 API ─────────────────────────────────────────────────────────────────

/**
 * 청크 로드 시간 기록 — lazyTimed() 내부에서 factory 완료 시 호출.
 * React lazy 가 factory 결과를 캐시하므로 청크당 1회만 호출됨.
 */
export function recordChunkLoad(route: string, ms: number): void {
  void route; // 향후 멀티 탭 추적 확장 여지
  lastChunkMs = Math.round(ms);
}

// ── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 라우트 전환 시작 — App.tsx 의 **렌더 단계**에서 `location.key` 와 함께 호출한다.
 *
 * 렌더 단계(top-down)에서 호출해야 하는 이유: 캐시된 청크 재방문 시 RouteProbe 는
 * suspend 없이 같은 커밋에서 마운트되고, 그 layout effect(reportRouteReady)가 부모 App 의
 * passive effect 보다 먼저 실행된다. beginNavigation 을 effect 에 두면 pending 이 늦게 세팅돼
 * 재방문(nav_type:"navigation"/first_visit:false) route_load 가 체계적으로 드롭됐다(리뷰 #319).
 * 렌더 단계에서 세팅하면 자식이 렌더/마운트되기 전에 pending=true 가 보장된다.
 *
 * `navKey`(react-router location.key) 로 멱등 처리 — 콜드 청크 suspend 재렌더나 StrictMode
 * 이중 렌더로 같은 네비게이션에 여러 번 호출돼도 1회만 적용(navStart 가 첫 렌더 시점 유지).
 *
 * navId===1 (최초 로드) 는 navigation timing 기준 0 에서 시작 — durationMs 가
 * "페이지 진입 시점부터 첫 라우트 렌더까지" 를 의미.
 */
export function beginNavigation(path: string, navKey?: string): void {
  if (navKey != null && navKey === lastNavKey) return;
  lastNavKey = navKey ?? null;
  navId++;
  navPath = path;
  navType = navId === 1 ? "initial" : "navigation";
  navStart = navId === 1 ? 0 : performance.now();
  pending = true;
  lastChunkMs = null;
}

/**
 * 라우트 컴포넌트 마운트 후 post-paint 에서 route_load 이벤트 발사.
 * RouteProbe (lazyTimed 내부) 가 useLayoutEffect 에서 호출.
 */
export function reportRouteReady(route: string): void {
  if (!pending) return;
  const idAtMount = navId;

  // 더블 rAF — 레이아웃 + 첫 페인트 완료 보장
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // 이 rAF 가 실행되기 전에 다른 네비게이션이 시작됐으면 무효화
      if (!pending || navId !== idAtMount) return;
      pending = false;

      const durationMs = Math.round(performance.now() - navStart);
      const firstVisit = !seenRoutes.has(route);
      seenRoutes.add(route);

      const net = readNetwork();

      try {
        track("route_load", {
          route,
          page_path: navPath,
          duration_ms: durationMs,
          chunk_load_ms: lastChunkMs ?? 0,
          first_visit: firstVisit,
          nav_type: navType,
          device_memory_gb: readDeviceMemory(),
          ...net,
        });
        // 느린 라우트 — 재현 어려운 슬로우 케이스 사후분석용 slow_page 파이프 재사용.
        // track 과 같은 try 안에 둬서 rAF 콜백에서 uncaught 가 새지 않도록 한다.
        if (durationMs >= SLOW_ROUTE_MS) {
          reportSlowPage("route_load", durationMs, navPath);
        }
      } catch {
        // RUM tracking must never break navigation.
      }
    });
  });
}

/**
 * lazy() 대체 — 청크 로드 시간 계측 + RouteProbe 래퍼를 삽입한 lazyExoticComponent 반환.
 *
 * factory / recordChunkLoad 는 React lazy 캐시에 의해 청크당 1회만 실행.
 * RouteProbe 는 매 마운트마다 reportRouteReady() 를 호출해 duration_ms 를 갱신.
 * lazyWithRetry 의 청크 에러 자동 복구 로직을 내장 — App.tsx 에서 lazyTimed 만 쓰면 됨.
 */
const RELOAD_KEY = "orider:chunk-reload-ts";
const RELOAD_WINDOW_MS = 10_000;

function shouldReloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    return true;
  } catch {
    return true;
  }
}

export function lazyTimed(
  route: string,
  factory: () => Promise<{ default: React.ComponentType<any> }>,
): React.LazyExoticComponent<React.ComponentType<any>> {
  return React.lazy(async () => {
    const t0 = performance.now();
    let mod: { default: React.ComponentType<any> };
    try {
      mod = await factory();
    } catch (err) {
      recordChunkLoad(route, performance.now() - t0);
      // 청크 로드 에러 → lazyWithRetry 와 동일한 1회 새로고침 복구
      if (isChunkLoadError(err) && shouldReloadOnce()) {
        window.location.reload();
        return new Promise<{ default: React.ComponentType<any> }>(() => {});
      }
      throw err;
    }
    recordChunkLoad(route, performance.now() - t0);

    const Comp = mod!.default;

    const Probe = (props: any) => {
      // useLayoutEffect: DOM 커밋 직후, 브라우저 페인트 직전에 실행
      // → 더블 rAF 와 결합해 post-paint 에서 track 발사
      React.useLayoutEffect(() => {
        reportRouteReady(route);
      }, []);
      return React.createElement(Comp, props);
    };
    Probe.displayName = `RouteProbe(${route})`;

    return { default: Probe };
  });
}
