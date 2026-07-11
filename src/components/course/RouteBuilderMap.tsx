import { Layer, Marker, Source } from "react-map-gl/mapbox";
import Map from "react-map-gl/mapbox";
import { DEFAULT_VIEW, MAP_STYLE, applyKoreaCyclingStyle, getMapboxToken } from "../../utils/mapbox";
import type { Waypoint } from "../../features/courseBuilder/routeBuilder";

export default function RouteBuilderMap({ waypoints, route, onAdd, labels }: { waypoints: Waypoint[]; route: [number, number][]; onAdd: (point: Waypoint) => void; labels: { region: string; unavailable: string; waypoint: string } }) {
  const token = getMapboxToken();
  if (!token) return <div role="status" className="h-96 grid place-items-center bg-[var(--bg-1)] text-[var(--ink-3)]">{labels.unavailable}</div>;
  const geojson = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: route } };
  return <div role="region" aria-label={labels.region} className="h-96 overflow-hidden rounded-[var(--r-lg)]">
    <Map mapboxAccessToken={token} mapStyle={MAP_STYLE} initialViewState={DEFAULT_VIEW} onLoad={(e) => applyKoreaCyclingStyle(e.target)} onClick={(e) => onAdd({ lat: e.lngLat.lat, lng: e.lngLat.lng })} dragRotate={false} attributionControl={false} style={{ width: "100%", height: "100%" }}>
      {route.length > 1 && <Source type="geojson" data={geojson}><Layer type="line" paint={{ "line-color": "#F97316", "line-width": 5 }} /></Source>}
      {waypoints.map((point, index) => <Marker key={`${point.lat}:${point.lng}:${index}`} latitude={point.lat} longitude={point.lng}><span aria-label={`${labels.waypoint} ${index + 1}`} className="grid h-7 w-7 place-items-center rounded-full bg-[var(--lime)] font-bold text-[var(--bg-0)]">{index + 1}</span></Marker>)}
    </Map>
  </div>;
}
