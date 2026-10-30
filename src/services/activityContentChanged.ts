/** In-memory invalidation only; never publish comment text, profile data or photo bytes. */
export function announceActivityContentChange(activityId: string): void {
  window.dispatchEvent(new CustomEvent("orider:activity-content-changed", { detail: { activityId } }));
}
