import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import RouteMap from "./RouteMap";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";

vi.mock("../utils/mapbox", () => ({
  getMapboxToken: () => "test-token",
  MAP_STYLE: "mapbox://styles/mapbox/outdoors-v12",
  applyKoreaCyclingStyle: vi.fn(),
}));

vi.mock("react-map-gl/mapbox", () => ({
  default: ({ children, onError }: { children: ReactNode; onError?: () => void }) => (
    <button type="button" data-testid="mock-map" onClick={() => onError?.()}>
      {children}
    </button>
  ),
  Source: ({ children }: { children: ReactNode }) => <>{children}</>,
  Layer: () => null,
  Marker: ({ children }: { children: ReactNode }) => <>{children}</>,
  Popup: ({ children }: { children: ReactNode }) => <>{children}</>,
  useMap: () => ({ current: null }),
}));

describe("RouteMap", () => {
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
});
