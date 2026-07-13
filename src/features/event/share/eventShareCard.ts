export interface EventShareCardInput {
  eventName: string;
  riderName: string;
  date: string;
  kind: "registered" | "finished";
  result?: string;
  rank?: string;
}

export function drawEventShareCard(ctx: CanvasRenderingContext2D, input: EventShareCardInput): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#101410");
  gradient.addColorStop(1, input.kind === "finished" ? "#193c39" : "#273317");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#c6f432";
  ctx.font = "700 36px sans-serif";
  ctx.fillText("O-RIDER", 64, 84);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 58px sans-serif";
  ctx.fillText(input.kind === "finished" ? "FINISHER" : "I'M IN", 64, 190);
  ctx.font = "700 42px sans-serif";
  ctx.fillText(input.eventName.slice(0, 26), 64, 280);
  ctx.fillStyle = "#c9d0c9";
  ctx.font = "400 28px sans-serif";
  ctx.fillText(`${input.riderName} · ${input.date}`, 64, 334);
  if (input.result) {
    ctx.fillStyle = "#c6f432";
    ctx.font = "700 64px monospace";
    ctx.fillText(input.result, 64, 445);
  }
  if (input.rank) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "600 28px sans-serif";
    ctx.fillText(input.rank, 64, 500);
  }
  ctx.fillStyle = "#9aa49a";
  ctx.font = "400 22px sans-serif";
  ctx.fillText("orider.co.kr", 64, height - 52);
}

export async function createEventShareImage(input: EventShareCardInput): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 608;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  drawEventShareCard(ctx, input);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Image encoding failed")), "image/png");
  });
  return new File([blob], `orider-${input.kind}.png`, { type: "image/png" });
}

export async function shareEventImage(file: File, title: string): Promise<"shared" | "downloaded"> {
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return "shared";
  }
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}
