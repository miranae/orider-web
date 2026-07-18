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
}

const IMAGE_TIMEOUT_MS = 8_000;
const WIDTH = 1080;
const HEIGHT = 1350;
const MAP_HEIGHT = 600;
const ATTRIBUTION_STRIP_HEIGHT = 32;
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

interface DrawnImageRect { x: number; y: number; width: number; height: number }

function drawContainedImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement): DrawnImageRect {
  const scale = Math.min(WIDTH / image.naturalWidth, MAP_HEIGHT / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const rect = { x: (WIDTH - width) / 2, y: (MAP_HEIGHT - height) / 2, width, height };
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  return rect;
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
  let drawnImageRect: DrawnImageRect | null = null;
  if (image) {
    ctx.fillStyle = "#dce8e3";
    ctx.fillRect(0, 0, WIDTH, MAP_HEIGHT);
    drawnImageRect = drawContainedImage(ctx, image);
  } else {
    const mapFallback = ctx.createLinearGradient(0, 0, WIDTH, MAP_HEIGHT);
    mapFallback.addColorStop(0, "#17695d");
    mapFallback.addColorStop(1, "#0a2824");
    ctx.fillStyle = mapFallback;
    ctx.fillRect(0, 0, WIDTH, MAP_HEIGHT);
  }

  const topShade = ctx.createLinearGradient(0, 0, 0, MAP_HEIGHT);
  topShade.addColorStop(0, "rgba(2,12,10,.62)");
  topShade.addColorStop(0.48, "rgba(2,12,10,.04)");
  topShade.addColorStop(1, "rgba(2,12,10,.78)");
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, WIDTH, MAP_HEIGHT);
  // Static Images API가 이미지에 넣은 Mapbox wordmark/귀속 표시는 변형하거나
  // 가리지 않는다. 그라데이션 뒤에 하단 32px를 원본 밝기로 다시 그린다.
  if (image && drawnImageRect) {
    const stripHeight = Math.min(ATTRIBUTION_STRIP_HEIGHT, drawnImageRect.height);
    const sourceHeight = image.naturalHeight * stripHeight / drawnImageRect.height;
    ctx.drawImage(
      image,
      0,
      image.naturalHeight - sourceHeight,
      image.naturalWidth,
      sourceHeight,
      drawnImageRect.x,
      drawnImageRect.y + drawnImageRect.height - stripHeight,
      drawnImageRect.width,
      stripHeight,
    );
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = `800 28px ${mono}`;
  ctx.fillText("O·RIDER", 48, 54);

  const metrics = (input.performanceMetrics ?? []).filter((metric) => metric.value).slice(0, 6);
  if (metrics.length > 0) {
    ctx.fillStyle = "rgba(3,18,15,.76)";
    ctx.fillRect(40, 78, 1000, 116);
    ctx.fillStyle = accent;
    ctx.fillRect(40, 78, 6, 116);
    ctx.font = `700 15px ${font}`;
    ctx.fillText(boundedText(ctx, input.performanceLabel, 956), 64, 101);
    metrics.forEach((metric, index) => {
      const x = 64 + index * 162;
      ctx.fillStyle = "rgba(255,255,255,.7)";
      ctx.font = `600 17px ${font}`;
      ctx.fillText(boundedText(ctx, metric.label, 142), x, 132);
      ctx.fillStyle = ink;
      ctx.font = `800 26px ${mono}`;
      const value = metric.unit ? `${metric.value} ${metric.unit}` : metric.value;
      ctx.fillText(boundedText(ctx, value, 142), x, 168);
    });
  }

  ctx.font = `600 21px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.fillText(boundedText(ctx, `${input.sport} · ${input.date}`, 968), 48, 389);
  ctx.font = `800 46px ${font}`;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(boundedText(ctx, input.title, 968), 48, 441);
  ctx.font = `500 21px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,.88)";
  ctx.fillText(boundedText(ctx, input.athlete, 968), 48, 474);

  const primaryStats: Array<readonly [string, string]> = [
    [input.distance, input.distanceLabel],
    [input.duration, input.durationLabel],
    [input.elevation, input.elevationLabel],
  ];
  primaryStats.forEach(([value, label], index) => {
    const x = 48 + index * 336;
    ctx.fillStyle = ink;
    ctx.font = `800 34px ${mono}`;
    ctx.fillText(boundedText(ctx, value, 300), x, 520);
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.font = `600 18px ${font}`;
    ctx.fillText(boundedText(ctx, label, 300), x, 548);
  });

  const elevationProfile = normalizedElevationProfile(input.elevationProfile);
  ctx.fillStyle = ink;
  ctx.font = `700 27px ${font}`;
  ctx.fillText(boundedText(ctx, input.elevationProfileLabel, 968), 56, 666);
  ctx.fillStyle = muted;
  ctx.font = `600 20px ${font}`;
  ctx.fillText(boundedText(ctx, `${input.elevationLabel} ${input.elevation}`, 968), 56, 702);

  const plot = { left: 56, right: 1024, top: 744, bottom: 1188 };
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  [plot.top, (plot.top + plot.bottom) / 2, plot.bottom].forEach((y) => {
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(plot.left, y);
    ctx.lineTo(plot.right, y);
    ctx.stroke();
  });

  if (elevationProfile.length >= 2) {
    const distances = elevationProfile.map((point) => point.distance);
    const elevations = elevationProfile.map((point) => point.elevation);
    const minDistance = Math.min(...distances);
    const distanceRange = Math.max(1, Math.max(...distances) - minDistance);
    const minElevation = Math.min(...elevations);
    const maxElevation = Math.max(...elevations);
    const elevationRange = Math.max(1, maxElevation - minElevation);
    const coordinates = elevationProfile.map((point) => ({
      x: plot.left + ((point.distance - minDistance) / distanceRange) * (plot.right - plot.left),
      y: plot.bottom - ((point.elevation - minElevation) / elevationRange) * (plot.bottom - plot.top),
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
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.font = `600 18px ${mono}`;
    ctx.fillText(`${Math.round(maxElevation)} m`, plot.left, plot.top - 12);
    ctx.fillText(`${Math.round(minElevation)} m`, plot.left, plot.bottom + 30);
    ctx.textAlign = "right";
    ctx.fillText(input.distance, plot.right, plot.bottom + 30);
    ctx.textAlign = "left";
  } else {
    ctx.fillStyle = muted;
    ctx.font = `600 24px ${font}`;
    ctx.fillText(boundedText(ctx, input.footer, 968), 56, 820);
  }

  ctx.fillStyle = muted;
  ctx.font = `500 23px ${font}`;
  ctx.fillText(boundedText(ctx, input.footer, 470), 56, 1298);
  ctx.textAlign = "right";
  ctx.fillText(image ? "orider.co.kr  ·  © Mapbox  ·  © OpenStreetMap" : "orider.co.kr", 1024, 1298);
  ctx.textAlign = "left";
  ctx.fillStyle = accent;
  ctx.fillRect(0, 1338, WIDTH, 12);
  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function downloadShareCard(blob: Blob, filename: string): void {
  saveAs(blob, filename);
}
