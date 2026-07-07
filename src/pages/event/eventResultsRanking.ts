export const OVERALL_CATEGORY = "__overall__";

export interface RankedResultLike {
  userId: string;
  status: string;
  rank: number;
  overallRank: number;
}

export function displayRankForCategory(
  result: Pick<RankedResultLike, "rank" | "overallRank" | "status">,
  activeCategory: string,
): number {
  if (result.status !== "FINISHED") return 0;
  return activeCategory === OVERALL_CATEGORY ? result.overallRank : result.rank;
}

export function podiumForCategory<T extends RankedResultLike>(
  results: T[],
  activeCategory: string,
): T[] {
  return results
    .filter((result) => {
      const displayRank = displayRankForCategory(result, activeCategory);
      return displayRank > 0 && displayRank <= 3;
    })
    .sort((a, b) =>
      displayRankForCategory(a, activeCategory) - displayRankForCategory(b, activeCategory))
    .slice(0, 3);
}
