import { track } from "./analytics";

export type JourneyEvent = "feed_first_content" | "activity_detail_ready" | "analysis_ready" | "social_action_result" | "club_join" | "share_open";
export type JourneySurface = "web_home_feed" | "web_owner_activity" | "web_public_activity" | "embedded_public_activity" | "training_period_analysis" | "web_club_invite";
export type JourneyOutcome = "success" | "error" | "cancelled" | "access_denied" | "readback_error" | "empty" | "no_sensor" | "partial" | "stale" | "pending" | "unavailable";
export type JourneyOperation = "feed_initial" | "activity_analysis" | "detail" | "training_periods" | "kudos" | "comment" | "join" | "open";

/** Fixed dimensions only: never accept IDs, dates, metric values or error messages. */
export function startJourneyMeasurement(event: JourneyEvent, surface: JourneySurface, operation: JourneyOperation) {
  const start = performance.now();
  let finished = false;
  return (outcome: JourneyOutcome) => {
    if (finished) return;
    finished = true;
    const end = performance.now();
    const payload = { surface, operation, outcome, durationMs: Math.max(0, Math.round(end - start)) };
    // Instrumentation must never change a successful user action into a failure.
    try { track(event, payload); } catch { /* analytics can be unavailable */ }
    try {
      // Observers receive every outcome, including cancellation and failure. Bound retained entries.
      if (performance.getEntriesByName(event, "measure").length >= 50) performance.clearMeasures(event);
      performance.measure(event, { start, end, detail: payload });
    } catch { /* older browsers may not implement measure options */ }
  };
}
