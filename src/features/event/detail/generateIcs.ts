/**
 * 단건 이벤트 ".ics" 파일 생성 — 외부 라이브러리 없이 템플릿 문자열로 조립.
 * 시각은 항상 UTC(Z)로 기록해 캘린더 앱의 로컬 타임존 변환에 맡긴다.
 */

const DEFAULT_DURATION_MS = 4 * 60 * 60 * 1000; // 종료 시각 필드가 없을 때 기본 4시간

export function toIcsUtcStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export interface IcsEventInput {
  id: string;
  name: string;
  description?: string;
  startTime: number;
  durationMs?: number;
  location?: string;
  url: string;
  now?: number;
}

export function buildEventIcs(input: IcsEventInput): string {
  const duration = input.durationMs && input.durationMs > 0 ? input.durationMs : DEFAULT_DURATION_MS;
  const dtStamp = toIcsUtcStamp(input.now ?? Date.now());
  const dtStart = toIcsUtcStamp(input.startTime);
  const dtEnd = toIcsUtcStamp(input.startTime + duration);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//O-Rider//Event//KO",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.id}@orider.co.kr`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(input.name)}`,
    input.description ? `DESCRIPTION:${escapeIcsText(input.description)}` : undefined,
    input.location ? `LOCATION:${escapeIcsText(input.location)}` : undefined,
    `URL:${input.url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => line !== undefined);

  return lines.join("\r\n") + "\r\n";
}

export function icsFileName(eventName: string): string {
  const safe = eventName.replace(/[^\w가-힣ぁ-んァ-ヶ-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${safe || "event"}.ics`;
}

export function downloadIcsFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
