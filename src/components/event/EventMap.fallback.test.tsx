import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import EventMap, { LOAD_TIMEOUT_MS, WEBGL_CONTEXT_RESTORE_MS } from "./EventMap";

const map = vi.hoisted(() => ({
  canvas: null as null | HTMLCanvasElement,
  onError: null as null | ((event: Record<string, unknown>) => void),
  onLoad: null as null | ((event: Record<string, unknown>) => void),
}));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../../utils/mapbox", () => ({
  getMapboxToken: () => "pk.test",
  MAP_STYLE: "mapbox://styles/test",
  DEFAULT_VIEW: { latitude: 37, longitude: 127, zoom: 10 },
  applyKoreaCyclingStyle: vi.fn(),
}));
vi.mock("react-map-gl/mapbox", async () => {
  const { forwardRef, useEffect, useImperativeHandle } = await import("react");
  const MockMap = forwardRef(function MockMap(
    { children, onLoad, onError }: { children: ReactNode; onLoad?: (event: Record<string, unknown>) => void; onError?: (event: Record<string, unknown>) => void },
    ref: React.ForwardedRef<{ getCanvas: () => HTMLCanvasElement }>,
  ) {
    map.onError = onError ?? null;
    map.onLoad = onLoad ?? null;
    // ref를 통해 캔버스 접근을 허용한다 — WebGL 감시가 onLoad 전에 등록되도록
    useImperativeHandle(ref, () => ({ getCanvas: () => map.canvas! }), []);
    // onLoad는 자동으로 호출하지 않는다 — 타이머 테스트에서 수동으로 제어한다.
    useEffect(() => { /* noop: 수동 fireLoad() 사용 */ }, []);
    return <div>{children}</div>;
  });
  return {
    default: MockMap,
    Source: ({ children }: { children: ReactNode }) => <>{children}</>,
    Layer: () => null,
    Marker: ({ children }: { children: ReactNode }) => <>{children}</>,
    Popup: ({ children }: { children: ReactNode }) => <>{children}</>,
    useMap: () => ({ current: null }),
  };
});

const fireLoad = () => {
  act(() => { map.onLoad?.({ target: { getCanvas: () => map.canvas! } }); });
};

const renderMap = () => {
  const onFatalMapError = vi.fn();
  const onLogError = vi.fn();
  const view = render(<EventMap locations={[]} selectedUid={null} onSelectParticipant={vi.fn()} onFatalMapError={onFatalMapError} onLogError={onLogError} />);
  return { onFatalMapError, onLogError, view };
};

describe("EventMap 로드 타임아웃 대체 (#4078 재설계)", () => {
  beforeEach(() => { map.canvas = document.createElement("canvas"); map.onError = null; map.onLoad = null; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("load 이벤트 없이 LOAD_TIMEOUT_MS 경과 → onFatalMapError 호출", () => {
    const { onFatalMapError, onLogError } = renderMap();
    // 오류 없이도 타임아웃만으로 대체
    act(() => { vi.advanceTimersByTime(LOAD_TIMEOUT_MS - 1); });
    expect(onFatalMapError).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onFatalMapError).toHaveBeenCalledTimes(1);
    expect(onLogError).toHaveBeenCalledWith("EventMap.mapbox", expect.any(Error), { stage: "mapbox_runtime", kind: "load_timeout" });
  });

  it("부모가 렌더마다 새 콜백을 넘겨도 로드 기한은 다시 시작되지 않는다", () => {
    const calls: number[] = [];
    const props = { locations: [], selectedUid: null, onSelectParticipant: vi.fn(), onLogError: vi.fn() };
    const view = render(<EventMap {...props} onFatalMapError={() => calls.push(0)} />);
    // 스냅샷 갱신처럼 기한 직전까지 여러 번 다시 렌더한다(매번 새 인라인 콜백).
    for (let i = 1; i <= 4; i += 1) {
      act(() => { vi.advanceTimersByTime(LOAD_TIMEOUT_MS / 5); });
      view.rerender(<EventMap {...props} onFatalMapError={() => calls.push(i)} />);
    }
    act(() => { vi.advanceTimersByTime(LOAD_TIMEOUT_MS / 5); });
    // 처음 마운트 기준 10초에 대체되고, 최신 콜백이 호출된다.
    expect(calls).toEqual([4]);
  });

  it("load 이벤트가 타임아웃 전에 도착하면 → onFatalMapError 호출하지 않음", () => {
    const { onFatalMapError } = renderMap();
    act(() => { vi.advanceTimersByTime(LOAD_TIMEOUT_MS - 1); });
    fireLoad();
    act(() => { vi.advanceTimersByTime(LOAD_TIMEOUT_MS); });
    expect(onFatalMapError).not.toHaveBeenCalled();
  });

  it.each([
    ["스타일 503", { error: Object.assign(new Error("Style request failed"), { status: 503 }) }],
    ["status:0 AJAXError", { error: Object.assign(new Error("AJAXError"), { status: 0 }) }],
    ["잘못된 JSON", { error: new SyntaxError("Unexpected token < in JSON") }],
    ["스프라이트 TypeError", { error: new TypeError("Failed to fetch sprite") }],
  ])("load 전 오류(%s) → 로그만, load 없으면 N초 뒤 대체", (_label, errorEvent) => {
    const { onFatalMapError, onLogError } = renderMap();
    // 오류 발생
    act(() => { map.onError!(errorEvent as Record<string, unknown>); });
    // 오류 발생 직후 대체 없음
    expect(onFatalMapError).not.toHaveBeenCalled();
    expect(onLogError).toHaveBeenCalledWith("EventMap.render", errorEvent.error, undefined);
    // 타임아웃 경과 → 대체 지도
    act(() => { vi.advanceTimersByTime(LOAD_TIMEOUT_MS); });
    expect(onFatalMapError).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["스타일 503", { error: Object.assign(new Error("Style request failed"), { status: 503 }) }],
    ["status:0 AJAXError", { error: Object.assign(new Error("AJAXError"), { status: 0 }) }],
    ["잘못된 JSON", { error: new SyntaxError("Unexpected token < in JSON") }],
    ["스프라이트 TypeError", { error: new TypeError("Failed to fetch sprite") }],
  ])("load 전 오류(%s) → load가 오면 타이머 취소, 대체 없음", (_label, errorEvent) => {
    const { onFatalMapError } = renderMap();
    act(() => { map.onError!(errorEvent as Record<string, unknown>); });
    // 타임아웃 전에 load 도착
    fireLoad();
    act(() => { vi.advanceTimersByTime(LOAD_TIMEOUT_MS * 2); });
    expect(onFatalMapError).not.toHaveBeenCalled();
  });

  it("onFatalMapError 없으면 타이머도 동작하지 않음(기존 동작 불변)", () => {
    const onLogError = vi.fn();
    render(<EventMap locations={[]} selectedUid={null} onSelectParticipant={vi.fn()} onLogError={onLogError} />);
    act(() => { vi.advanceTimersByTime(LOAD_TIMEOUT_MS * 2); });
    // onFatalMapError가 없으니 호출 자체 없음 — 크래시 없어야 함
    expect(onLogError).not.toHaveBeenCalledWith("EventMap.mapbox", expect.any(Error), expect.objectContaining({ kind: "load_timeout" }));
  });
});

describe("EventMap WebGL 컨텍스트 손실 대체 (#4078)", () => {
  beforeEach(() => { map.canvas = document.createElement("canvas"); map.onError = null; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("WebGL 컨텍스트 손실 후 복구 없이 타임아웃 → onFatalMapError 호출", () => {
    const { onFatalMapError, onLogError } = renderMap();
    act(() => { map.canvas!.dispatchEvent(new Event("webglcontextlost")); });
    act(() => { vi.advanceTimersByTime(WEBGL_CONTEXT_RESTORE_MS - 1); });
    expect(onFatalMapError).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onFatalMapError).toHaveBeenCalledTimes(1);
    expect(onLogError).toHaveBeenCalledWith("EventMap.mapbox", expect.any(Error), { stage: "mapbox_runtime", kind: "webgl_context" });
  });

  it("webglcontextrestored 이벤트가 타임아웃 전에 도착하면 onFatalMapError 호출하지 않음, 언마운트 후 감시 중단", () => {
    const { onFatalMapError, view } = renderMap();
    act(() => { map.canvas!.dispatchEvent(new Event("webglcontextlost")); });
    act(() => { vi.advanceTimersByTime(WEBGL_CONTEXT_RESTORE_MS - 1); });
    act(() => { map.canvas!.dispatchEvent(new Event("webglcontextrestored")); });
    act(() => { vi.advanceTimersByTime(WEBGL_CONTEXT_RESTORE_MS * 2); });
    expect(onFatalMapError).not.toHaveBeenCalled();
    act(() => { map.canvas!.dispatchEvent(new Event("webglcontextlost")); });
    view.unmount();
    vi.advanceTimersByTime(WEBGL_CONTEXT_RESTORE_MS * 2);
    expect(onFatalMapError).not.toHaveBeenCalled();
  });
});

describe("EventMap load 이후 인증 오류 대체 (#4078)", () => {
  beforeEach(() => { map.canvas = document.createElement("canvas"); map.onError = null; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("load 이후 tile 403 → 일시 오류(onFatalMapError 없음)", () => {
    const { onFatalMapError, onLogError } = renderMap();
    fireLoad();
    const tileError = { status: 403, message: "Forbidden" };
    act(() => { map.onError!({ error: tileError, sourceId: "composite", tile: {} }); });
    expect(onFatalMapError).not.toHaveBeenCalled();
    expect(onLogError).toHaveBeenCalledWith("EventMap.render", tileError, { sourceId: "composite" });
  });

  it("load 이후 sourceId 403 → 치명(인증 실패)", () => {
    const { onFatalMapError } = renderMap();
    fireLoad();
    act(() => { map.onError!({ error: { status: 403, message: "Forbidden" } }); });
    expect(onFatalMapError).toHaveBeenCalledTimes(1);
    // 이미 load 타임아웃 타이머는 취소됨 — 중복 호출 없어야 함
    act(() => { vi.advanceTimersByTime(LOAD_TIMEOUT_MS * 2); });
    expect(onFatalMapError).toHaveBeenCalledTimes(1);
  });

  it("주입된 로거로 비치명 오류 기록", () => {
    const { onFatalMapError, onLogError } = renderMap();
    fireLoad();
    const error = new TypeError("Failed to fetch");
    act(() => { map.onError!({ error }); });
    expect(onFatalMapError).not.toHaveBeenCalled();
    expect(onLogError).toHaveBeenCalledWith("EventMap.render", error, undefined);
  });
});
