export type SegmentCategory = "climb" | "sprint" | "flat";

export function deriveSegmentCategory(stats: { avgGrade: number; distance: number }): SegmentCategory {
  if (stats.avgGrade > 3) return "climb";
  if (stats.distance < 1000 && stats.avgGrade < 1) return "sprint";
  return "flat";
}
