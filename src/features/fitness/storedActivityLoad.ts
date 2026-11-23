import type { Activity } from "@shared/types";
import type { ActivityMetrics } from "@shared/types/activity-metrics";
import { isSaneTss } from "@shared/training/activityLoad";

/**
 * 활동에 서버가 저장한 부하(TSS)만 고른다 — 시간·파워로 추정하지 않는다(P6).
 * 순서: 서버 활동 지표 → 활동 문서의 tss → 기록 요약 tss(Strava 제외) → 서버 스트림 부하.
 */
export function storedActivityLoad(activity: Activity, metrics?: Pick<ActivityMetrics, "tss"> | null): number | null {
  const record = activity as Activity & { tss?: unknown; serverDerivedLoad?: Record<string, unknown> | null };
  const derived = record.serverDerivedLoad;
  const streamTss = derived?.schemaVersion === 1 && derived.userId === activity.userId
    && typeof derived.inputBinding === "string" && derived.inputBinding.length > 0
    && typeof derived.streamTss === "number" ? derived.streamTss : null;
  const candidates = [
    metrics?.tss,
    typeof record.tss === "number" ? record.tss : null,
    activity.source === "strava" ? null : activity.summary?.tss,
    streamTss,
  ];
  const value = candidates.find(candidate => candidate === 0 || isSaneTss(candidate));
  return value == null ? null : Math.round(value);
}

/** 활동 이름 — 저장된 제목·설명만 쓰고, 없으면 null. */
export function storedActivityName(activity: Activity): string | null {
  const record = activity as Activity & { name?: unknown };
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name) return name;
  const description = typeof activity.description === "string" ? activity.description.trim() : "";
  return description || null;
}
