/**
 * EventMap 오류 처리 회귀 테스트 (g1-web#4078 리뷰 MAJOR 4건)
 *
 * 각 테스트는 실제 이벤트/오류 객체로 동작을 재현한다.
 * 테스트 내에서 콜백을 직접 호출하지 않고,
 * - WebGL: canvas에 webglcontextlost DOM 이벤트 발생
 * - Mapbox 오류: map-stub 에 test:maperror 커스텀 이벤트 발생
 * - onLoad: map-stub 에 test:mapload 커스텀 이벤트 발생
 */
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EventMap, { WEBGL_CONTEXT_RESTORE_MS } from "./EventMap";
import { applyKoreaCyclingStyle } from "../../utils/mapbox";
import { logClientError } from "../../services/errorLogger";

// ── mock: react-map-gl ──────────────────────────────────────────────────────
vi.mock("react-map-gl/mapbox", async () => {
  const { forwardRef, useEffect, useImperativeHandle, useRef } = await import("react");

  return {
    default: forwardRef(function Map(
      { children, onLoad, onError }: {
        children?: React.ReactNode;
        onLoad?: (e: { target: unknown }) => void;
        onError?: (e: Record<string, unknown>) => void;
        [k: string]: unknown;
      },
      ref: React.ForwardedRef<{ getCanvas: () => HTMLCanvasElement | null }>,
    ) {
      const canvasRef = useRef<HTMLCanvasElement>(null);
      const containerRef = useRef<HTMLDivElement>(null);

      // 최신 핸들러를 ref에 유지해 stale-closure 없이 커스텀 이벤트에서 사용한다.
      const latestOnLoad = useRef(onLoad);
      const latestOnError = useRef(onError);
      useEffect(() => { latestOnLoad.current = onLoad; latestOnError.current = onError; });

      useImperativeHandle(ref, () => ({ getCanvas: () => canvasRef.current }), []);

      useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleError = (e: Event) => {
          latestOnError.current?.((e as CustomEvent).detail as Record<string, unknown>);
        };
        const handleLoad = (e: Event) => {
          const detail = (e as CustomEvent).detail ?? { target: {} };
          latestOnLoad.current?.(detail as { target: unknown });
        };

        container.addEventListener("test:maperror", handleError);
        container.addEventListener("test:mapload", handleLoad);
        return () => {
          container.removeEventListener("test:maperror", handleError);
          container.removeEventListener("test:mapload", handleLoad);
        };
      }, []); // 마운트 한 번만 등록. 최신 핸들러는 latestOn* ref로 참조.

      return (
        <div ref={containerRef} data-testid="map-stub">
          <canvas ref={canvasRef} data-testid="map-canvas" />
          {children}
        </div>
      );
    }),
    Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Layer: () => null,
    Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Popup: ({ children, onClose }: { children?: React.ReactNode; onClose?: () => void }) => (
      <div role="dialog"><button onClick={onClose}>닫기</button>{children}</div>
    ),
    useMap: () => ({ current: null }),
  };
});

// ── mock: utils/mapbox ───────────────────────────────────────────────────────
vi.mock("../../utils/mapbox", async (importOriginal) => {
  const actual = await importOriginal() as typeof import("../../utils/mapbox");
  return {
    ...actual,
    getMapboxToken: vi.fn(() => "test-token"),
    applyKoreaCyclingStyle: vi.fn(),
  };
});

// ── mock: services/errorLogger ───────────────────────────────────────────────
vi.mock("../../services/errorLogger", () => ({
  logClientError: vi.fn(),
}));

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────
function renderMap(extraProps: Partial<React.ComponentProps<typeof EventMap>> = {}) {
  return render(
    <EventMap
      locations={[]}
      selectedUid={null}
      onSelectParticipant={() => {}}
      {...extraProps}
    />,
  );
}

function fireMapError(detail: Record<string, unknown>) {
  act(() => {
    screen.getByTestId("map-stub").dispatchEvent(
      new CustomEvent("test:maperror", { detail, bubbles: true }),
    );
  });
}

function fireMapLoad(target: unknown = {}) {
  act(() => {
    screen.getByTestId("map-stub").dispatchEvent(
      new CustomEvent("test:mapload", { detail: { target }, bubbles: true }),
    );
  });
}

beforeEach(() => {
  vi.mocked(logClientError).mockClear();
  vi.mocked(applyKoreaCyclingStyle).mockClear();
});

// ═══════════════════════════════════════════════════════════════════════════
// Fix 1: WebGL 감시를 onLoad가 아닌 맵 생성 직후(캔버스 생기면) 등록
// ═══════════════════════════════════════════════════════════════════════════
describe("Fix 1: WebGL 컨텍스트 감시 — 캔버스 생성 직후 등록", () => {
  it("캔버스에 webglcontextlost 이벤트 발생 후 복구 없이 타임아웃 → onFatalMapError 호출", () => {
    vi.useFakeTimers();
    const onFatalMapError = vi.fn();
    renderMap({ onFatalMapError });

    // onLoad 발생 전 — 캔버스가 존재하고 WebGL 감시가 이미 등록되어 있어야 한다.
    const canvas = screen.getByTestId("map-canvas") as HTMLCanvasElement;
    act(() => {
      canvas.dispatchEvent(new Event("webglcontextlost", { bubbles: false }));
    });

    // 타임아웃 전에는 아직 치명 아님
    expect(onFatalMapError).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(WEBGL_CONTEXT_RESTORE_MS); });
    expect(onFatalMapError).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("webglcontextrestored 이벤트가 타임아웃 전에 도착하면 onFatalMapError 호출하지 않음", () => {
    vi.useFakeTimers();
    const onFatalMapError = vi.fn();
    renderMap({ onFatalMapError });

    const canvas = screen.getByTestId("map-canvas") as HTMLCanvasElement;
    act(() => {
      canvas.dispatchEvent(new Event("webglcontextlost", { bubbles: false }));
    });
    act(() => {
      canvas.dispatchEvent(new Event("webglcontextrestored", { bubbles: false }));
    });
    act(() => { vi.advanceTimersByTime(WEBGL_CONTEXT_RESTORE_MS * 2); });

    expect(onFatalMapError).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fix 2: sourceId만 있는 오류는 치명, tile이 있는 오류만 일시 오류
// ═══════════════════════════════════════════════════════════════════════════
describe("Fix 2: 오류 분류 — tile 있으면 일시, sourceId만이면 치명", () => {
  it("tile 속성이 있는 타일 오류 → logClientError만, onFatalMapError 없음", () => {
    const onFatalMapError = vi.fn();
    renderMap({ onFatalMapError });

    const tileError = Object.assign(new Error("tile load failed"), { status: 403 });
    fireMapError({ error: tileError, tile: { tileID: "1/2/3" }, sourceId: "mapbox-streets" });

    expect(onFatalMapError).not.toHaveBeenCalled();
    expect(logClientError).toHaveBeenCalled();
  });

  it("sourceId만 있는 TileJSON 401 오류 → onFatalMapError 호출(치명)", () => {
    const onFatalMapError = vi.fn();
    renderMap({ onFatalMapError });

    // load 없이 소스 오류 발생 — 소스 메타데이터 인증 실패는 치명
    const sourceError = Object.assign(new Error("TileJSON request failed"), { status: 401 });
    fireMapError({ error: sourceError, sourceId: "mapbox-streets" });

    expect(onFatalMapError).toHaveBeenCalledOnce();
  });

  it("onFatalMapError 없으면 sourceId 오류도 logClientError만 호출(기존 동작 유지)", () => {
    // onFatalMapError 미제공 — 플래그 꺼짐 시 동작 불변
    renderMap();

    const sourceError = Object.assign(new Error("TileJSON 403"), { status: 403 });
    fireMapError({ error: sourceError, sourceId: "mapbox-streets" });

    // 치명 콜백 없어도 오류는 기록된다
    expect(logClientError).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fix 3: 첫 load 전 스타일 fetch 실패만 치명 — 검증 오류·스프라이트 실패는 비치명
// ═══════════════════════════════════════════════════════════════════════════
describe("Fix 3: 첫 load 전 스타일 오류 — 스타일 fetch 실패만 치명, 원본 오류 항상 기록", () => {
  it("load 전 TypeError('Failed to fetch') → onFatalMapError 호출, 원본 오류도 기록", () => {
    const onFatalMapError = vi.fn();
    const onLogError = vi.fn();
    renderMap({ onFatalMapError, onLogError });

    const originalError = new TypeError("Failed to fetch");
    fireMapError({ error: originalError });

    expect(onFatalMapError).toHaveBeenCalledOnce();
    // 치명 처리 전에 원본 오류가 "EventMap.render" 경로로 기록돼야 한다
    expect(onLogError).toHaveBeenCalledWith("EventMap.render", originalError);
  });

  it("load 전 스타일 404(sprite 메시지 없음) → onFatalMapError 호출, 원본 오류도 기록", () => {
    const onFatalMapError = vi.fn();
    const onLogError = vi.fn();
    renderMap({ onFatalMapError, onLogError });

    const styleError = Object.assign(new Error("Not Found"), { status: 404 });
    fireMapError({ error: styleError });

    expect(onFatalMapError).toHaveBeenCalledOnce();
    expect(onLogError).toHaveBeenCalledWith("EventMap.render", styleError);
  });

  it("load 전 CSS 변수 검증 오류 → 치명 아님, logClientError만 호출", () => {
    const onFatalMapError = vi.fn();
    renderMap({ onFatalMapError });

    // CSS 변수(var(--primary-fg)) 색상을 Mapbox가 파싱 실패 — TypeError 아님, status 없음
    const validationError = new Error("Invalid color value: var(--primary-fg)");
    fireMapError({ error: validationError });

    expect(onFatalMapError).not.toHaveBeenCalled();
    expect(logClientError).toHaveBeenCalledWith("EventMap.render", validationError);
  });

  it("load 전 스프라이트 404 → 치명 아님, logClientError만 호출", () => {
    const onFatalMapError = vi.fn();
    renderMap({ onFatalMapError });

    const spriteError = Object.assign(new Error("Failed to load sprite image"), { status: 404 });
    fireMapError({ error: spriteError });

    expect(onFatalMapError).not.toHaveBeenCalled();
    expect(logClientError).toHaveBeenCalledWith("EventMap.render", spriteError);
  });

  it("onFatalMapError 미제공 시 load 전 TypeError → 크래시 없음, logClientError 호출", () => {
    // onFatalMapError 미제공 — 관전 화면 등에서 원본 오류 로그가 남아야 한다
    renderMap();

    const error = new TypeError("Failed to fetch");
    fireMapError({ error });

    // 치명 콜백 없어도 원본 오류는 기록된다
    expect(logClientError).toHaveBeenCalledWith("EventMap.render", error);
  });

  it("load 이후 TypeError('Failed to fetch') → 치명 아님(일시 오류)", () => {
    const onFatalMapError = vi.fn();
    renderMap({ onFatalMapError });

    // load 먼저 발생
    fireMapLoad();

    // load 이후 일반 네트워크 오류
    fireMapError({ error: new TypeError("Failed to fetch") });

    expect(onFatalMapError).not.toHaveBeenCalled();
    expect(logClientError).toHaveBeenCalled();
  });

  it("load 전 tile 속성이 있으면 → 치명 아님(일시 오류)", () => {
    const onFatalMapError = vi.fn();
    renderMap({ onFatalMapError });

    // tile 속성이 있으면 개별 타일 실패 → 일시 오류
    fireMapError({ error: new Error("tile failed"), tile: { tileID: "0/0/0" } });

    expect(onFatalMapError).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Fix 4 (P12): applyKoreaCyclingStyle 내부 오류 → onLogError 경로로 기록
// ═══════════════════════════════════════════════════════════════════════════
describe("Fix 4 (P12): applyKoreaCyclingStyle 내부 오류 — 주입 로거 경로", () => {
  it("applyKoreaCyclingStyle 내부에서 발생한 오류가 onLogError로 기록됨(logClientError 직접 호출 아님)", () => {
    const internalError = new Error("setLanguage not supported");
    // applyKoreaCyclingStyle이 두 번째 인자(log)로 받은 함수를 호출하도록 모킹
    vi.mocked(applyKoreaCyclingStyle).mockImplementationOnce((_map, log) => {
      log?.("Mapbox.language", internalError);
    });

    const onLogError = vi.fn();
    renderMap({ onLogError });

    // load 이벤트 → EventMap의 onLoad 실행 → applyKoreaCyclingStyle(target, onLogError) 호출
    fireMapLoad();

    expect(onLogError).toHaveBeenCalledWith("Mapbox.language", internalError);
    // logClientError는 이 오류에 대해 직접 호출되지 않아야 한다
    expect(logClientError).not.toHaveBeenCalledWith("Mapbox.language", internalError);
  });

  it("onLogError 없을 때 applyKoreaCyclingStyle 내부 오류 → logClientError로 기록(기존 동작 유지)", () => {
    const internalError = new Error("setPaintProperty failed");
    vi.mocked(applyKoreaCyclingStyle).mockImplementationOnce((_map, log) => {
      log?.("Mapbox.paint", internalError);
    });

    renderMap(); // onLogError 미제공 — 기본값 logClientError

    fireMapLoad();

    // 기본값(logClientError)이 사용되어야 한다
    expect(logClientError).toHaveBeenCalledWith("Mapbox.paint", internalError);
  });
});
