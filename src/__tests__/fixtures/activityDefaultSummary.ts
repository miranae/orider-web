import type { Activity } from "@shared/types";
import { activityFeedSourceRevision } from "../../services/activityFeedContent";

export const STORED_ACTIVITY_SUMMARY = "저장된 활동 요약\n 1s 10s\n938 767";
export function withStoredSummary(activity: Activity, ko = STORED_ACTIVITY_SUMMARY, en = "Stored activity summary"): Activity {
  return { ...activity, defaultSummaryV1: {
    version: 1, formatterVersion: "strava-share-v29", sourceRevision: activityFeedSourceRevision(activity),
    inputDigest: "a".repeat(64), state: "ready", text: { ko, en }, generatedAt: 1,
  } };
}
