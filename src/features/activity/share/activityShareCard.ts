import { saveAs } from "file-saver";

export interface ActivityShareMetric {
  label: string;
  value: string;
  unit?: string;
}

export interface ActivityShareElevationPoint {
  distance: number;
  elevation: number;
}

export interface ActivityShareWeather {
  temperature?: number;
  feelsLike?: number;
  humidity?: number;
  windSpeed?: number;
  windDirection?: number;
  weatherCode?: number;
}

export interface ActivityShareCardInput {
  title: string;
  athlete: string;
  sport: string;
  date: string;
  distance: string;
  duration: string;
  elevation: string;
  distanceLabel: string;
  durationLabel: string;
  elevationLabel: string;
  elevationProfileLabel: string;
  performanceLabel: string;
  footer: string;
  routeImageUrl?: string | null;
  backgroundImageUrl?: string | null;
  includeRouteImage: boolean;
  performanceMetrics?: ActivityShareMetric[];
  elevationProfile?: ActivityShareElevationPoint[];
  weather?: ActivityShareWeather;
}

const IMAGE_TIMEOUT_MS = 8_000;
const WIDTH = 1080;
const HEIGHT = 600;
const MAP_HEIGHT = 600;
const MAX_ELEVATION_POINTS = 240;
const RIGHT_RAIL_X = WIDTH * 0.7;
const RIGHT_RAIL_LEFT = RIGHT_RAIL_X + 18;
const RIGHT_RAIL_RIGHT = WIDTH - 24;
const RIGHT_RAIL_WIDTH = RIGHT_RAIL_RIGHT - RIGHT_RAIL_LEFT;

function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(null);
    const image = new Image();
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    const abort = () => {
      image.src = "";
      finish(null);
    };
    const timeout = window.setTimeout(() => {
      image.src = "";
      finish(null);
    }, IMAGE_TIMEOUT_MS);
    image.crossOrigin = "anonymous";
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    signal?.addEventListener("abort", abort, { once: true });
    image.src = url;
  });
}

async function loadFirstImage(urls: Array<string | null | undefined>, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  for (const url of urls) {
    if (!url || signal?.aborted) continue;
    const image = await loadImage(url, signal);
    if (image) return image;
  }
  return null;
}

function boundedText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && ctx.measureText(`${text.slice(0, end).trimEnd()}…`).width > maxWidth) end -= 1;
  return end > 0 ? `${text.slice(0, end).trimEnd()}…` : "…";
}

function drawContainedImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement): void {
  const scale = Math.min(WIDTH / image.naturalWidth, MAP_HEIGHT / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.drawImage(image, (WIDTH - width) / 2, (MAP_HEIGHT - height) / 2, width, height);
}

function weatherLines(weather: ActivityShareWeather | undefined): string[] {
  if (!weather) return [];
  const code = weather.weatherCode;
  const icon = code == null ? "◌" : code <= 1 ? "☀︎" : code <= 3 ? "☁︎" : code <= 48 ? "≋" : code <= 67 ? "☂︎" : code <= 77 ? "❄︎" : code <= 82 ? "☂︎" : "ϟ";
  const temperature = [
    Number.isFinite(weather.temperature) ? `${icon} ${Math.round(weather.temperature!)}°C` : "",
    Number.isFinite(weather.feelsLike) ? `≈ ${Math.round(weather.feelsLike!)}°C` : "",
  ].filter(Boolean).join("  ·  ");
  const direction = Number.isFinite(weather.windDirection)
    ? ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(weather.windDirection! / 45) % 8]
    : "↗";
  const conditions = [
    Number.isFinite(weather.humidity) ? `RH ${Math.round(weather.humidity!)}%` : "",
    Number.isFinite(weather.windSpeed) ? `${direction} ${weather.windSpeed!.toFixed(1)} m/s` : "",
  ].filter(Boolean).join("  ·  ");
  return [temperature, conditions].filter(Boolean);
}

function normalizedElevationProfile(points: ActivityShareElevationPoint[] | undefined): ActivityShareElevationPoint[] {
  const valid = (points ?? []).filter((point) => Number.isFinite(point.distance) && Number.isFinite(point.elevation));
  if (valid.length <= MAX_ELEVATION_POINTS) return valid;
  const minIndex = valid.reduce((best, point, index) => point.elevation < valid[best]!.elevation ? index : best, 0);
  const maxIndex = valid.reduce((best, point, index) => point.elevation > valid[best]!.elevation ? index : best, 0);
  const indexes = new Set([minIndex, maxIndex]);
  Array.from({ length: MAX_ELEVATION_POINTS - 2 }, (_, index) =>
    indexes.add(Math.round(index * (valid.length - 1) / (MAX_ELEVATION_POINTS - 3))),
  );
  return [...indexes].sort((a, b) => a - b).map((index) => valid[index]!);
}

/** Strava 수준의 지도와 O-Rider 훈련 상태를 함께 담는 고정형 PNG 포스터. */
export async function drawActivityShareCard(input: ActivityShareCardInput, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const font = "Pretendard, Inter, system-ui, sans-serif";
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  const bg = "#071311";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const image = input.includeRouteImage
    ? await loadFirstImage([input.routeImageUrl, input.backgroundImageUrl], signal)
    : null;
  if (image) {
    ctx.fillStyle = "#dce8e3";
    ctx.fillRect(0, 0, WIDTH, MAP_HEIGHT);
    drawContainedImage(ctx, image);
  } else {
    const mapFallback = ctx.createLinearGradient(0, 0, WIDTH, MAP_HEIGHT);
    mapFallback.addColorStop(0, "#17695d");
    mapFallback.addColorStop(1, "#0a2824");
    ctx.fillStyle = mapFallback;
    ctx.fillRect(0, 0, WIDTH, MAP_HEIGHT);
  }
  const elevationProfile = normalizedElevationProfile(input.elevationProfile);

  ctx.shadowColor = "rgba(0,0,0,.9)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 14px ${mono}`;
  ctx.fillText("O·RIDER", RIGHT_RAIL_LEFT, 28);
  ctx.font = `700 10px ${mono}`;
  weatherLines(input.weather).forEach((line, index) =>
    ctx.fillText(boundedText(ctx, line, RIGHT_RAIL_WIDTH), RIGHT_RAIL_LEFT, 48 + index * 15),
  );

  ctx.font = `600 10px ${font}`;
  ctx.fillText(boundedText(ctx, `${input.sport} · ${input.date}`, RIGHT_RAIL_WIDTH), RIGHT_RAIL_LEFT, 88);
  ctx.font = `800 20px ${font}`;
  ctx.fillText(boundedText(ctx, input.title, RIGHT_RAIL_WIDTH), RIGHT_RAIL_LEFT, 114);
  ctx.font = `500 10px ${font}`;
  ctx.fillText(boundedText(ctx, input.athlete, RIGHT_RAIL_WIDTH), RIGHT_RAIL_LEFT, 132);

  const metrics = (input.performanceMetrics ?? []).filter((metric) => metric.value).slice(0, 6);
  if (metrics.length > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 8px ${font}`;
    ctx.fillText(boundedText(ctx, input.performanceLabel, RIGHT_RAIL_WIDTH), RIGHT_RAIL_LEFT, 158);
    metrics.forEach((metric, index) => {
      const x = RIGHT_RAIL_LEFT + (index % 2) * 145;
      const y = 178 + Math.floor(index / 2) * 37;
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 8px ${font}`;
      ctx.fillText(boundedText(ctx, metric.label, 132), x, y);
      ctx.font = `800 12px ${mono}`;
      const value = metric.unit ? `${metric.value} ${metric.unit}` : metric.value;
      ctx.fillText(boundedText(ctx, value, 132), x, y + 14);
    });
  }

  const primaryStats: Array<readonly [string, string]> = [
    [input.distance, input.distanceLabel],
    [input.duration, input.durationLabel],
    [input.elevation, input.elevationLabel],
  ];
  primaryStats.forEach(([value, label], index) => {
    const x = RIGHT_RAIL_LEFT + index * 94;
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 14px ${mono}`;
    ctx.fillText(boundedText(ctx, value, 86), x, 306);
    ctx.font = `600 8px ${font}`;
    ctx.fillText(boundedText(ctx, label, 86), x, 320);
  });
  if (elevationProfile.length >= 2) {
    ctx.font = `700 9px ${font}`;
    ctx.fillText(boundedText(ctx, `${input.elevationProfileLabel} · ${input.elevationLabel} ${input.elevation}`, RIGHT_RAIL_WIDTH), RIGHT_RAIL_LEFT, 350);
  }
  ctx.font = `500 10px ${font}`;
  ctx.fillText(boundedText(ctx, input.footer, RIGHT_RAIL_WIDTH), RIGHT_RAIL_LEFT, 520);
  ctx.font = `600 9px ${mono}`;
  ctx.fillText("orider.co.kr", RIGHT_RAIL_LEFT, 540);
  if (image) {
    ctx.font = `500 8px ${font}`;
    ctx.fillText("© Mapbox · © OpenStreetMap", RIGHT_RAIL_LEFT, 558);
  }
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const plot = { left: 32, right: 332, top: 500, bottom: 548 };
  if (elevationProfile.length >= 2) {
    const distances = elevationProfile.map((point) => point.distance);
    const elevations = elevationProfile.map((point) => point.elevation);
    const minDistance = Math.min(...distances);
    const distanceRange = Math.max(1, Math.max(...distances) - minDistance);
    const minElevation = Math.min(...elevations);
    const maxElevation = Math.max(...elevations);
    const elevationDelta = maxElevation - minElevation;
    const elevationRange = Math.max(1, elevationDelta);
    const isFlat = elevationDelta < 0.5;
    const coordinates = elevationProfile.map((point) => ({
      x: plot.left + ((point.distance - minDistance) / distanceRange) * (plot.right - plot.left),
      y: isFlat ? (plot.top + plot.bottom) / 2 : plot.bottom - ((point.elevation - minElevation) / elevationRange) * (plot.bottom - plot.top),
    }));
    const chartFill = ctx.createLinearGradient(0, plot.top, 0, plot.bottom);
    chartFill.addColorStop(0, "rgba(35,213,167,.12)");
    chartFill.addColorStop(1, "rgba(35,213,167,.01)");
    ctx.beginPath();
    ctx.moveTo(coordinates[0]!.x, plot.bottom);
    coordinates.forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.lineTo(coordinates[coordinates.length - 1]!.x, plot.bottom);
    ctx.closePath();
    ctx.fillStyle = chartFill;
    ctx.fill();
    ctx.beginPath();
    coordinates.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = "rgba(35,213,167,.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function downloadShareCard(blob: Blob, filename: string): void {
  saveAs(blob, filename);
}
