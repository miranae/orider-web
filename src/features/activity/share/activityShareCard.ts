import { saveAs } from "file-saver";

export interface ActivityShareMetric {
  label: string;
  value: string;
  unit?: string;
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
  performanceLabel: string;
  footer: string;
  routeImageUrl?: string | null;
  backgroundImageUrl?: string | null;
  includeRouteImage: boolean;
  performanceMetrics?: ActivityShareMetric[];
}

const IMAGE_TIMEOUT_MS = 8_000;
const WIDTH = 1080;
const HEIGHT = 1350;
const MAP_HEIGHT = 600;

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

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, font: string): string {
  let size = startSize;
  while (size > 38) {
    ctx.font = `800 ${size}px ${font}`;
    if (ctx.measureText(text).width <= maxWidth) return text;
    size -= 4;
  }
  ctx.font = `800 38px ${font}`;
  return boundedText(ctx, text, maxWidth);
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
  const panel = "#10211e";
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
    const stripHeight = Math.min(32, drawnImageRect.height);
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
  ctx.font = `800 32px ${mono}`;
  ctx.fillText("O·RIDER", 56, 68);
  ctx.font = `600 28px ${font}`;
  ctx.fillText(boundedText(ctx, `${input.sport} · ${input.date}`, 968), 56, 416);
  ctx.fillText(fitText(ctx, input.title, 968, 70, font), 56, 494);
  ctx.font = `500 27px ${font}`;
  ctx.fillStyle = "rgba(255,255,255,.88)";
  ctx.fillText(boundedText(ctx, input.athlete, 968), 56, 538);

  const primaryStats: Array<readonly [string, string]> = [
    [input.distance, input.distanceLabel],
    [input.duration, input.durationLabel],
    [input.elevation, input.elevationLabel],
  ];
  primaryStats.forEach(([value, label], index) => {
    const x = 56 + index * 336;
    ctx.fillStyle = ink;
    ctx.font = `800 54px ${mono}`;
    ctx.fillText(boundedText(ctx, value, 300), x, 700);
    ctx.fillStyle = muted;
    ctx.font = `600 24px ${font}`;
    ctx.fillText(boundedText(ctx, label, 300), x, 741);
  });

  const metrics = (input.performanceMetrics ?? []).filter((metric) => metric.value).slice(0, 6);
  if (metrics.length > 0) {
    ctx.fillStyle = panel;
    ctx.fillRect(40, 790, 1000, 428);
    ctx.fillStyle = accent;
    ctx.fillRect(40, 790, 8, 428);
    ctx.fillStyle = ink;
    ctx.font = `700 27px ${font}`;
    ctx.fillText(input.performanceLabel, 72, 842);

    metrics.forEach((metric, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const x = 72 + col * 320;
      const y = 932 + row * 150;
      if (col > 0) {
        ctx.strokeStyle = line;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 24, y - 62);
        ctx.lineTo(x - 24, y + 54);
        ctx.stroke();
      }
      ctx.fillStyle = muted;
      ctx.font = `600 22px ${font}`;
      ctx.fillText(boundedText(ctx, metric.label, 272), x, y - 24);
      ctx.fillStyle = ink;
      ctx.font = `800 40px ${mono}`;
      const value = metric.unit ? `${metric.value} ${metric.unit}` : metric.value;
      ctx.fillText(boundedText(ctx, value, 272), x, y + 30);
    });
  } else {
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(56, 812);
    ctx.lineTo(1024, 812);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = `700 38px ${font}`;
    ctx.fillText(boundedText(ctx, input.footer, 968), 56, 900);
  }

  ctx.fillStyle = muted;
  ctx.font = `500 23px ${font}`;
  if (metrics.length > 0) ctx.fillText(input.footer, 56, 1292);
  ctx.textAlign = "right";
  ctx.fillText("orider.co.kr  ·  © Mapbox  ·  © OpenStreetMap", 1024, 1292);
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
