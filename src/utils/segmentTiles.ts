import { getRuntimeConfig } from "../services/runtimeConfig";

function tileBase(): string {
  const config = getRuntimeConfig();
  const bucket = config.firebaseStorageBucket || (config.firebaseProjectId
    ? `${config.firebaseProjectId}.firebasestorage.app` : "miranae-orider-g1.firebasestorage.app");
  return (config.segmentTilesBase || `https://storage.googleapis.com/${bucket}/segments/tiles`).replace(/\/+$/, "");
}

export const SEGMENT_TILES_BASE = tileBase();

export function segmentTileUrl(path: string): string {
  return `${tileBase()}/${path.replace(/^\/+/, "")}`;
}
