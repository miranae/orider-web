export interface PrivateSnapshotLocations<T> {
  storage?: "pages";
  pageIds?: string[];
  locationCount?: number;
  locations?: T[];
}

export async function loadPrivateSnapshotLocations<T>(
  snapshot: PrivateSnapshotLocations<T>,
  readPage: (pageId: string) => Promise<T[]>,
): Promise<T[]> {
  if (snapshot.storage !== "pages") return snapshot.locations ?? [];
  const pageIds = snapshot.pageIds;
  if (!Array.isArray(pageIds) || pageIds.length > 100 || pageIds.some((id) => !/^[a-zA-Z0-9_-]+$/.test(id))) {
    throw new Error("잘못된 이벤트 위치 페이지 목록");
  }
  const pages = await Promise.all(pageIds.map(readPage));
  const locations = pages.flat();
  if (locations.length !== snapshot.locationCount) throw new Error("이벤트 위치 페이지 수 불일치");
  return locations;
}

export async function loadPrivateSnapshotWithRetry<T, S extends PrivateSnapshotLocations<T>>(
  snapshot: S,
  readPage: (pageId: string) => Promise<T[]>,
  readLatest: () => Promise<S | null>,
): Promise<{ snapshot: S; locations: T[] }> {
  try {
    return { snapshot, locations: await loadPrivateSnapshotLocations(snapshot, readPage) };
  } catch (error) {
    if (snapshot.storage !== "pages") throw error;
    const latest = await readLatest();
    if (!latest || JSON.stringify(latest.pageIds) === JSON.stringify(snapshot.pageIds)) throw error;
    return { snapshot: latest, locations: await loadPrivateSnapshotLocations(latest, readPage) };
  }
}
