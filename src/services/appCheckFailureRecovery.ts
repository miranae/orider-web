/** 제공자 원문·토큰을 표시하지 않고 가입 화면에 필요한 복구 정보만 반환한다. */
export function appCheckFailureRecovery(error: unknown): { throttled: boolean; waitMs: number | null } | null {
  if (!error || typeof error !== "object") return null;
  const value = error as { code?: unknown; message?: unknown; customData?: { time?: unknown } };
  const code = typeof value.code === "string" ? value.code
    : typeof value.message === "string" && /^app-check\/[\w-]+$/.test(value.message) ? value.message : "";
  if (!/^app[-]?check\//i.test(code)) return null;
  if (!/\/(?:initial-throttle|throttled)$/i.test(code)) return { throttled: false, waitMs: null };
  const duration = typeof value.customData?.time === "string" ? value.customData.time
    : typeof value.message === "string" ? value.message.match(/attempts allowed again after\s+([\ddhms:]+)/i)?.[1] : undefined;
  const match = duration?.match(/^(?:(\d+)d:)?(?:(\d+)h:)?(?:(\d+)m:)?(?:(\d+)s)?$/);
  const waitMs = match ? (Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0)) * 1000 : 0;
  return { throttled: true, waitMs: Number.isSafeInteger(waitMs) && waitMs > 0 ? waitMs : null };
}
