const DEFAULT_SEGMENT_TILES_BASE =
  "https://storage.googleapis.com/miranae-orider-g1.firebasestorage.app/segments/tiles";

export const SEGMENT_TILES_BASE =
  (import.meta.env.VITE_SEGMENT_TILES_BASE || DEFAULT_SEGMENT_TILES_BASE).replace(/\/+$/, "");

export function segmentTileUrl(path: string): string {
  const cleanPath = path.replace(/^\/+/, "");
  return `${SEGMENT_TILES_BASE}/${cleanPath}`;
}
