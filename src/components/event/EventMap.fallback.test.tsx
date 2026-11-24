import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import EventMap, { WEBGL_CONTEXT_RESTORE_MS } from "./EventMap";

const map = vi.hoisted(() => ({
  canvas: null as null | HTMLCanvasElement,
  onError: null as null | ((event: Record<string, unknown>) => void),
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
    { children, onLoad, onError }: { children: ReactNode; onLoad?: (event: { target: { getCanvas: () => HTMLCanvasElement } }) => void; onError?: (event: Record<string, unknown>) => void },
    ref: React.ForwardedRef<{ getCanvas: () => HTMLCanvasElement }>,
  ) {
    map.onError = onError ?? null;
    // ref를 통해 캔버스 접근을 허용한다 — WebGL 감시가 onLoad 전에 등록되도록
    useImperativeHandle(ref, () => ({ getCanvas: () => map.canvas! }), []);
    useEffect(() => { onLoad?.({ target: { getCanvas: () => map.canvas! } }); }, []);
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

const renderMap = () => {
  const onFatalMapError = vi.fn();
  const onLogError = vi.fn();
  const view = render(<EventMap locations={[]} selectedUid={null} onSelectParticipant={vi.fn()} onFatalMapError={onFatalMapError} onLogError={onLogError} />);
  return { onFatalMapError, onLogError, view };
};

describe("EventMap Mapbox failure fallback (#4078)", () => {
  beforeEach(() => { map.canvas = document.createElement("canvas"); map.onError = null; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("falls back when the WebGL context is lost and not restored in time", () => {
    const { onFatalMapError, onLogError } = renderMap();
    act(() => { map.canvas!.dispatchEvent(new Event("webglcontextlost")); });
    act(() => { vi.advanceTimersByTime(WEBGL_CONTEXT_RESTORE_MS - 1); });
    expect(onFatalMapError).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onFatalMapError).toHaveBeenCalledTimes(1);
    expect(onLogError).toHaveBeenCalledWith("EventMap.mapbox", expect.any(Error), { stage: "mapbox_runtime", kind: "webgl_context" });
  });

  it("keeps the map when the WebGL context is restored and stops listening after unmount", () => {
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

  it("treats a tile 403 as transient but a style or token 403 as fatal", () => {
    const { onFatalMapError, onLogError } = renderMap();
    const tileError = { status: 403, message: "Forbidden" };
    act(() => { map.onError!({ error: tileError, sourceId: "composite", tile: {} }); });
    expect(onFatalMapError).not.toHaveBeenCalled();
    expect(onLogError).toHaveBeenCalledWith("EventMap.render", tileError);
    act(() => { map.onError!({ error: { status: 403, message: "Forbidden" } }); });
    expect(onFatalMapError).toHaveBeenCalledTimes(1);
    expect(onLogError).toHaveBeenCalledWith("EventMap.mapbox", expect.any(Error), { stage: "mapbox_runtime", kind: "auth", status: 403 });
  });

  it("still records non-fatal errors through the injected logger", () => {
    const { onFatalMapError, onLogError } = renderMap();
    const error = new TypeError("Failed to fetch");
    act(() => { map.onError!({ error }); });
    expect(onFatalMapError).not.toHaveBeenCalled();
    expect(onLogError).toHaveBeenCalledWith("EventMap.render", error);
  });
});
