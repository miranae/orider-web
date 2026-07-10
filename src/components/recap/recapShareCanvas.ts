import type { YearRecap } from "../../utils/yearRecap";

/**
 * 연말결산 공유 그래픽을 <canvas> 로 직접 렌더한다.
 *
 * html-to-image 같은 신규 의존성 없이, ActivityCard 가 쓰는 canvas.toBlob 패턴을 재사용해
 * SNS 공유용 정사각/스토리 비율 PNG 를 생성한다. 색/폰트는 라이브 DOM 의 CSS 변수
 * (getComputedStyle) 에서 읽어 라이트/다크·테마 선택을 그대로 반영 — 디자인 토큰 단일 진실원.
 */

/** 공유 카드 비율 */
export type RecapShareRatio = "square" | "story";

/** 카드에 표시할 문구 (i18n 로 번역된 문자열을 소비처에서 주입) */
export interface RecapShareLabels {
  /** 상단 타이틀 (예: "2026 연말결산") */
  title: string;
  /** 닉네임 */
  nickname: string;
  /** 거리 라벨 */
  distance: string;
  /** 시간 라벨 */
  time: string;
  /** 고도 라벨 */
  elevation: string;
  /** 활동 라벨 */
  activities: string;
  /** 시간 단위 (시간) */
  hourUnit: string;
  /** 푸터 브랜드 문구 */
  footer: string;
}

interface Tokens {
  bg0: string;
  bg1: string;
  ink0: string;
  ink2: string;
  ink3: string;
  accent: string;
  line: string;
  fontBody: string;
  fontMono: string;
}

function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim();
    return v || fallback;
  };
  return {
    bg0: get("--bg-0", "#ffffff"),
    bg1: get("--bg-1", "#f5f5f5"),
    ink0: get("--ink-0", "#111111"),
    ink2: get("--ink-2", "#555555"),
    ink3: get("--ink-3", "#888888"),
    accent: get("--lime", get("--accent", "#00b3a4")),
    line: get("--line-soft", get("--line", "#dddddd")),
    fontBody: get("--font-body", "Pretendard, system-ui, sans-serif"),
    fontMono: get("--font-mono", "'JetBrains Mono', monospace"),
  };
}

/** km, 한 자리 */
function km(meters: number): string {
  return (meters / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}
/** 시간(시), 한 자리 */
function hours(ms: number): string {
  return (ms / 3600000).toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}
/** 정수 콤마 */
function int(v: number): string {
  return Math.round(v).toLocaleString("ko-KR");
}

/**
 * 연말결산 공유 카드를 캔버스에 그린다.
 * @returns 렌더 완료된 HTMLCanvasElement
 */
export function drawRecapShareCard(
  recap: YearRecap,
  labels: RecapShareLabels,
  ratio: RecapShareRatio = "square",
): HTMLCanvasElement {
  const t = readTokens();
  // 충분한 해상도 (공유 시 선명). square 1080x1080, story 1080x1920.
  const W = 1080;
  const H = ratio === "story" ? 1920 : 1080;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // 배경
  ctx.fillStyle = t.bg0;
  ctx.fillRect(0, 0, W, H);

  const pad = 96;
  const accentBar = 12;

  // 상단 액센트 바
  ctx.fillStyle = t.accent;
  ctx.fillRect(0, 0, W, accentBar);

  // 헤더: 브랜드 + 타이틀
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = t.accent;
  ctx.font = `700 36px ${t.fontMono}`;
  ctx.fillText("O-RIDER", pad, 140);

  ctx.fillStyle = t.ink0;
  ctx.font = `800 84px ${t.fontBody}`;
  ctx.fillText(labels.title, pad, 250);

  ctx.fillStyle = t.ink2;
  ctx.font = `500 40px ${t.fontBody}`;
  ctx.fillText(labels.nickname, pad, 312);

  // 2x2 지표 그리드
  const gridTop = ratio === "story" ? 520 : 400;
  const gridGapY = ratio === "story" ? 360 : 280;
  const colX = [pad, W / 2 + 24];
  const rowY = [gridTop, gridTop + gridGapY];

  const cells: Array<{ value: string; unit: string; label: string }> = [
    { value: km(recap.totalDistanceMeters), unit: "km", label: labels.distance },
    { value: hours(recap.totalDurationMillis), unit: labels.hourUnit, label: labels.time },
    { value: int(recap.totalElevationMeters), unit: "m", label: labels.elevation },
    { value: int(recap.totalCount), unit: "", label: labels.activities },
  ];

  cells.forEach((cell, i) => {
    const x = colX[i % 2] ?? pad;
    const y = rowY[Math.floor(i / 2)] ?? gridTop;
    // 값
    ctx.fillStyle = t.ink0;
    ctx.font = `800 110px ${t.fontMono}`;
    const valueText = cell.value;
    ctx.fillText(valueText, x, y);
    // 단위
    if (cell.unit) {
      const vw = ctx.measureText(valueText).width;
      ctx.fillStyle = t.accent;
      ctx.font = `700 44px ${t.fontBody}`;
      ctx.fillText(cell.unit, x + vw + 14, y);
    }
    // 라벨
    ctx.fillStyle = t.ink3;
    ctx.font = `500 38px ${t.fontBody}`;
    ctx.fillText(cell.label, x, y + 56);
  });

  // 구분선 + 푸터
  const footerY = H - 90;
  ctx.strokeStyle = t.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, footerY - 56);
  ctx.lineTo(W - pad, footerY - 56);
  ctx.stroke();

  ctx.fillStyle = t.ink3;
  ctx.font = `500 34px ${t.fontBody}`;
  ctx.fillText(labels.footer, pad, footerY);

  return canvas;
}

/** 캔버스를 PNG Blob 으로 변환 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}
