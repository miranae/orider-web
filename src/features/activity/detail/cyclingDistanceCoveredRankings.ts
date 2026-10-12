import type { BikeDistanceKey } from "@shared/activity-bike-distance-evidence";
import type { StageCyclingDistanceCoveredRankingsResponse as Response } from "@shared/types/stage-cycling-distance-covered-rankings";
/** 이미 고정된 서버 group/basis만 표시한다. 제외된 twin을 다시 선택하지 않는다. */
export function cyclingDistanceCoveredRankings(response: Response | null, target: BikeDistanceKey, limit: 5 | 10) {
  const ranking = response?.targets.find(row => row.target === target);
  const groups = new Map<string, Response["targets"][number]["top10"][number]>();
  for (const row of response?.rows ?? []) {
    const effort = row.efforts.find(e => e.target === target);
    if (!effort || effort.effectiveElapsedSec === null || effort.excluded || groups.has(effort.canonicalActivityId)) continue;
    const source = response!.rows.find(r => r.activityId === effort.effortSourceActivityId);
    if (source) groups.set(effort.canonicalActivityId, { ...effort, activityId: effort.canonicalActivityId, startTime: source.startTime, effectiveElapsedSec: effort.effectiveElapsedSec });
  }
  return { leaders: ranking?.top10.slice(0, limit) ?? [], winner: ranking?.winner ?? null, nextBest: ranking?.nextBest ?? null,
    observations: [...groups.values()].sort((a, b) => a.startTime - b.startTime || a.activityId.localeCompare(b.activityId)) };
}
