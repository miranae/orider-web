import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import RouteMap from "./RouteMap";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { RECORDED_TRACK_COLOR } from "../theme/mapColors";

const mapProps = vi.hoisted(() => ({
  latest: null as null | { cooperativeGestures?: boolean; dragPan?: boolean; scrollZoom?: boolean },
  layers: new Map<string, Record<string, unknown>>(),
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
  }: {
    children: ReactNode;
    onError?: () => void;
    cooperativeGestures?: boolean;
    dragPan?: boolean;
    scrollZoom?: boolean;
  }) => {
    mapProps.latest = { cooperativeGestures, dragPan, scrollZoom };
    return (
      <button type="button" data-testid="mock-map" onClick={() => onError?.()}>
        {children}
      </button>
    );
  },
  Source: ({ children }: { children: ReactNode }) => <>{children}</>,
  Layer: ({ id, paint }: { id: string; paint: Record<string, unknown> }) => {
    mapProps.layers.set(id, paint);
    return null;
  },
  Marker: ({ children }: { children: ReactNode }) => <>{children}</>,
  Popup: ({ children }: { children: ReactNode }) => <>{children}</>,
  useMap: () => ({ current: null }),
}));

describe("RouteMap", () => {
  beforeEach(() => mapProps.layers.clear());

  it("uses the generated recorded-track functional color in production layers", () => {
    renderWithProviders(<RouteMap polyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@" />);
    expect(mapProps.layers.get("route-main")?.["line-color"]).toBe(RECORDED_TRACK_COLOR);
    expect(mapProps.layers.get("route-glow")?.["line-color"]).toBe(RECORDED_TRACK_COLOR);
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
