export interface ClimbPromotionRange {
  startKm: number;
  endKm: number;
}

function finiteNonNegative(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function buildClimbSegmentProposalPath(
  activityId: string,
  range: ClimbPromotionRange,
): string {
  const params = new URLSearchParams({
    activityId,
    startKm: range.startKm.toString(),
    endKm: range.endKm.toString(),
    category: "climb",
  });
  return `/segment/create?${params.toString()}`;
}

export function readClimbPromotionRange(
  searchParams: Pick<URLSearchParams, "get">,
): ClimbPromotionRange | null {
  const startKm = finiteNonNegative(searchParams.get("startKm"));
  const endKm = finiteNonNegative(searchParams.get("endKm"));
  if (startKm == null || endKm == null || endKm <= startKm) return null;
  return { startKm, endKm };
}

export function resolveClimbPromotionIndices(
  distanceM: number[],
  range: ClimbPromotionRange,
): { startIndex: number; endIndex: number } | null {
  if (distanceM.length < 2) return null;

  const nearestIndex = (targetM: number): number => {
    let bestIndex = 0;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let index = 0; index < distanceM.length; index++) {
      const value = distanceM[index];
      if (!Number.isFinite(value)) continue;
      const delta = Math.abs((value as number) - targetM);
      if (delta < bestDelta) {
        bestIndex = index;
        bestDelta = delta;
      }
    }
    return bestIndex;
  };

  const startIndex = nearestIndex(range.startKm * 1000);
  const endIndex = nearestIndex(range.endKm * 1000);
  if (endIndex <= startIndex) return null;
  return { startIndex, endIndex };
}
