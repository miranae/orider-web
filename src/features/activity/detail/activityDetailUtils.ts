export type SportCategory = "ride" | "run" | "swim" | "other";

export function getSportCategory(type?: string | null): SportCategory {
  if (!type) return "other";
  const t = type.toLowerCase();
  if (t.includes("ride") || t.includes("cycling") || t === "velolift") return "ride";
  if (t.includes("run") || t === "walk" || t === "hike") return "run";
  if (t.includes("swim")) return "swim";
  return "other";
}

export function formatPace(kmh: number): string {
  if (kmh <= 0) return "-";
  const minPerKm = 60 / kmh;
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}'${secs.toString().padStart(2, "0")}"`;
}

export function formatSwimPace(kmh: number): string {
  if (kmh <= 0) return "-";
  const minPer100m = 60 / kmh / 10;
  const mins = Math.floor(minPer100m);
  const secs = Math.round((minPer100m - mins) * 60);
  return `${mins}'${secs.toString().padStart(2, "0")}"`;
}

export function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function isStreamNotCachedError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "functions/not-found") return true;
  const msg = err instanceof Error ? err.message : "";
  return /not yet available/i.test(msg);
}

export interface SegmentEffortData {
  id: number;
  name: string;
  elapsedTime: number;
  movingTime: number;
  distance: number;
  startIndex: number;
  endIndex: number;
  averageWatts: number | null;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  averageCadence: number | null;
  prRank: number | null;
  komRank: number | null;
  achievements: { type_id: number; type: string; rank: number }[];
  segment: {
    id: number;
    name: string;
    distance: number;
    averageGrade: number;
    maximumGrade: number;
    elevationHigh: number;
    elevationLow: number;
    climbCategory: number;
    starred: boolean;
  };
}

export interface SampledPoint {
  latlng: [number, number] | null;
  distance: number;
  altitude: number;
  speed: number;
  heartRate: number;
  power: number;
  cadence: number;
}

export interface OverlayConfig {
  key: string;
  label: string;
  unit: string;
  color: string;
  dotColor: string;
  yAxisID: string;
  getValue: (d: SampledPoint) => number;
}

export const OVERLAY_CONFIGS: OverlayConfig[] = [
  { key: "speed", label: "speed", unit: "km/h", color: "var(--chart-speed)", dotColor: "var(--chart-speed)", yAxisID: "ySpeed", getValue: (d) => d.speed },
  { key: "hr", label: "hr", unit: "bpm", color: "var(--chart-heart-rate)", dotColor: "var(--chart-heart-rate)", yAxisID: "yHR", getValue: (d) => d.heartRate },
  { key: "power", label: "power", unit: "W", color: "var(--chart-power)", dotColor: "var(--chart-power)", yAxisID: "yPower", getValue: (d) => d.power },
  { key: "cadence", label: "cadence", unit: "rpm", color: "var(--chart-cadence)", dotColor: "var(--chart-cadence)", yAxisID: "yCadence", getValue: (d) => d.cadence },
];

export function resolveCssColor(value: string): string {
  const match = value.match(/^var\((--[^)]+)\)$/);
  if (!match || typeof window === "undefined") return value;
  return getComputedStyle(document.documentElement).getPropertyValue(match[1]!).trim() || value;
}
