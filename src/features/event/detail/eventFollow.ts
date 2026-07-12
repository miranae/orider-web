export function buildEventFollowPayload(eventId: string, follow: boolean) {
  return { eventId, follow };
}

export function followerExists(snapshot: { exists: () => boolean }): boolean {
  return snapshot.exists();
}
