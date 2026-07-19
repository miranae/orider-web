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
const ORIDER_BRAND = "#008986";
const ORIDER_BRAND_DARK = "#006F6C";
const ORIDER_BRAND_LIGHT = "#4FD5D1";
const KOREAN_MAP_STYLE_ID = "orider/cmp9okm6p006c01snfd3dexqb";
const KOREAN_MAP_FILTER = "saturate(2) brightness(.91) hue-rotate(-12deg) contrast(1.08)";

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

interface LoadedImage {
  image: HTMLImageElement;
  url: string;
}

async function loadFirstImage(urls: Array<string | null | undefined>, signal?: AbortSignal): Promise<LoadedImage | null> {
  for (const url of urls) {
    if (!url || signal?.aborted) continue;
    const image = await loadImage(url, signal);
    if (image) return { image, url };
  }
  return null;
}

function boundedText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && ctx.measureText(`${text.slice(0, end).trimEnd()}…`).width > maxWidth) end -= 1;
  return end > 0 ? `${text.slice(0, end).trimEnd()}…` : "…";
}

function drawContainedImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, filter = "none"): void {
  const scale = Math.min(WIDTH / image.naturalWidth, MAP_HEIGHT / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const previousFilter = ctx.filter;
  ctx.filter = filter;
  ctx.drawImage(image, (WIDTH - width) / 2, (MAP_HEIGHT - height) / 2, width, height);
  ctx.filter = previousFilter;
}

function drawOriderMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.fillStyle = ORIDER_BRAND;
  ctx.fillRect(x, y, size, size);
  ctx.beginPath();
  ctx.moveTo(x + size * 0.16, y + size * 0.72);
  ctx.lineTo(x + size * 0.37, y + size * 0.39);
  ctx.lineTo(x + size * 0.52, y + size * 0.56);
  ctx.lineTo(x + size * 0.69, y + size * 0.32);
  ctx.lineTo(x + size * 0.84, y + size * 0.72);
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = size * 0.16;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
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

  const loadedImage = input.includeRouteImage
    ? await loadFirstImage([input.routeImageUrl, input.backgroundImageUrl], signal)
    : null;
  const image = loadedImage?.image ?? null;
  if (image) {
    ctx.fillStyle = "#dce8e3";
    ctx.fillRect(0, 0, WIDTH, MAP_HEIGHT);
    const mapFilter = loadedImage?.url.includes(KOREAN_MAP_STYLE_ID) ? KOREAN_MAP_FILTER : "none";
    drawContainedImage(ctx, image, mapFilter);
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
  ctx.textAlign = "left";
  ctx.font = `800 14px ${mono}`;
  drawOriderMark(ctx, 24, 15, 14);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText("O·RIDER", 44, 28);
  ctx.textAlign = "right";
  ctx.font = `700 10px ${mono}`;
  weatherLines(input.weather).forEach((line, index) =>
    ctx.fillText(boundedText(ctx, line, RIGHT_RAIL_WIDTH), RIGHT_RAIL_RIGHT, 48 + index * 15),
  );

  ctx.font = `600 10px ${font}`;
  ctx.fillText(boundedText(ctx, `${input.sport} · ${input.date}`, RIGHT_RAIL_WIDTH), RIGHT_RAIL_RIGHT, 88);
  ctx.font = `800 20px ${font}`;
  ctx.fillText(boundedText(ctx, input.title, RIGHT_RAIL_WIDTH), RIGHT_RAIL_RIGHT, 114);
  ctx.font = `500 10px ${font}`;
  ctx.fillText(boundedText(ctx, input.athlete, RIGHT_RAIL_WIDTH), RIGHT_RAIL_RIGHT, 132);

  const metrics = (input.performanceMetrics ?? []).filter((metric) => metric.value).slice(0, 6);
  if (metrics.length > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 8px ${font}`;
    ctx.fillText(boundedText(ctx, input.performanceLabel, RIGHT_RAIL_WIDTH), RIGHT_RAIL_RIGHT, 158);
    metrics.forEach((metric, index) => {
      const x = RIGHT_RAIL_LEFT + (index % 2) * 145 + 132;
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
    ...(elevationProfile.length >= 2 ? [] : [[input.elevation, input.elevationLabel] as const]),
  ];
  primaryStats.forEach(([value, label], index) => {
    const columnWidth = RIGHT_RAIL_WIDTH / primaryStats.length;
    const x = RIGHT_RAIL_LEFT + (index + 1) * columnWidth;
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 14px ${mono}`;
    ctx.fillText(boundedText(ctx, value, columnWidth - 8), x, 306);
    ctx.font = `600 8px ${font}`;
    ctx.fillText(boundedText(ctx, label, columnWidth - 8), x, 320);
  });
  ctx.font = `500 10px ${font}`;
  ctx.fillText(boundedText(ctx, input.footer, RIGHT_RAIL_WIDTH), RIGHT_RAIL_RIGHT, 520);
  ctx.font = `600 9px ${mono}`;
  ctx.fillText("orider.co.kr", RIGHT_RAIL_RIGHT, 540);
  if (image && loadedImage?.url !== input.routeImageUrl) {
    ctx.font = `500 8px ${font}`;
    ctx.fillText("© Mapbox · © OpenStreetMap", RIGHT_RAIL_RIGHT, 558);
  }
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const plot = { left: 32, right: 332, top: 490, bottom: 542 };
  if (elevationProfile.length >= 2) {
    ctx.fillStyle = "rgba(0,0,0,.10)";
    ctx.fillRect(plot.left - 8, 464, plot.right - plot.left + 16, 92);
    ctx.shadowColor = "rgba(0,0,0,.9)";
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 9px ${font}`;
    ctx.fillText(boundedText(ctx, `${input.elevationProfileLabel} · ${input.elevationLabel} ${input.elevation}`, 300), plot.right, 480);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
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
    chartFill.addColorStop(0, "rgba(79,213,209,.38)");
    chartFill.addColorStop(1, "rgba(79,213,209,.07)");
    ctx.beginPath();
    ctx.moveTo(coordinates[0]!.x, plot.bottom);
    coordinates.forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.lineTo(coordinates[coordinates.length - 1]!.x, plot.bottom);
    ctx.closePath();
    ctx.fillStyle = chartFill;
    ctx.fill();
    ctx.beginPath();
    coordinates.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = ORIDER_BRAND_DARK;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = ORIDER_BRAND_LIGHT;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = "rgba(79,213,209,.46)";
    ctx.fillRect(plot.left, 548, plot.right - plot.left, 1);
  }
  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function downloadShareCard(blob: Blob, filename: string): void {
  saveAs(blob, filename);
}
