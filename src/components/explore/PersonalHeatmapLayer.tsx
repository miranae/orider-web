import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { PersonalHeatPoint } from "../../features/explore/personalHeatmap";

export default function PersonalHeatmapLayer({ points }: { points: PersonalHeatPoint[] }) {
  const geojson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: points.map((point) => ({
      type: "Feature" as const,
      properties: { weight: point.weight },
      geometry: { type: "Point" as const, coordinates: [point.lng, point.lat] },
    })),
  }), [points]);

  return <Source id="personal-heatmap" type="geojson" data={geojson}>
    <Layer id="personal-heatmap-layer" type="heatmap" paint={{
      "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 1, 0.25, 10, 1],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 5, 1, 15, 3],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 5, 8, 12, 18, 16, 30],
      "heatmap-opacity": 0.72,
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"], 0, "rgba(0,0,0,0)", 0.25, "#06b6d4", 0.6, "#A3E635", 1, "#f97316"],
    }} />
  </Source>;
}
