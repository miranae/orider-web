import { beforeEach, expect, it, vi } from "vitest";
import { getDocs, query } from "firebase/firestore";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { createGearInspection, inspectGear, inspectGearPage } from "./athleteGearInspection";
let services: FirebaseServices;
type Row = { id: string; userId: string; deletedAt: null; gear?: { name: string; totalDistanceKm: number; maxDistanceKm: number } };
let records: Row[];
let requests: Array<{ constraints: { type: string; args: unknown[] }[] }>;
const row = (index: number, gear?: Row["gear"]): Row => ({ id: `r${String(index).padStart(6, "0")}`, userId: "owner", deletedAt: null, gear });
beforeEach(() => {
  services = { auth: { currentUser: { uid: "owner" } }, firestore: {} } as FirebaseServices;
  records = []; requests = [];
  vi.mocked(query).mockImplementation(((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints })) as never);
  vi.mocked(getDocs).mockImplementation((async (q: typeof requests[number]) => {
    requests.push(q);
    const cursor = q.constraints.find(c => c.type === "startAfter")?.args[0] as { id: string } | undefined;
    const start = cursor ? records.findIndex(r => r.id === cursor.id) + 1 : 0;
    const size = q.constraints.find(c => c.type === "limit")!.args[0] as number;
    return { docs: records.slice(start, start + size).map(r => ({ id: r.id, data: () => r })) };
  }) as never);
});
it("does no reads until explicitly opened and keeps raw name maxima with first-ID ties", async () => {
  records = [row(0, { name: "chain", totalDistanceKm: 90, maxDistanceKm: 100 }), row(1, { name: "chain", totalDistanceKm: 90, maxDistanceKm: 999 }), row(2, { name: "tire", totalDistanceKm: 20, maxDistanceKm: 200 })];
  const session = createGearInspection("owner", services);
  expect(requests).toHaveLength(0);
  await inspectGear(session, services, () => true);
  expect(session.complete).toBe(true);
  expect(session.gears.get("chain")).toEqual(records[0]!.gear);
  expect(requests).toHaveLength(1);
  await inspectGear(session, services, () => true, true);
  expect(requests).toHaveLength(1);
});
it("caps explicit All at 10,000 raw documents, resumes a stable cursor, and proves EOF separately", async () => {
  records = Array.from({ length: 10001 }, (_, i) => row(i));
  const session = createGearInspection("owner", services);
  expect(await inspectGear(session, services, () => true, true)).toEqual({ limited: true });
  expect(session).toMatchObject({ loaded: 10000, complete: false });
  expect(requests).toHaveLength(200);
  expect(requests.every(q => q.constraints.some(c => c.type === "limit" && c.args[0] === 50))).toBe(true);
  await inspectGear(session, services, () => true);
  expect(session).toMatchObject({ loaded: 10001, complete: true });
  expect(requests[200]!.constraints).toContainEqual({ type: "startAfter", args: [expect.objectContaining({ id: "r009999" })] });
});
it("coalesces duplicate opens and pauses at a committed page boundary", async () => {
  records = Array.from({ length: 51 }, (_, i) => row(i));
  const session = createGearInspection("owner", services);
  const impl = vi.mocked(getDocs).getMockImplementation()!;
  vi.mocked(getDocs).mockImplementationOnce((async q => { session.paused = true; return impl(q); }) as never);
  await Promise.all([inspectGear(session, services, () => true, true), inspectGear(session, services, () => true, true)]);
  expect(requests).toHaveLength(1);
  expect(session).toMatchObject({ loaded: 50, complete: false });
  await inspectGear(session, services, () => true, true);
  expect(session.complete).toBe(true);
});
it("keeps the last committed page after error and retries without refetching it", async () => {
  records = Array.from({ length: 51 }, (_, i) => row(i));
  const session = createGearInspection("owner", services);
  await inspectGear(session, services, () => true);
  vi.mocked(getDocs).mockRejectedValueOnce(new Error("offline"));
  await expect(inspectGear(session, services, () => true, true)).rejects.toThrow("offline");
  expect(session).toMatchObject({ loaded: 50, complete: false, busy: false });
  await inspectGear(session, services, () => true);
  expect(session).toMatchObject({ loaded: 51, complete: true });
});
it("rejects a late page after same-UID session replacement without caching its gear", async () => {
  const session = createGearInspection("owner", services);
  vi.mocked(getDocs).mockImplementationOnce((async () => {
    services.auth.currentUser = { uid: "owner" } as never;
    return { docs: [{ id: "legacy:한글.1", data: () => row(1, { name: "late", totalDistanceKm: 1, maxDistanceKm: 2 }) }] };
  }) as never);
  await expect(inspectGearPage(session, services, () => true)).rejects.toThrow("session-changed");
  expect(session.loaded).toBe(0); expect(session.gears.size).toBe(0);
});
it("accepts valid Unicode document IDs in Firestore order", async () => {
  const session = createGearInspection("owner", services);
  const ids = ["legacy:한글.1", "\ue000", "\u{10000}"];
  vi.mocked(getDocs).mockResolvedValueOnce({ docs: ids.map(id => ({ id, data: () => row(1) })) } as never);
  await inspectGearPage(session, services, () => true);
  expect(session).toMatchObject({ loaded: 3, complete: true });
});
it("does not reuse a completed cache or cursor with a replacement provider for the same SDK user", async () => {
  records = [row(0, { name: "old-provider", totalDistanceKm: 1, maxDistanceKm: 2 })];
  const old = createGearInspection("owner", services);
  await inspectGear(old, services, () => true);
  const replacement = { ...services, firestore: { project: "replacement" } } as unknown as FirebaseServices;
  await expect(inspectGear(old, replacement, () => true)).rejects.toThrow("session-changed");
  expect(requests).toHaveLength(1);
  records = [row(0, { name: "new-provider", totalDistanceKm: 3, maxDistanceKm: 4 })];
  const fresh = createGearInspection("owner", replacement);
  await inspectGear(fresh, replacement, () => true);
  expect(fresh.gears.has("new-provider")).toBe(true);
  expect(fresh.gears.has("old-provider")).toBe(false);
});
it("does not commit an in-flight old provider page after a same-user replacement", async () => {
  const old = createGearInspection("owner", services);
  let active = old;
  let release!: (value: unknown) => void;
  vi.mocked(getDocs).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }) as never);
  const pending = expect(inspectGear(old, services, () => active === old)).rejects.toThrow("session-changed");
  const replacement = { ...services, firestore: { project: "replacement" } } as unknown as FirebaseServices;
  active = createGearInspection("owner", replacement);
  old.valid = false;
  release({ docs: [{ id: "legacy:한글.1", data: () => row(1, { name: "stale", totalDistanceKm: 1, maxDistanceKm: 2 }) }] });
  await pending;
  expect(active.loaded).toBe(0); expect(active.gears.size).toBe(0);
  expect(old.loaded).toBe(0); expect(old.gears.size).toBe(0);
});
