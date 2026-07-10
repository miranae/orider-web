interface EventHostSource {
  creatorId?: string | null;
  hostIds?: string[] | null;
}

export function isEventHost(
  userId: string | null | undefined,
  event: EventHostSource | null | undefined,
  participantRole?: string | null,
): boolean {
  if (!userId || !event) return false;
  return userId === event.creatorId || event.hostIds?.includes(userId) === true || participantRole === "LEADER";
}
