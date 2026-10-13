import type { BikeDistanceKey } from "@shared/activity-bike-distance-evidence";
import type { CyclingHistoryOverlayEvidence } from "@shared/types/stage-cycling-distance-history-overlay";
import type { CyclingCoveredRank } from "@shared/types/stage-cycling-distance-covered-rankings";
import type { CyclingDistanceHistoryResponse, CyclingDistanceHistoryRow } from "@shared/types/training-cycling-distance-history";
import { cyclingDistanceHistory } from "./cyclingDistanceHistory";
import { pickPhysicalRideRepresentative } from "../../../utils/samePhysicalRide";
/** 파생 movingSec/hasLoad는 lifecycle 채널마다 다르므로 원본 이력의 대표 우선순위를 유지한다. */
export function cyclingOverlayMatchesHistory(row: CyclingDistanceHistoryRow, evidence: CyclingHistoryOverlayEvidence) {
  const immutable = ["source", "type", "discipline", "localSessionId", "stravaActivityId", "stravaTwinActivityId", "endTime"] as const;
  return row.activityId === evidence.row.activityId && row.activityRevision === evidence.activityRevision && row.metricsRevision === evidence.metricsRevision
    && row.startTime === evidence.row.startTime && row.representativeInput.source === evidence.row.source && row.representativeInput.type === evidence.row.type
    && immutable.every(key => row.representativeInput[key] === evidence.row.representativeInput[key]);
}
/** 전체 원본으로 다시 선택한 후 정확한 basis 선택을 반영한다. 미확인 twin은 결과가 아니다. */
export function cyclingDistanceHistoryOverlay(pages: CyclingDistanceHistoryResponse[], evidence: readonly CyclingHistoryOverlayEvidence[], target: BikeDistanceKey, limit: 5 | 10) {
  const history = cyclingDistanceHistory(pages), byId = new Map(evidence.map(e => [e.row.activityId, e]));
  const invalid = () => ({ sources: [] as CyclingCoveredRank[], allSources: [] as CyclingCoveredRank[], winner: null, nextBest: null, unresolved: history.groups.length, excluded: 0, unavailable: 0, checked: 0, loaded: history.rows.length, invalidated: true });
  if (byId.size !== evidence.length || evidence.some(e => !history.rows.some(r => cyclingOverlayMatchesHistory(r, e)))) return invalid();
  const allSources: CyclingCoveredRank[] = []; let unresolved = 0, excluded = 0, unavailable = 0;
  for (const group of history.groups) {
    if (group.some(g => !byId.has(g.id) || g.row.representativeInput.stravaTwinActivityId !== null && !group.some(twin => twin.row.representativeInput.stravaActivityId === g.row.representativeInput.stravaTwinActivityId))) { unresolved++; continue; }
    const members = group.map(g => ({ ...g, evidence: byId.get(g.id)! }));
    const canonical = members.filter(g => g.evidence.row.efforts.some(e => e.target === target && e.basis === "canonical_metrics"));
    const snapshots = members.filter(g => g.evidence.row.efforts.some(e => e.target === target && e.basis === "stage_distance_snapshot"));
    const qualified = canonical.length ? canonical : snapshots;
    if (!qualified.length) { unavailable++; continue; }
    const source = pickPhysicalRideRepresentative(qualified).evidence, effort = source.row.efforts.find(e => e.target === target)!;
    if ((effort.basis === "canonical_metrics" ? source.canonicalExcluded : source.snapshotExcluded).includes(target)) { excluded++; continue; }
    if (effort.originalElapsedSec === null) return invalid();
    allSources.push({ ...effort, canonicalActivityId: pickPhysicalRideRepresentative(group).id, effortSourceActivityId: source.row.activityId, activityId: source.row.activityId,
      startTime: source.row.startTime, effectiveElapsedSec: effort.originalElapsedSec, excluded: false });
  }
  allSources.sort((a, b) => a.effectiveElapsedSec - b.effectiveElapsedSec || b.startTime - a.startTime || a.activityId.localeCompare(b.activityId));
  return { sources: allSources.slice(0, limit), allSources, winner: allSources[0] ?? null, nextBest: allSources[1] ?? null, unresolved, excluded, unavailable, checked: evidence.length, loaded: history.rows.length, invalidated: false };
}
