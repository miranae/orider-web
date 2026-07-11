import { saveAs } from "file-saver";

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
  footer: string;
  backgroundImageUrl?: string | null;
  includeRouteImage: boolean;
}

function token(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const IMAGE_TIMEOUT_MS = 8_000;

function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null);
      return;
    }
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

function boundedText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && ctx.measureText(`${text.slice(0, end).trimEnd()}…`).width > maxWidth) end -= 1;
  return end > 0 ? `${text.slice(0, end).trimEnd()}…` : "…";
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number): string {
  let size = startSize;
  while (size > 42) {
    ctx.font = `800 ${size}px ${token("--font-body", "system-ui, sans-serif")}`;
    if (ctx.measureText(text).width <= maxWidth) return text;
    size -= 4;
  }
  ctx.font = `800 42px ${token("--font-body", "system-ui, sans-serif")}`;
  return boundedText(ctx, text, maxWidth);
}

/** Draws a privacy-filtered, share-ready activity poster. Cross-origin images fail closed. */
export async function drawActivityShareCard(input: ActivityShareCardInput, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const ink = token("--ink-0", "#101817");
  const muted = token("--ink-3", "#70807d");
  const accent = token("--lime", "#18c79c");
  const bg = token("--bg-0", "#f7faf9");
  const font = token("--font-body", "system-ui, sans-serif");
  const mono = token("--font-mono", "monospace");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const image = input.includeRouteImage && input.backgroundImageUrl
    ? await loadImage(input.backgroundImageUrl, signal)
    : null;
  if (image) {
    const scale = Math.max(canvas.width / image.naturalWidth, 650 / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.drawImage(image, (canvas.width - width) / 2, (650 - height) / 2, width, height);
    const shade = ctx.createLinearGradient(0, 180, 0, 650);
    shade.addColorStop(0, "rgba(0,0,0,.08)");
    shade.addColorStop(1, "rgba(0,0,0,.64)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, canvas.width, 650);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 650);
    gradient.addColorStop(0, accent);
    gradient.addColorStop(1, "#0b4f4a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, 650);
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 34px ${mono}`;
  ctx.fillText("O-RIDER", 72, 92);
  ctx.font = `600 30px ${font}`;
  ctx.fillText(boundedText(ctx, `${input.sport} · ${input.date}`, 936), 72, 448);
  const title = fitText(ctx, input.title, 936, 76);
  ctx.fillText(title, 72, 548);
  ctx.font = `500 30px ${font}`;
  ctx.fillText(boundedText(ctx, input.athlete, 936), 72, 604);

  const stats: Array<readonly [string, string]> = [
    [input.distance, input.distanceLabel],
    [input.duration, input.durationLabel],
    [input.elevation, input.elevationLabel],
  ];
  stats.forEach(([value, label], index) => {
    const x = 72 + index * 320;
    ctx.fillStyle = ink;
    ctx.font = `800 58px ${mono}`;
    ctx.fillText(boundedText(ctx, value, 280), x, 790);
    ctx.fillStyle = muted;
    ctx.font = `500 27px ${font}`;
    ctx.fillText(boundedText(ctx, label, 280), x, 838);
  });

  ctx.strokeStyle = token("--line-soft", "#dce5e2");
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(72, 920);
  ctx.lineTo(1008, 920);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.font = `700 42px ${font}`;
  ctx.fillText(boundedText(ctx, input.footer, 936), 72, 1010);
  ctx.fillStyle = muted;
  ctx.font = `500 27px ${font}`;
  ctx.fillText("orider.co.kr", 72, 1252);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 1338, canvas.width, 12);
  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function downloadShareCard(blob: Blob, filename: string): void {
  saveAs(blob, filename);
}
