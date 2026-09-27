import { estimateLoad, isNegligibleActivitySummary, isSaneTss, type LoadDiscipline } from './activityLoad';

export interface AcceptedActivityLoad {
  value: number;
  known: boolean;
  reliable: boolean;
  source: 'server' | 'recorded' | 'power_estimate' | 'trimp' | 'time' | 'excluded' | 'unknown';
}

/** 원본 요약은 보존하고 Fitness/Coach/훈련 달성에서 사용할 부하만 선택한다. */
export function acceptedActivityLoad(activity: Record<string, unknown>, discipline: LoadDiscipline, ftp?: number): AcceptedActivityLoad {
  const summary = (activity.summary ?? {}) as Record<string, unknown>;
  const derived = activity.serverDerivedLoad as Record<string, unknown> | null | undefined;
  // pending 재분석 중에도 서버가 게시한 마지막 확정값을 유지한다. 현재 binding으로 덮어 검증하지 않는다.
  const streamTss = derived?.schemaVersion === 1 && typeof activity.userId === 'string' && derived.userId === activity.userId
    && typeof derived.inputBinding === 'string' && derived.inputBinding.length > 0
    && typeof derived.streamTss === 'number' && isSaneTss(derived.streamTss) ? derived.streamTss : null;
  const direct = typeof activity.tss === 'number' && isSaneTss(activity.tss) ? activity.tss : null;
  const recorded = direct ?? (typeof summary.tss === 'number' && isSaneTss(summary.tss) ? summary.tss : null);
  const reliable = recorded !== null || streamTss !== null;
  if (isNegligibleActivitySummary(summary)) return { value: 0, known: true, reliable, source: 'excluded' };
  const precomputedTss = activity.source === 'strava' && streamTss !== null ? null : recorded;
  const durationMillis = typeof summary.ridingTimeMillis === 'number' ? summary.ridingTimeMillis
    : typeof summary.movingTimeMillis === 'number' ? summary.movingTimeMillis
    : typeof summary.elapsedTimeMillis === 'number' ? summary.elapsedTimeMillis : 0;
  const load = estimateLoad({ precomputedTss, streamTss, ftp: ftp ?? null,
    avgPower: typeof summary.averagePower === 'number' ? summary.averagePower : null,
    streamTrimpTss: typeof summary.streamTrimpTss === 'number' ? summary.streamTrimpTss : null,
    relativeEffort: typeof summary.relativeEffort === 'number' ? summary.relativeEffort : null,
    durationMillis, discipline });
  const known = load.value > 0 || activity.tss === 0 || summary.tss === 0;
  return { value: load.value, known, reliable, source: !known ? 'unknown'
    : precomputedTss !== null ? 'recorded' : streamTss !== null ? 'server' : load.source === 'tss' ? 'power_estimate' : load.source === 'trimp' ? 'trimp' : 'time' };
}
