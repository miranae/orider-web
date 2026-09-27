/** PlanDay.date와 훈련 달성 집계는 00:00 KST 계약이다. 기록 원본 timestamp는 변경하지 않는다. */
export const PLAN_KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function planDayKey(epochMs: number): string {
  if (!Number.isFinite(epochMs) || !Number.isFinite(new Date(epochMs + PLAN_KST_OFFSET_MS).getTime())) return "";
  return new Date(epochMs + PLAN_KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function planDayStartMs(epochMs: number): number {
  return Date.parse(`${planDayKey(epochMs)}T00:00:00+09:00`);
}

/** UTC getter로 읽는 달력용 Date. 실제 epoch 경계에는 planMonthBounds를 쓴다. */
export function planCalendarDate(epochMs: number): Date {
  return new Date(epochMs + PLAN_KST_OFFSET_MS);
}

export function planMonthBounds(year: number, month: number): { start: number; end: number } {
  return { start: Date.UTC(year, month, 1) - PLAN_KST_OFFSET_MS,
    end: Date.UTC(year, month + 1, 1) - PLAN_KST_OFFSET_MS - 1 };
}
