// Canonical backend list-my-registered-events ACTIVE_PARTICIPANT_STATUSES.
export function isActiveEventRegistration(status: unknown): boolean {
  return typeof status === "string" && ["REGISTERED", "PAID", "CHECKED_IN", "RIDING"].includes(status);
}
