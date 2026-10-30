import { mockCollectionData, setCallableImplementation } from "../mocks/firebase";

/** UI fixtures represent already-authorized server rows. Authorization itself is tested in the backend. */
export function installEventDiscoveryFixture() {
  setCallableImplementation("listVisibleEventEnvelopes", input => {
    const options = input as { groupId?: string; publicOnly?: boolean; statuses?: string[]; limit?: number; cursor?: string; descending?: boolean };
    const all = (mockCollectionData.get("events") ?? []).filter(row => {
      const info = (row.info ?? {}) as Record<string, unknown>;
      return (!options.groupId || info.groupId === options.groupId)
        && (!options.statuses || options.statuses.includes(String(info.status)))
        && (!options.publicOnly || (info.visibility === "PUBLIC" && info.kind !== "CLUB_MEETING"));
    }).sort((a, b) => {
      const left = Number((a.info as Record<string, unknown>)?.startTime ?? 0);
      const right = Number((b.info as Record<string, unknown>)?.startTime ?? 0);
      return options.descending ? right - left : left - right;
    });
    const start = options.cursor ? all.findIndex(row => row.id === options.cursor) + 1 : 0;
    const rows = all.slice(start, start + (options.limit ?? 100)).map(row => ({ id: row.id, data: row }));
    return { data: { rows, nextCursor: start + rows.length < all.length ? rows.at(-1)?.id ?? null : null } };
  });
}
