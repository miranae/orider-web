import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import { EXPLORATION_GRID_ZOOM, tileToLngLatBounds, type VisitedTileCell } from "../../features/explore/explorationGrid";

/** 방문한 z14 타일을 반투명 사각형으로 지도에 오버레이(#363). */
export default function ExplorationGridLayer({ tiles }: { tiles: VisitedTileCell[] }) {
  const geojson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: tiles.map(({ x, y }) => {
      const { west, south, east, north } = tileToLngLatBounds(x, y, EXPLORATION_GRID_ZOOM);
      return {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "Polygon" as const,
          coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
        },
      };
    }),
  }), [tiles]);

  return <Source id="exploration-grid" type="geojson" data={geojson}>
    <Layer id="exploration-grid-fill" type="fill" paint={{ "fill-color": "#A3E635", "fill-opacity": 0.22 }} />
    <Layer id="exploration-grid-line" type="line" paint={{ "line-color": "#A3E635", "line-width": 1, "line-opacity": 0.5 }} />
  </Source>;
}
