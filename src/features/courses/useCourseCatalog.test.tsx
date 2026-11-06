import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  firestore: { app: { options: { projectId: "proj" } }, toJSON: () => ({ settings: { host: "firestore.googleapis.com", ssl: true } }) },
  auth: { currentUser: null as null | { getIdToken: () => Promise<string> } },
}));
vi.mock("../../services/firebase", () => ({ ensureAppCheckReady: vi.fn(), getAppCheckToken: vi.fn(), auth: mocks.auth, functions: {}, storage: {}, firestore: mocks.firestore }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));
import { searchVisibleCoursesByName, searchVisibleCoursesPage, useCourseCatalog } from "./useCourseCatalog";
import type { CourseListServices } from "./courseListRest";

const services = { firestore: mocks.firestore, auth: mocks.auth } as unknown as CourseListServices;
const PATH = "projects/proj/databases/(default)/documents/courses/";
const restDoc = (id: string, fields: Record<string, unknown>) => ({ document: { name: `${PATH}${id}`, fields }, readTime: "2026-11-06T00:00:00Z" });
const str = (value: string) => ({ stringValue: value });

const fetchMock = vi.fn();
const respond = (items: unknown[]) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(items), { status: 200 }));
const sentQuery = (call: number) => JSON.parse(fetchMock.mock.calls[call]![1].body as string).structuredQuery;

describe("owner course queries", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.auth.currentUser = null;
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("requests only the current owner's courses before paging and filters hidden/deleted documents", async () => {
    mocks.auth.currentUser = { getIdToken: async () => "owner-token" };
    respond([
      restDoc("visible", { name: str("Own"), creatorId: str("uid-a") }),
      restDoc("hidden", { hidden: { booleanValue: true } }),
      restDoc("deleted", { deletedAt: { integerValue: "1" } }),
    ]);
    const { result } = renderHook(() => useCourseCatalog("latest", "uid-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock.mock.calls[0]![0]).toBe("https://firestore.googleapis.com/v1/projects/proj/databases/(default)/documents:runQuery");
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe("Bearer owner-token");
    expect(sentQuery(0).where).toEqual({ fieldFilter: { field: { fieldPath: "creatorId" }, op: "EQUAL", value: str("uid-a") } });
    expect(result.current.courses.map((course) => course.id)).toEqual(["visible"]);
  });

  it("search combines the owner constraint with the prefix query", async () => {
    await searchVisibleCoursesByName(services, "Ride", 80, new Map(), new Map(), "uid-b");
    const query = sentQuery(0);
    expect(query.where.compositeFilter.filters).toEqual([
      { fieldFilter: { field: { fieldPath: "creatorId" }, op: "EQUAL", value: str("uid-b") } },
      { fieldFilter: { field: { fieldPath: "name" }, op: "GREATER_THAN_OR_EQUAL", value: str("Ride") } },
      { fieldFilter: { field: { fieldPath: "name" }, op: "LESS_THAN_OR_EQUAL", value: str("Ride") } },
    ]);
    expect(query.orderBy).toEqual([
      { field: { fieldPath: "name" }, direction: "ASCENDING" },
      { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
    ]);
  });

  it("caps an oversized search request at 20 and continues after the last raw document", async () => {
    respond(Array.from({ length: 20 }, (_, index) => restDoc(String(index), { name: str("Ride"), ...(index === 19 ? { hidden: { booleanValue: true } } : {}) })));
    const first = await searchVisibleCoursesPage(services, "Ride", 1000);
    expect(first.items).toHaveLength(19);
    expect(first.hasMore).toBe(true);
    expect(first.cursor).toEqual({ values: [str("Ride"), { referenceValue: `${PATH}19` }] });
    expect(sentQuery(0).limit).toBe(20);
    expect(sentQuery(0).startAt).toBeUndefined();
    respond([restDoc("last", { name: str("Ride") })]);
    const next = await searchVisibleCoursesPage(services, "Ride", 20, new Map(), new Map(), undefined, first.cursor);
    expect(sentQuery(1).startAt).toEqual({ values: [str("Ride"), { referenceValue: `${PATH}19` }], before: false });
    expect(next.items.map(item => item.id)).toEqual(["last"]);
    expect(next.hasMore).toBe(false);
  });

  it("loads only 20 catalog documents per click and pages with a REST cursor", async () => {
    respond(Array.from({ length: 20 }, (_, index) => restDoc(String(index), { name: str("Ride"), createdAt: { integerValue: String(100 - index) } })));
    respond([]);
    const { result } = renderHook(() => useCourseCatalog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentQuery(0).limit).toBe(20);
    expect(sentQuery(0).orderBy[0]).toEqual({ field: { fieldPath: "createdAt" }, direction: "DESCENDING" });
    expect(result.current.courses[0]!.createdAt).toBe(100);
    await act(async () => result.current.loadMore());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentQuery(1).startAt).toEqual({ values: [{ integerValue: "81" }, { referenceValue: `${PATH}19` }], before: false });
    expect(result.current.hasMore).toBe(false);
  });

  it("orders popular courses by likeCount", async () => {
    const { result } = renderHook(() => useCourseCatalog("popular", undefined, 4));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(sentQuery(0).orderBy[0]).toEqual({ field: { fieldPath: "likeCount" }, direction: "DESCENDING" });
    expect(sentQuery(0).limit).toBe(4);
  });

  it("reports a failed first page as an error and keeps the list empty", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "boom" } }), { status: 500 }));
    const { result } = renderHook(() => useCourseCatalog());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.courses).toEqual([]);
  });

  it("does not constrain guest/public search to an owner", async () => {
    await searchVisibleCoursesByName(services, "Ride");
    const where = sentQuery(0).where.compositeFilter.filters as Array<{ fieldFilter: { field: { fieldPath: string } } }>;
    expect(where.some((filter) => filter.fieldFilter.field.fieldPath === "creatorId")).toBe(false);
  });
});
