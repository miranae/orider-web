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

/** UI scopes follow the callable/rules contracts; role-only operators cannot read host data. */
export function eventPermissions(userId: string | null | undefined, event: EventHostSource | null | undefined, role?: string | null) {
  const canReadData = Boolean(userId && event && (event.creatorId === userId || event.hostIds?.includes(userId)));
  const leader = Boolean(userId && event && role === "LEADER");
  const staff = Boolean(userId && event && role === "STAFF");
  return { canEnter: canReadData || leader || staff, canReadData, canStartFinish: leader, canAnnounce: leader || staff };
}
