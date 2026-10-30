import type { ActivityNarrativeGrounding, NarrativeGroundingWindow } from "@shared/activity-narrative-grounding";
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const time = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 && Number.isFinite(new Date(value).getTime());
function window(value: unknown): value is NarrativeGroundingWindow {
  return record(value) && time(value.fromMs) && time(value.toMs) && Number(value.fromMs) < Number(value.toMs)
    && typeof value.fromInclusive === "boolean" && typeof value.toExclusive === "boolean";
}
/** Old or malformed cache metadata is unknown evidence, never reconstructed from current records. */
export function validActivityNarrativeGrounding(value: unknown, generatedAt: number): value is ActivityNarrativeGrounding {
  if (!record(value) || value.version !== 1 || !time(generatedAt) || value.generatedAt !== generatedAt
    || !Array.isArray(value.blocks) || value.blocks.length === 0) return false;
  return value.blocks.every((block: unknown) => record(block)
    && ["coach_history", "fitness_context", "personal_baseline", "segment_history"].includes(String(block.kind))
    && ["activity_relative", "generation_time"].includes(String(block.basis))
    && ["sample", "complete_query", "unknown"].includes(String(block.coverage))
    && (block.window === null || window(block.window))
    && Array.isArray(block.comparisonWindows) && block.comparisonWindows.every(window)
    && (block.scanLimit === null || count(block.scanLimit)) && count(block.scannedCount) && count(block.selectedCount)
    && (block.missingCount === null || count(block.missingCount)) && typeof block.capReached === "boolean"
    && count(block.sourceCount) && typeof block.sourcesTruncated === "boolean" && typeof block.sourceSetDigest === "string"
    && Array.isArray(block.sources) && block.sourceCount >= block.sources.length && block.sources.every((source: unknown) => record(source)
      && ["activity", "metrics", "profile", "fitness", "segment_effort"].includes(String(source.kind))
      && (source.activityId === null || typeof source.activityId === "string" && source.activityId.length > 0)
      && (source.revision === null || typeof source.revision === "string" && source.revision.length > 0)));
}
