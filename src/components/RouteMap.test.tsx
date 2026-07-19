import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import RouteMap from "./RouteMap";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { RECORDED_TRACK_COLOR } from "../theme/mapColors";

const mapProps = vi.hoisted(() => ({
  latest: null as null | {
    cooperativeGestures?: boolean;
    dragPan?: boolean;
    scrollZoom?: boolean;
    onLoad?: (event: { target: Record<string, unknown> }) => void;
  },
  layers: new Map<string, Record<string, unknown>>(),
  sources: [] as unknown[],
}));

vi.mock("../utils/mapbox", () => ({
  getMapboxToken: () => "test-token",
  MAP_STYLE: "mapbox://styles/mapbox/outdoors-v12",
  applyKoreaCyclingStyle: vi.fn(),
}));

vi.mock("react-map-gl/mapbox", () => ({
  default: ({
    children,
    onError,
    cooperativeGestures,
    dragPan,
    scrollZoom,
    onLoad,
  }: {
    children: ReactNode;
    onError?: () => void;
    cooperativeGestures?: boolean;
    dragPan?: boolean;
    scrollZoom?: boolean;
    onLoad?: (event: { target: Record<string, unknown> }) => void;
  }) => {
    mapProps.latest = { cooperativeGestures, dragPan, scrollZoom, onLoad };
    return (
      <button type="button" data-testid="mock-map" onClick={() => onError?.()}>
        {children}
      </button>
    );
  },
  Source: ({ children, data }: { children: ReactNode; data: unknown }) => {
    mapProps.sources.push(data);
    return <>{children}</>;
  },
  Layer: ({ id, paint }: { id: string; paint: Record<string, unknown> }) => {
    mapProps.layers.set(id, paint);
    return null;
  },
  Marker: ({ children }: { children: ReactNode }) => <>{children}</>,
  Popup: ({ children }: { children: ReactNode }) => <>{children}</>,
  useMap: () => ({ current: null }),
}));

describe("RouteMap", () => {
  beforeEach(() => {
    mapProps.layers.clear();
    mapProps.sources.length = 0;
  });

  it("uses the generated recorded-track functional color in production layers", () => {
    renderWithProviders(<RouteMap polyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@" />);
    expect(mapProps.layers.get("route-main")?.["line-color"]).toBe(RECORDED_TRACK_COLOR);
    expect(mapProps.layers.get("route-glow")?.["line-color"]).toBe(RECORDED_TRACK_COLOR);
  });

  it("renders distinct WebGL endpoint markers for canvas capture", () => {
    renderWithProviders(
      <RouteMap polyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@" showRouteEndpoints />,
    );

    expect(mapProps.layers.get("route-endpoint-halo")).toMatchObject({
      "circle-color": "#ffffff",
      "circle-radius": 8,
    });
    expect(mapProps.layers.get("route-endpoint-core")?.["circle-color"]).toEqual([
      "match", ["get", "endpoint"], "start", "#16a34a", "#dc2626",
    ]);
    expect(mapProps.sources).toContainEqual({
      type: "FeatureCollection",
      features: [
        expect.objectContaining({ properties: { endpoint: "start" }, geometry: expect.objectContaining({ coordinates: [-120.2, 38.5] }) }),
        expect.objectContaining({ properties: { endpoint: "end" }, geometry: expect.objectContaining({ coordinates: [-126.453, 43.252] }) }),
      ],
    });
  });

  it("resizes the backing canvas after forcing a capture pixel ratio", () => {
    renderWithProviders(
      <RouteMap polyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@" pixelRatio={2} />,
    );
    const container = document.createElement("div");
    container.style.width = "1280px";
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({ width: 1280 } as DOMRect);
    const map = {
      getStyle: vi.fn(() => ({ layers: [] })),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
      resize: vi.fn(),
      once: vi.fn(),
      getContainer: vi.fn(() => container),
    };
    mapProps.latest!.onLoad?.({ target: map });
    expect(map.resize).toHaveBeenCalledTimes(2);
    expect(container.style.width).toBe("1280px");
    expect(window.devicePixelRatio).not.toBe(2);
  });

  it("uses cooperative gestures on interactive maps to preserve mobile page scroll", () => {
    renderWithProviders(
      <RouteMap
        polyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@"
        interactive
      />
    );

    expect(screen.getByTestId("mock-map")).toBeInTheDocument();
    expect(mapProps.latest).toMatchObject({
      cooperativeGestures: true,
      dragPan: true,
      scrollZoom: true,
    });
  });

  it("uses fallback before mounting Mapbox when WebGL is unavailable", () => {
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);

    renderWithProviders(
      <RouteMap
        polyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@"
      />
    );

    expect(screen.queryByTestId("mock-map")).not.toBeInTheDocument();
    expect(screen.getByText("지도 표시를 준비하지 못했습니다")).toBeInTheDocument();

    getContextSpy.mockRestore();
  });

  it("falls back to the stored route image when Mapbox reports an error", () => {
    renderWithProviders(
      <RouteMap
        polyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@"
        fallbackImageUrl="https://example.com/map.webp"
      />
    );

    fireEvent.click(screen.getByTestId("mock-map"));

    const fallback = screen.getByRole("img", { name: "활동 경로 지도" });
    expect(fallback).toHaveAttribute("src", "https://example.com/map.webp");
  });

  it("shows a route fallback message when no stored image is available", () => {
    renderWithProviders(
      <RouteMap
        polyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@"
      />
    );

    fireEvent.click(screen.getByTestId("mock-map"));

    expect(screen.getByText("지도 표시를 준비하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByText("경로 데이터는 계속 확인할 수 있습니다.")).toBeInTheDocument();
  });
});
