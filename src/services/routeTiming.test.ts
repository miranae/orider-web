/**
 * routeTiming.ts 단위 테스트
 *
 * 검증 항목:
 *  - beginNavigation → reportRouteReady 더블rAF 후 track("route_load") 1회 발사
 *  - duration_ms, nav_type: "initial"(첫 호출) / "navigation"(이후)
 *  - first_visit: 첫 방문 true, 재방문 false
 *  - recordChunkLoad 호출 시 chunk_load_ms 반영, 미호출 시 0
 *  - pending=false 상태에서 reportRouteReady → no-op
 *  - 상위 네비게이션이 supersede 한 경우(navId 변경) rAF 콜백 무효화
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// analytics.track mock — routeTiming.ts 가 import 하기 전에 hoisting 되어야 함
vi.mock("./analytics", () => ({
  track: vi.fn(),
}));

// slowRequests mock — readNetwork, readDeviceMemory, reportSlowPage
vi.mock("./slowRequests", () => ({
  readNetwork: vi.fn(() => ({ effective_type: "4g", rtt_ms: 50, downlink_mbps: 10 })),
  readDeviceMemory: vi.fn(() => 8),
  reportSlowPage: vi.fn(),
}));

// lazyWithRetry mock — isChunkLoadError 는 routeTiming 내부에서만 사용
vi.mock("../utils/lazyWithRetry", () => ({
  isChunkLoadError: vi.fn(() => false),
}));

import { track } from "./analytics";

/**
 * routeTiming 은 모듈 스코프 상태를 가짐 — 매 테스트마다 리셋하기 위해 동적 import 사용.
 * freshModule 은 routeTiming + slowRequests 의 신규 mock 인스턴스와 독립적인 rAF flush 헬퍼를 반환.
 * 독립적 rAF 큐: 테스트 간 rAF 콜백 오염을 막기 위해 freshModule 마다 새 큐를 생성.
 */
async function freshModule() {
  vi.resetModules();
  const mod = await import("./routeTiming");

  // freshModule 호출마다 독립적인 rAF 큐 설치
  let localRaf: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    localRaf.push(cb);
    return localRaf.length;
  });

  function flush() {
    // 더블 rAF: 첫 번째 콜백이 두 번째를 등록하므로 두 번 순회
    const first = [...localRaf]; localRaf = [];
    first.forEach(cb => cb(0));
    const second = [...localRaf]; localRaf = [];
    second.forEach(cb => cb(0));
  }

  return { ...mod, flush };
}

describe("routeTiming", () => {
  let nowValue = 0; // 테스트마다 beforeEach 에서 초기화 — 개별 테스트에서 직접 변경 가능

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // performance.now — 단조증가 기본값
    nowValue = 0;
    vi.spyOn(performance, "now").mockImplementation(() => {
      nowValue += 100;
      return nowValue;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("beginNavigation → reportRouteReady 더블rAF 후 track('route_load') 1회 발사", async () => {
    const { beginNavigation, reportRouteReady, flush } = await freshModule();

    beginNavigation("/ko/activity/123");
    reportRouteReady("ActivityPage");

    expect(track).not.toHaveBeenCalledWith("route_load", expect.anything());

    flush();

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("route_load", expect.objectContaining({
      route: "ActivityPage",
      page_path: "/ko/activity/123",
    }));
  });

  it("첫 beginNavigation → nav_type:'initial', 두 번째 → nav_type:'navigation'", async () => {
    const { beginNavigation, reportRouteReady, flush } = await freshModule();

    // 첫 네비게이션
    beginNavigation("/ko/");
    reportRouteReady("HomePage");
    flush();

    expect(track).toHaveBeenCalledWith("route_load", expect.objectContaining({
      nav_type: "initial",
    }));

    vi.clearAllMocks();

    // 두 번째 네비게이션
    beginNavigation("/ko/fitness");
    reportRouteReady("FitnessPage");
    flush();

    expect(track).toHaveBeenCalledWith("route_load", expect.objectContaining({
      nav_type: "navigation",
    }));
  });

  it("first_visit: 첫 방문 true, 재방문 false", async () => {
    const { beginNavigation, reportRouteReady, flush } = await freshModule();

    beginNavigation("/ko/fitness");
    reportRouteReady("FitnessPage");
    flush();

    expect(track).toHaveBeenCalledWith("route_load", expect.objectContaining({
      first_visit: true,
    }));

    vi.clearAllMocks();

    beginNavigation("/ko/fitness");
    reportRouteReady("FitnessPage");
    flush();

    expect(track).toHaveBeenCalledWith("route_load", expect.objectContaining({
      first_visit: false,
    }));
  });

  it("recordChunkLoad 호출 시 chunk_load_ms 반영", async () => {
    const { beginNavigation, reportRouteReady, recordChunkLoad, flush } = await freshModule();

    beginNavigation("/ko/activity/1");
    recordChunkLoad("ActivityPage", 250);
    reportRouteReady("ActivityPage");
    flush();

    expect(track).toHaveBeenCalledWith("route_load", expect.objectContaining({
      chunk_load_ms: 250,
    }));
  });

  it("recordChunkLoad 미호출 시 chunk_load_ms=0", async () => {
    const { beginNavigation, reportRouteReady, flush } = await freshModule();

    beginNavigation("/ko/settings");
    reportRouteReady("SettingsPage");
    flush();

    expect(track).toHaveBeenCalledWith("route_load", expect.objectContaining({
      chunk_load_ms: 0,
    }));
  });

  it("pending=false(비활성) 상태에서 reportRouteReady → no-op", async () => {
    const { reportRouteReady, flush } = await freshModule();

    // beginNavigation 미호출 → pending=false
    reportRouteReady("SettingsPage");
    flush();

    expect(track).not.toHaveBeenCalled();
  });

  it("상위 네비게이션 supersede 시 이전 reportRouteReady 무효화", async () => {
    const { beginNavigation, reportRouteReady, flush } = await freshModule();

    beginNavigation("/ko/groups");
    reportRouteReady("GroupsPage"); // rAF 큐에 적재, 아직 미실행

    // rAF 실행 전에 새 네비게이션 시작
    beginNavigation("/ko/fitness");

    // 첫 reportRouteReady 의 rAF 실행 (navId 불일치 → 무효화 예상)
    flush();

    // track 이 GroupsPage 로 호출되지 않았어야 함
    expect(track).not.toHaveBeenCalledWith("route_load", expect.objectContaining({
      route: "GroupsPage",
    }));

    // 새 라우트를 정상 완료
    reportRouteReady("FitnessPage");
    flush();

    expect(track).toHaveBeenCalledWith("route_load", expect.objectContaining({
      route: "FitnessPage",
      page_path: "/ko/fitness",
    }));
  });

  it("duration_ms >= 3000 일 때 track('route_load') 의 duration_ms 가 임계값 이상", async () => {
    // reportSlowPage 는 routeTiming 이 import 시점에 바인딩 — resetModules 후 인스턴스 다름.
    // slow_page 신호 대신 route_load 의 duration_ms 가 3000 이상임을 검증.
    const { beginNavigation, reportRouteReady, flush } = await freshModule();

    // navId===1 이므로 navStart=0. nowValue 를 3500 으로 설정 → now()=3600, durationMs=3600 ≥ 3000
    nowValue = 3500;

    beginNavigation("/ko/fitness");
    reportRouteReady("FitnessPage");
    flush();

    const trackCall = (track as ReturnType<typeof vi.fn>).mock.calls.find(c => c[0] === "route_load");
    expect(trackCall).toBeDefined();
    expect(trackCall![1].duration_ms).toBeGreaterThanOrEqual(3000);
  });

  it("duration_ms 필드가 숫자로 존재", async () => {
    const { beginNavigation, reportRouteReady, flush } = await freshModule();

    beginNavigation("/ko/plan");
    reportRouteReady("PlanPage");
    flush();

    const call = (track as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(typeof call[1].duration_ms).toBe("number");
  });

  // ── navKey 멱등 (리뷰 #319 RUM 버그 수정) ──────────────────────────────────
  // beginNavigation 은 렌더 단계에서 호출되므로 같은 네비게이션에서 여러 번
  // (콜드 청크 suspend 재렌더·StrictMode 이중 렌더) 불릴 수 있다. navKey 로 멱등 처리.
  it("navKey 멱등 — 같은 key 반복 호출은 1회만 적용", async () => {
    const { beginNavigation, reportRouteReady, flush } = await freshModule();

    beginNavigation("/ko/fitness", "k1");
    beginNavigation("/ko/fitness", "k1"); // suspend 재렌더 — no-op
    beginNavigation("/ko/fitness", "k1"); // StrictMode 이중 렌더 — no-op
    reportRouteReady("FitnessPage");
    flush();

    const calls = (track as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === "route_load");
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toMatchObject({ nav_type: "initial", route: "FitnessPage" });
  });

  // 재방문(같은 route, 다른 navKey) 이 nav_type:"navigation"/first_visit:false 로 정상 발사되는지 —
  // 수정 전엔 effect 순서로 이 케이스가 체계적으로 드롭됐다.
  it("다른 navKey 는 새 네비게이션 — 재방문 route_load 가 정상 발사", async () => {
    const { beginNavigation, reportRouteReady, flush } = await freshModule();

    beginNavigation("/ko/", "k1");
    reportRouteReady("HomePage");
    flush();
    vi.clearAllMocks();

    beginNavigation("/ko/", "k2"); // 같은 path, 다른 key = 재방문
    reportRouteReady("HomePage");
    flush();

    expect(track).toHaveBeenCalledWith("route_load", expect.objectContaining({
      route: "HomePage",
      nav_type: "navigation",
      first_visit: false,
    }));
  });
});
