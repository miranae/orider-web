import { planDayStartMs } from "@shared/training/planDate";

/** 표시 전용: 계획과 같은 KST 달력 날짜. 계획의 남은 일수/훈련 계산은 변경하지 않는다. */
export function goalCountdown(targetMs: number | null | undefined, nowMs = Date.now()): string {
  if (targetMs == null || !Number.isFinite(targetMs) || !Number.isFinite(nowMs)) return "—";
  const days = Math.round((planDayStartMs(targetMs) - planDayStartMs(nowMs)) / 86400000);
  if (!Number.isFinite(days)) return "—";
  return days === 0 ? "D-DAY" : `D${days > 0 ? "−" : "+"}${Math.abs(days)}`;
}
