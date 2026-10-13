import type { StagePowerHistoryComputeResponse, StagePowerHistoryComputedCandidate, StagePowerHistoryOrigin } from "@shared/types/stage-power-duration-history";
import { physicalRideIdentityKeys, pickPhysicalRideRepresentative } from "../../../utils/samePhysicalRide";
import { compareExactPowerEnergy, compareExactPowerRatios } from "./stagePowerHistoryExact";
export function reducePowerHistory(pages: readonly StagePowerHistoryComputeResponse[]) {
  if (!pages.length) return [];
  const first = pages[0]!, context = JSON.stringify([first.durationSeconds, first.periods, first.session, first.includeWeightNormalized === true]);
  if (pages.some(v => JSON.stringify([v.durationSeconds, v.periods, v.session, v.includeWeightNormalized === true]) !== context) || pages.reduce((n, v) => n + v.candidates.length, 0) > 5000) throw Error("history_context_changed");
  return first.periods.map((_range, periodIndex) => {
    const map = new Map<string, StagePowerHistoryComputedCandidate>();
    for (const page of pages.filter(v => v.periodIndex === periodIndex)) for (const row of page.candidates) { const previous = map.get(row.activityId); if (previous && JSON.stringify(previous) !== JSON.stringify(row)) throw Error("history_source_changed"); map.set(row.activityId, row); }
    return { periodIndex, origins: (["measured", "stored_native_watts_unverified"] as StagePowerHistoryOrigin[]).map(sourcePowerOrigin => {
      const rows = [...map.values()].filter(v => v.sourcePowerOrigin === sourcePowerOrigin), parents = rows.map((_, i) => i);
      const find = (i: number): number => { while (parents[i] !== i) { parents[i] = parents[parents[i]!]!; i = parents[i]!; } return i; };
      const keys = new Map<string, number>();
      rows.forEach((row, i) => { for (const key of physicalRideIdentityKeys({ id: row.activityId, ...row.physicalIdentity })) { const old = keys.get(key); if (old === undefined) keys.set(key, i); else parents[find(i)] = find(old); } });
      const groups = new Map<number, StagePowerHistoryComputedCandidate[]>();
      rows.forEach((row, i) => { const group = groups.get(find(i)); if (group) group.push(row); else groups.set(find(i), [row]); });
      const representative = (members: StagePowerHistoryComputedCandidate[]) => members.length ? pickPhysicalRideRepresentative(members.map(row => ({ id: row.activityId, source: row.physicalIdentity.source, row }))).row : null;
      const choose = (weighted: boolean) => {
        const selected = [...groups.values()].map(group => representative(group.filter(v => v.state === "available" && (!weighted || v.weightNormalized?.state === "available" && v.weightNormalized.comparison !== null)))).filter((v): v is StagePowerHistoryComputedCandidate => v !== null);
        let winner: StagePowerHistoryComputedCandidate | null = null;
        for (const row of selected) {
          const order = winner ? weighted ? compareExactPowerRatios(row.weightNormalized!.comparison!, winner.weightNormalized!.comparison!) : compareExactPowerEnergy(row.comparison!.energyWattMilliseconds, row.comparison!.durationMilliseconds, winner.comparison!.energyWattMilliseconds, winner.comparison!.durationMilliseconds) : 1;
          if (!winner || order > 0 || order === 0 && (row.startTime > winner.startTime || row.startTime === winner.startTime && row.activityId < winner.activityId)) winner = row;
        }
        return { winner, computedPhysicalCandidateCount: selected.length };
      };
      return { sourcePowerOrigin, ...choose(false), weightNormalized: { ...choose(true), unit: "W/kg" as const, basis: "calculation_profile_snapshot" as const, weightCounts: { includedActivityCount: rows.filter(v => v.weightNormalized?.state === "available").length, missingWeightActivityCount: rows.filter(v => v.weightNormalized?.state === "missing").length, invalidWeightActivityCount: rows.filter(v => v.weightNormalized?.state === "invalid").length, incompatibleWeightActivityCount: rows.filter(v => v.weightNormalized?.state === "incompatible").length } }, physicalCandidateCount: groups.size, inspectedActivityCount: rows.length,
        missingSnapshotCount: rows.filter(v => v.reason === "snapshot_missing").length, noContinuousWindowCount: rows.filter(v => v.reason === "no_continuous_window").length,
        duplicateActivityCount: rows.length - groups.size, analysisCoverage: "observed_only" as const, enumerationState: "not_certified" as const };
    }) };
  });
}
