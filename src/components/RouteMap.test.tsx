import { act, fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import RouteMap from "./RouteMap";
import { useActivityRangeSelection } from "../hooks/useActivityRangeSelection";
import { buildSampledData, buildAlignedActivityChartChannels } from "../features/activity/detail/activityDetailDerived";
import type { ActivityAnalysisModel } from "../hooks/useActivityAnalysisModel";
import { routeFixtureActivity, routeFixtureStreams } from "../../e2e/fixtures/routeSensorExpansionData";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { RECORDED_TRACK_COLOR } from "../theme/mapColors";

const mapProps = vi.hoisted(() => ({
  api: null as null | { fitBounds: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn>; zoomIn: ReturnType<typeof vi.fn>; zoomOut: ReturnType<typeof vi.fn>; getContainer: () => HTMLElement },
  latest: null as null | {
    cooperativeGestures?: boolean;
    dragPan?: boolean;
    scrollZoom?: boolean;
    onIdle?: () => void;
    onLoad?: (event: { target: Record<string, unknown> }) => void;
  },
  layers: new Map<string, Record<string, unknown>>(),
  sources: [] as unknown[],
  markers: [] as { longitude: number; latitude: number; draggable?: boolean; onDragEnd?: (event: { lngLat: { lat: number; lng: number } }) => void }[],
}));

vi.mock("./activity/NativeActivityPhotoImage", () => ({ NativeActivityPhotoImage: ({nativePhoto,alt}: {nativePhoto:{activityId:string;photoId:string};alt:string}) => <img src="blob:authorized" alt={alt} data-native-reference={`${nativePhoto.activityId}/${nativePhoto.photoId}`} /> }));

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
    onIdle,
  }: {
    children: ReactNode;
    onError?: () => void;
    cooperativeGestures?: boolean;
    dragPan?: boolean;
    scrollZoom?: boolean;
    onIdle?: () => void;
    onLoad?: (event: { target: Record<string, unknown> }) => void;
  }) => {
    mapProps.latest = { cooperativeGestures, dragPan, scrollZoom, onLoad, onIdle };
    return (
      <div data-testid="mock-map" onClick={event => { if (event.target === event.currentTarget) onError?.(); }}>
        {children}
      </div>
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
  Marker: ({ children, onClick, ...props }: { children: ReactNode; onClick?: (event: {originalEvent: MouseEvent}) => void; longitude: number; latitude: number; draggable?: boolean; onDragEnd?: (event: { lngLat: { lat: number; lng: number } }) => void }) => {
    mapProps.markers.push(props);
    return <div data-testid="map-marker" onClick={event => onClick?.({originalEvent:event.nativeEvent})}>{children}</div>;
  },
  Popup: ({ children }: { children: ReactNode }) => <div data-testid="map-popup">{children}</div>,
  useMap: () => ({ current: mapProps.api }),
}));

describe("RouteMap", () => {
  beforeEach(() => {
    mapProps.api = null;
    mapProps.layers.clear();
    mapProps.sources.length = 0;
    mapProps.markers.length = 0;
  });

  it("renders sparse stream coordinates without joining gaps or shifting selection indices", () => {
    const latlng = [[37, 127], [37.01, 127], null, [38, 128], [38.01, 128]] as unknown as [number, number][];
    renderWithProviders(<RouteMap latlng={latlng} highlightRange={{ startIndex: 3, endIndex: 4 }} />);
    const sources = mapProps.sources as { geometry?: { type: string; coordinates: unknown } }[];
    expect(sources[0]?.geometry?.coordinates).toEqual([[[127, 37], [127, 37.01]], [[128, 38], [128, 38.01]]]);
    expect(sources[1]?.geometry?.coordinates).toEqual([[128, 38], [128, 38.01]]);
    expect(latlng).toHaveLength(5);
    expect(latlng[2]).toBeNull();
    fireEvent.click(screen.getByTestId("mock-map"));
    const path = document.querySelector("svg path")?.getAttribute("d") ?? "";
    expect(path.match(/M/g)).toHaveLength(2);
    expect(path.match(/L/g)).toHaveLength(2);
  });

  it("keeps the real chart selection model, power samples and map indices aligned after a GPS gap", () => {
    const streams = routeFixtureStreams();
    expect(streams.time).toEqual([0,1,2,3,4]);
    expect(buildAlignedActivityChartChannels(streams).chartPower).toEqual([100,null,120,130,140]);
    const sampled = buildSampledData(streams);
    const model = { activity: routeFixtureActivity, streams, effectiveStreams: streams, serverMetrics: { metrics: null }, authorizedActivityAccess: true } as unknown as ActivityAnalysisModel;
    function Analysis() {
      const selection = useActivityRangeSelection(model, sampled);
      return <><button onClick={() => selection.selectChart([3,4])}>Select chart range</button><button onClick={() => selection.selectChart([0,4])}>Select across gap</button>
        <output>{JSON.stringify({ range: selection.routeRange, power: sampled.slice(selection.chartRange?.[0] ?? 0, (selection.chartRange?.[1] ?? 4) + 1).map(point => point.power) })}</output>
        <RouteMap latlng={streams.latlng} highlightRange={selection.routeRange} /></>;
    }
    renderWithProviders(<Analysis />);
    expect(screen.getByRole("status")).toHaveTextContent('"power":[100,null,120,130,140]');
    fireEvent.click(screen.getByRole("button", {name:"Select chart range"}));
    expect(screen.getByRole("status")).toHaveTextContent('"range":{"startIndex":3,"endIndex":4},"power":[130,140]');
    expect(mapProps.sources.at(-1)).toMatchObject({geometry:{coordinates:[[127.02,37.02],[127.022,37.022]]}});
    fireEvent.click(screen.getByRole("button", {name:"Select across gap"}));
    expect(screen.getByRole("status")).toHaveTextContent('"range":{"startIndex":0,"endIndex":4},"power":[100,null,120,130,140]');
    expect(mapProps.sources.at(-1)).toMatchObject({geometry:{type:"MultiLineString",coordinates:[[[127,37],[127.002,37.002]],[[127.02,37.02],[127.022,37.022]]]}});
    expect(streams.latlng?.[2]).toBeNull();
    expect(streams.watts).toEqual([100,null,120,130,140]);
  });

  it("returns original source indices when dragging after a missing sample", () => {
    const onChange = vi.fn();
    const latlng = [[37,127], [37.01,127], null, [38,128], [38.01,128]] as unknown as [number,number][];
    renderWithProviders(<RouteMap latlng={latlng} highlightRange={{startIndex:0,endIndex:4}} onHighlightRangeChange={onChange} />);
    act(() => mapProps.markers.find(marker => marker.draggable)?.onDragEnd?.({lngLat:{lat:38,lng:128}}));
    expect(onChange).toHaveBeenCalledWith(3, 4);
  });

  it("does not fit a wholly missing selection or emit invalid hover markers", () => {
    const api = { fitBounds: vi.fn(), resize: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getContainer: () => document.createElement("div") };
    mapProps.api = api;
    const latlng = [[37,127], [37.01,127], null, [38,128], [38.01,128]] as unknown as [number,number][];
    renderWithProviders(<RouteMap latlng={latlng} markerPosition={[NaN,127]} flyToRange={{startIndex:2,endIndex:2}} />);
    expect(api.fitBounds.mock.calls.every(call => JSON.stringify(call[0]) === JSON.stringify([[127,37],[128,38.01]]))).toBe(true); // Full valid bounds only.
    expect(mapProps.sources.some(source => (source as {geometry?:{type:string}}).geometry?.type === "Point")).toBe(false);
  });

  it("recovers all-missing streams with the thumbnail without applying sensor indices", () => {
    renderWithProviders(<RouteMap latlng={[null, {}, null] as unknown as [number,number][]}
      polyline="37,127;37.01,127.01" highlightRange={{startIndex:1,endIndex:2}} />);
    expect(screen.getByTestId("mock-map")).toBeInTheDocument();
    expect(mapProps.sources).toHaveLength(1);
    expect(mapProps.sources[0]).toMatchObject({geometry:{coordinates:[[127,37],[127.01,37.01]]}});
    expect(mapProps.markers).toHaveLength(0);
  });

  it("uses the thumbnail for isolated GPS samples without joining them", () => {
    const latlng = [[37,127], null, [38,128], null, [39,129]] as unknown as [number,number][];
    renderWithProviders(<RouteMap latlng={latlng} polyline="37,127;39,129" highlightRange={{startIndex:0,endIndex:4}} />);
    expect(mapProps.sources[0]).toMatchObject({geometry:{coordinates:[[127,37],[129,39]]}});
    expect(mapProps.sources).toHaveLength(1);
  });

  it("restores the whole thumbnail after a selected stream becomes unavailable with identical bounds", () => {
    const api = { fitBounds: vi.fn(), resize: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getContainer: () => document.createElement("div") };
    mapProps.api = api;
    const latlng = [[37,127], [37.01,127], null, [38,128], [38.01,128]] as unknown as [number,number][];
    const { rerender } = renderWithProviders(<RouteMap latlng={latlng} polyline="37,127;38.01,128" flyToRange={{startIndex:0,endIndex:1}} />);
    expect(api.fitBounds.mock.lastCall?.[0]).toEqual([[127,37],[127,37.01]]);
    rerender(<RouteMap latlng={[null, null] as unknown as [number,number][]} polyline="37,127;38.01,128" flyToRange={{startIndex:0,endIndex:1}} />);
    expect(api.fitBounds.mock.lastCall?.[0]).toEqual([[127,37],[128,38.01]]);
  });

  it("shows the saved route image when only isolated GPS points remain", () => {
    renderWithProviders(<RouteMap latlng={[[37,127], null, [38,128]] as unknown as [number,number][]} fallbackImageUrl="https://example.test/map.png" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.test/map.png");
    expect(screen.queryByTestId("mock-map")).not.toBeInTheDocument();
  });

  it("never bridges an invalid Orider thumbnail entry", () => {
    renderWithProviders(<RouteMap latlng={[null] as unknown as [number,number][]} polyline="37,127;37.01,127;broken;38,128;38.01,128" />);
    expect(mapProps.sources[0]).toMatchObject({geometry:{type:"MultiLineString",coordinates:[[[127,37],[127,37.01]],[[128,38],[128,38.01]]]}});
  });

  it.each([{}, "_p~iF~ps|U_ulL"])("recovers malformed thumbnail input %s with the saved map", polyline => {
    renderWithProviders(<RouteMap latlng={[null] as unknown as [number,number][]} polyline={polyline as string} fallbackImageUrl="https://example.test/map.png" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.test/map.png");
    expect(screen.queryByTestId("mock-map")).not.toBeInTheDocument();
  });

  it("fits only the rendered line, excluding distant isolated fixes", () => {
    const api = { fitBounds: vi.fn(), resize: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getContainer: () => document.createElement("div") };
    mapProps.api = api;
    renderWithProviders(<RouteMap latlng={[[37,127],[37.01,127],null,[80,170]] as unknown as [number,number][]} flyToRange={{startIndex:0,endIndex:3}} />);
    expect(api.fitBounds.mock.calls.every(call => JSON.stringify(call[0]) === JSON.stringify([[127,37],[127,37.01]]))).toBe(true);
  });

  it("keeps measured endpoint navigation and explains that isolated GPS has no route line", () => {
    renderWithProviders(<RouteMap latlng={[[37,127],null,[38,128]] as unknown as [number,number][]} showRouteEndpoints />);
    expect(screen.getByTestId("mock-map")).toBeInTheDocument();
    expect(screen.getByText(/경로 데이터 없음|No route data/)).toBeInTheDocument();
  });

  it.each([
    { range: {startIndex:0,endIndex:3}, expected: [[127,37],[127,37.01]] },
    { range: {startIndex:1,endIndex:4}, expected: [[170,80],[170,80.01]] },
  ])("fits the selected lines without neighbouring isolated boundary samples: $range", ({range, expected}) => {
    const api = { fitBounds: vi.fn(), resize: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getContainer: () => document.createElement("div") };
    mapProps.api = api;
    renderWithProviders(<RouteMap latlng={[[37,127],[37.01,127],null,[80,170],[80.01,170]] as unknown as [number,number][]} flyToRange={range} highlightRange={range} />);
    expect(api.fitBounds.mock.lastCall?.[0]).toEqual(expected);
  });

  it("fits selections using explicit part boundaries as well as GPS gaps", () => {
    const api = { fitBounds: vi.fn(), resize: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getContainer: () => document.createElement("div") };
    mapProps.api = api;
    renderWithProviders(<RouteMap routeParts={[[[37,127],[37.01,127]],[[80,170],[80.01,170]]]} flyToRange={{startIndex:0,endIndex:2}} />);
    expect(api.fitBounds.mock.lastCall?.[0]).toEqual([[127,37],[127,37.01]]);
  });

  it("still fits a valid single-sample location", () => {
    const api = { fitBounds: vi.fn(), resize: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getContainer: () => document.createElement("div") };
    mapProps.api = api;
    renderWithProviders(<RouteMap latlng={[[37,127],[37.01,127]]} flyToRange={{startIndex:1,endIndex:1}} />);
    expect(api.fitBounds.mock.lastCall?.[0]).toEqual([[127,37.01],[127,37.01]]);
  });

  it("restores full context when a new selection contains no drawable line", () => {
    const api = { fitBounds: vi.fn(), resize: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getContainer: () => document.createElement("div") };
    mapProps.api = api;
    const latlng = [[37,127],[37.01,127],null,[80,170],[80.01,170]] as unknown as [number,number][];
    const { rerender } = renderWithProviders(<RouteMap latlng={latlng} flyToRange={{startIndex:0,endIndex:1}} />);
    expect(api.fitBounds.mock.lastCall?.[0]).toEqual([[127,37],[127,37.01]]);
    rerender(<RouteMap latlng={latlng} flyToRange={{startIndex:1,endIndex:3}} />);
    expect(api.fitBounds.mock.lastCall?.[0]).toEqual([[127,37],[170,80.01]]);
  });

  it("retains isolated measured fixes for single-point navigation and draggable boundaries", () => {
    const api = { fitBounds: vi.fn(), resize: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getContainer: () => document.createElement("div") };
    mapProps.api = api;
    const onChange = vi.fn();
    const latlng = [[37,127],[37.01,127],null,[60,150],null,[80,170],[80.01,170]] as unknown as [number,number][];
    renderWithProviders(<RouteMap latlng={latlng} flyToRange={{startIndex:3,endIndex:3}} highlightRange={{startIndex:3,endIndex:3}} onHighlightRangeChange={onChange} />);
    expect(api.fitBounds.mock.lastCall?.[0]).toEqual([[150,60],[150,60]]);
    const handles = mapProps.markers.filter(marker => marker.draggable);
    expect(handles).toHaveLength(2);
    expect(handles.every(marker => marker.latitude === 60 && marker.longitude === 150)).toBe(true);
    act(() => handles[0]!.onDragEnd?.({lngLat:{lat:60,lng:150}}));
    expect(onChange).toHaveBeenCalledWith(3,3);
  });

  it("can navigate to a single-point part without using it to fit the route line", () => {
    const api = { fitBounds: vi.fn(), resize: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getContainer: () => document.createElement("div") };
    mapProps.api = api;
    renderWithProviders(<RouteMap routeParts={[[[60,150]],[[37,127],[37.01,127]]]} flyToRange={{startIndex:0,endIndex:0}} showRouteEndpoints />);
    expect(api.fitBounds.mock.calls[0]?.[0]).toEqual([[127,37],[150,60]]);
    expect(api.fitBounds.mock.lastCall?.[0]).toEqual([[150,60],[150,60]]);
    expect(mapProps.sources.some(source => (source as {features?: {geometry:{coordinates:number[]}}[]}).features?.[0]?.geometry.coordinates[0] === 150)).toBe(true);
  });

  it("keeps photo location navigation available when only one GPS fix exists", () => {
    const api = { fitBounds: vi.fn(), flyTo: vi.fn(), resize: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getContainer: () => document.createElement("div") };
    mapProps.api = api;
    renderWithProviders(<RouteMap latlng={[[37,127]]} photos={[{id:"photo",url:"https://example.test/photo.jpg",location:[38,128]}]} flyToPosition={[38,128]} />);
    expect(screen.getByTestId("mock-map")).toBeInTheDocument();
    expect(mapProps.markers).toContainEqual(expect.objectContaining({latitude:38,longitude:128}));
    expect(api.flyTo).toHaveBeenCalledWith(expect.objectContaining({center:[128,38]}));
  });

  it("retains measured point markers and navigation when the line comes from a thumbnail", () => {
    const api = { fitBounds: vi.fn(), resize: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getContainer: () => document.createElement("div") };
    mapProps.api = api;
    const onChange = vi.fn();
    renderWithProviders(<RouteMap latlng={[[60,150],null] as unknown as [number,number][]} polyline="37,127;37.01,127"
      markerPosition={[60,150]} flyToRange={{startIndex:0,endIndex:0}} highlightRange={{startIndex:0,endIndex:0}} onHighlightRangeChange={onChange} />);
    expect(api.fitBounds.mock.lastCall?.[0]).toEqual([[150,60],[150,60]]);
    expect(mapProps.sources).toContainEqual(expect.objectContaining({geometry:{type:"Point",coordinates:[150,60]}}));
    expect(mapProps.sources[0]).toMatchObject({geometry:{coordinates:[[127,37],[127,37.01]]}});
    const handles = mapProps.markers.filter(marker => marker.draggable);
    expect(handles).toHaveLength(2);
    act(() => handles[0]!.onDragEnd?.({lngLat:{lat:60,lng:150}}));
    expect(onChange).toHaveBeenCalledWith(0,0);
  });

  it("shows endpoints for single-fix parts without connecting them", () => {
    const api = { fitBounds: vi.fn(), resize: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getContainer: () => document.createElement("div") };
    mapProps.api = api;
    renderWithProviders(<RouteMap routeParts={[[[37,127]],[[38,128]]]} showRouteEndpoints />);
    expect(screen.getByTestId("mock-map")).toBeInTheDocument();
    expect(screen.getByText(/경로 데이터 없음|No route data/)).toBeInTheDocument();
    expect(api.fitBounds.mock.calls[0]?.[0]).toEqual([[127,37],[128,38]]);
    expect(mapProps.sources[0]).toMatchObject({geometry:{coordinates:[]}});
    expect(mapProps.sources.some(source => (source as {features?:unknown[]}).features?.length === 2)).toBe(true);
  });

  it("does not open an empty map for isolated fixes without any requested markers", () => {
    renderWithProviders(<RouteMap latlng={[[37,127],null,[38,128]] as unknown as [number,number][]} />);
    expect(screen.queryByTestId("mock-map")).not.toBeInTheDocument();
    expect(screen.getByText(/경로 데이터 없음|No route data/)).toBeInTheDocument();
  });

  it("keeps all-invalid coordinates out of Mapbox and recovers on a valid activity", () => {
    const invalid = [null, {}, [NaN, 127], [91, 127], [37, Infinity], [37], ["37", 127]] as unknown as [number, number][];
    const { rerender } = renderWithProviders(<RouteMap latlng={invalid} />);
    expect(screen.queryByTestId("mock-map")).not.toBeInTheDocument();
    rerender(<RouteMap latlng={[[37, 127], [38, 128]]} />);
    expect(screen.getByTestId("mock-map")).toBeInTheDocument();
  });

  it("renders a saved map image without route positions", () => {
    renderWithProviders(<RouteMap fallbackImageUrl="https://example.test/route.png" />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "https://example.test/route.png");
    expect(screen.queryByText("No route data")).not.toBeInTheDocument();
  });

  it("keeps multipart routes and crossing highlights separate in the map and fallback", () => {
    renderWithProviders(<RouteMap routeParts={[[[37,127],[37.01,127]],[[38,128],[38.01,128]]]} highlightRange={{startIndex:0,endIndex:3}}/>);
    const sources=mapProps.sources as {geometry?:{type:string;coordinates:unknown}}[];
    expect(sources.filter(source=>source.geometry?.type==="MultiLineString")).toHaveLength(2);
    expect(sources.find(source=>source.geometry?.type==="MultiLineString")?.geometry?.coordinates).toEqual([[[127,37],[127,37.01]],[[128,38],[128,38.01]]]);
    fireEvent.click(screen.getByTestId("mock-map"));
    const path=document.querySelector("svg path")?.getAttribute("d")??"";
    expect(path.match(/M/g)).toHaveLength(2);expect(path.match(/L/g)).toHaveLength(2);
    expect(document.querySelector("svg")).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
  });

  it("opts into zoom/fit controls and resizes without refitting an active interval or remounting", () => {
    const container = document.createElement("div");
    const api = { fitBounds: vi.fn(), resize: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), getContainer: () => container };
    mapProps.api = api;
    let resize: ResizeObserverCallback = () => {};
    const observe = vi.fn(), disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class { constructor(callback: ResizeObserverCallback) { resize = callback; } observe = observe; disconnect = disconnect; });
    try {
      const props = { polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@", interactive: true, flyToRange: { startIndex: 0, endIndex: 1 },
        navigationLabels: { zoomIn: "Zoom in", zoomOut: "Zoom out", fitRoute: "Show entire route" } };
      const { rerender, unmount } = renderWithProviders(<RouteMap {...props} height="normal" />);
      const map = screen.getByTestId("mock-map");
      expect(observe).toHaveBeenCalledWith(container);
      const initialFits = api.fitBounds.mock.calls.length;
      rerender(<RouteMap {...props} height="large" />);
      act(() => resize([], {} as ResizeObserver));
      expect(api.resize).toHaveBeenCalledTimes(1);
      expect(api.fitBounds).toHaveBeenCalledTimes(initialFits);
      expect(screen.getByTestId("mock-map")).toBe(map);
      fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
      expect(api.zoomIn).toHaveBeenCalledTimes(1);
      expect(api.zoomOut).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Show entire route" }));
      expect(api.fitBounds).toHaveBeenCalledTimes(initialFits + 1);
      unmount();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });

  it("keeps navigation controls absent for other map consumers", () => {
    renderWithProviders(<RouteMap polyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@" interactive />);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("keeps its loading placeholder until basemap idle and exposes the error fallback", () => {
    const { queryByTestId } = renderWithProviders(
      <RouteMap polyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@" loadingPlaceholder={<div data-testid="map-loading" />} />,
    );
    expect(queryByTestId("map-loading")).toBeInTheDocument();
    act(() => mapProps.latest?.onIdle?.());
    expect(queryByTestId("map-loading")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("mock-map"));
    expect(queryByTestId("map-loading")).not.toBeInTheDocument();
    expect(queryByTestId("mock-map")).not.toBeInTheDocument();
    expect(document.querySelector("[data-route-fallback-badge]")).toBeInTheDocument();
  });

  it("exposes the route fallback when the map fails before idle", () => {
    const { queryByTestId } = renderWithProviders(
      <RouteMap polyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@" loadingPlaceholder={<div data-testid="map-loading" />} />,
    );
    expect(queryByTestId("map-loading")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("mock-map"));
    expect(queryByTestId("map-loading")).not.toBeInTheDocument();
    expect(document.querySelector("[data-route-fallback-badge]")).toBeInTheDocument();
  });

  it("preserves ready basemaps on fallback URL changes and waits for idle after route changes", () => {
    const props = { polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@", loadingPlaceholder: <div data-testid="map-loading" /> };
    const { queryByTestId, rerender } = renderWithProviders(<RouteMap {...props} />);
    act(() => mapProps.latest?.onIdle?.());
    rerender(<RouteMap {...props} fallbackImageUrl="https://example.test/map.webp" />);
    expect(queryByTestId("map-loading")).not.toBeInTheDocument();
    rerender(<RouteMap {...props} polyline="37.5665,126.9780;37.5670,126.9790" />);
    expect(queryByTestId("map-loading")).toBeInTheDocument();
    act(() => mapProps.latest?.onIdle?.());
    expect(queryByTestId("map-loading")).not.toBeInTheDocument();
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
    expect(screen.getByText("경로 미리보기")).toBeInTheDocument();
    const badge = document.querySelector("[data-route-fallback-badge]");
    expect(badge).toHaveClass("absolute", "bottom-2", "left-2");
    expect(screen.getByText("지도를 사용할 수 없어 경로 선만 표시합니다.")).toHaveClass("sr-only");

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

    expect(screen.getByText("경로 미리보기")).toBeInTheDocument();
    expect(screen.getByText("지도를 사용할 수 없어 경로 선만 표시합니다.")).toBeInTheDocument();
  });
});

it("passes native references to marker and popup, then drops a removed selected photo", () => {
 const reference={activityId:"ride",photoId:"native"};
 const photos=[{id:"photo",url:"",nativePhoto:reference,location:[37,127] as [number,number],caption:"Native marker"}];
 const view=renderWithProviders(<RouteMap latlng={[[37,127],[37.01,127.01]]} photos={photos} />);
 expect(screen.getByRole("img",{name:"Native marker"})).toHaveAttribute("data-native-reference","ride/native");
 fireEvent.click(screen.getByTestId("map-marker"));
 expect(screen.getByTestId("map-popup")).toBeInTheDocument(); expect(screen.getAllByRole("img",{name:"Native marker"})).toHaveLength(2);
 view.rerender(<RouteMap latlng={[[37,127],[37.01,127.01]]} photos={[]} />);
 expect(screen.queryByTestId("map-popup")).toBeNull(); expect(screen.queryByRole("img",{name:"Native marker"})).toBeNull();
});
