import { getRuntimeConfig } from "../services/runtimeConfig";

const DEFAULT_SEGMENT_TILES_BASE =
  "https://storage.googleapis.com/miranae-orider-g1.firebasestorage.app/segments/tiles";

export const SEGMENT_TILES_BASE =
  (getRuntimeConfig().segmentTilesBase || DEFAULT_SEGMENT_TILES_BASE).replace(/\/+$/, "");

export function segmentTileUrl(path: string): string {
  const cleanPath = path.replace(/^\/+/, "");
  const base = (getRuntimeConfig().segmentTilesBase || SEGMENT_TILES_BASE).replace(/\/+$/, "");
  return `${base}/${cleanPath}`;
}
