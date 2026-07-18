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
  elevationProfileUnit?: string;
  weather?: ActivityShareWeather;
}

const IMAGE_TIMEOUT_MS = 8_000;
const WIDTH = 1080;
const HEIGHT = 900;
const MAP_HEIGHT = 600;
const MAX_ELEVATION_POINTS = 240;

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

function weatherSummary(weather: ActivityShareWeather | undefined): string {
  if (!weather) return "";
  const code = weather.weatherCode;
  const icon = code == null ? "◌" : code <= 1 ? "☀︎" : code <= 3 ? "☁︎" : code <= 48 ? "≋" : code <= 67 ? "☂︎" : code <= 77 ? "❄︎" : code <= 82 ? "☂︎" : "ϟ";
  const values = [
    Number.isFinite(weather.temperature) ? `${icon} ${Math.round(weather.temperature!)}°C` : "",
    Number.isFinite(weather.feelsLike) ? `≈ ${Math.round(weather.feelsLike!)}°C` : "",
    Number.isFinite(weather.humidity) ? `RH ${Math.round(weather.humidity!)}%` : "",
    Number.isFinite(weather.windSpeed)
      ? `${weather.windDirection == null ? "↗" : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(weather.windDirection / 45) % 8]} ${weather.windSpeed!.toFixed(1)} m/s`
      : "",
  ].filter(Boolean);
  return values.join("  ·  ");
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
  const ink = "#f5fbf8";
  const muted = "#98aaa4";
  const line = "#27413b";
  const accent = "#23d5a7";

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

  ctx.shadowColor = "rgba(0,0,0,.9)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 14px ${mono}`;
  ctx.fillText("O·RIDER", 24, 30);
  const weather = weatherSummary(input.weather);
  if (weather) {
    ctx.textAlign = "right";
    ctx.font = `700 11px ${mono}`;
    ctx.fillText(boundedText(ctx, weather, 700), 1056, 30);
    ctx.textAlign = "left";
  }

  const metrics = (input.performanceMetrics ?? []).filter((metric) => metric.value).slice(0, 6);
  if (metrics.length > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 8px ${font}`;
    ctx.fillText(boundedText(ctx, input.performanceLabel, 1008), 36, 68);
    metrics.forEach((metric, index) => {
      const x = 36 + index * 170;
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 9px ${font}`;
      ctx.fillText(boundedText(ctx, metric.label, 150), x, 86);
      ctx.font = `800 13px ${mono}`;
      const value = metric.unit ? `${metric.value} ${metric.unit}` : metric.value;
      ctx.fillText(boundedText(ctx, value, 150), x, 104);
    });
  }

  ctx.font = `600 11px ${font}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(boundedText(ctx, `${input.sport} · ${input.date}`, 1016), 32, 448);
  ctx.font = `800 23px ${font}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(boundedText(ctx, input.title, 1016), 32, 478);
  ctx.font = `500 11px ${font}`;
  ctx.fillText(boundedText(ctx, input.athlete, 1016), 32, 496);

  const primaryStats: Array<readonly [string, string]> = [
    [input.distance, input.distanceLabel],
    [input.duration, input.durationLabel],
    [input.elevation, input.elevationLabel],
  ];
  primaryStats.forEach(([value, label], index) => {
    const x = 32 + index * 344;
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 17px ${mono}`;
    ctx.fillText(boundedText(ctx, value, 310), x, 530);
    ctx.font = `600 9px ${font}`;
    ctx.fillText(boundedText(ctx, label, 310), x, 545);
  });
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const elevationProfile = normalizedElevationProfile(input.elevationProfile);
  const plot = { left: 40, right: 1040, top: 678, bottom: 789 };
  if (elevationProfile.length >= 2) {
    ctx.fillStyle = ink;
    ctx.font = `700 14px ${font}`;
    ctx.fillText(boundedText(ctx, input.elevationProfileLabel, 1000), 40, 630);
    ctx.fillStyle = muted;
    ctx.font = `600 10px ${font}`;
    ctx.fillText(boundedText(ctx, `${input.elevationLabel} ${input.elevation}`, 1000), 40, 648);
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    [plot.top, (plot.top + plot.bottom) / 2, plot.bottom].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.right, y);
      ctx.stroke();
    });
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
    chartFill.addColorStop(0, "rgba(35,213,167,.58)");
    chartFill.addColorStop(1, "rgba(35,213,167,.04)");
    ctx.beginPath();
    ctx.moveTo(coordinates[0]!.x, plot.bottom);
    coordinates.forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.lineTo(coordinates[coordinates.length - 1]!.x, plot.bottom);
    ctx.closePath();
    ctx.fillStyle = chartFill;
    ctx.fill();
    ctx.beginPath();
    coordinates.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.font = `600 9px ${mono}`;
    const elevationUnit = input.elevationProfileUnit ?? "m";
    const elevationScale = elevationUnit === "ft" ? 3.28084 : 1;
    if (isFlat) {
      ctx.fillText(`${Math.round(maxElevation * elevationScale)} ${elevationUnit}`, plot.left, (plot.top + plot.bottom) / 2 - 6);
    } else {
      ctx.fillText(`${Math.round(maxElevation * elevationScale)} ${elevationUnit}`, plot.left, plot.top - 6);
      ctx.fillText(`${Math.round(minElevation * elevationScale)} ${elevationUnit}`, plot.left, plot.bottom + 15);
    }
    ctx.textAlign = "right";
    ctx.fillText(input.distance, plot.right, plot.bottom + 15);
    ctx.textAlign = "left";
  }

  ctx.fillStyle = muted;
  ctx.font = `500 12px ${font}`;
  ctx.fillText(boundedText(ctx, input.footer, 470), 40, 858);
  ctx.textAlign = "right";
  ctx.fillText(image ? "orider.co.kr  ·  © Mapbox  ·  © OpenStreetMap" : "orider.co.kr", 1040, 858);
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.fillRect(0, 892, WIDTH, 8);
  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function downloadShareCard(blob: Blob, filename: string): void {
  saveAs(blob, filename);
}
