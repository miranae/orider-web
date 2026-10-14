import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getDocs: vi.fn(), query: vi.fn((...args: unknown[]) => args), where: vi.fn((...args: unknown[]) => ({ where: args })) }));
vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => args,
  getDocs: mocks.getDocs, query: mocks.query, where: mocks.where,
  orderBy: (...args: unknown[]) => ({ orderBy: args }),
  limit: (count: number) => ({ limit: count }), startAfter: (cursor: unknown) => ({ cursor }),
}));
vi.mock("../../services/firebase", () => ({ firestore: {} }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));
import { searchVisibleCoursesByName, useCourseCatalog } from "./useCourseCatalog";
const doc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });
describe("owner course queries", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getDocs.mockResolvedValue({ docs: [] }); });
  it("requests only the current owner's courses before paging and filters hidden/deleted documents", async () => {
    mocks.getDocs.mockResolvedValue({ docs: [doc("visible", { name: "Own", creatorId: "uid-a" }), doc("hidden", { hidden: true }), doc("deleted", { deletedAt: 1 })] });
    const { result } = renderHook(() => useCourseCatalog("latest", "uid-a"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.where).toHaveBeenCalledWith("creatorId", "==", "uid-a");
    expect(result.current.courses.map((course) => course.id)).toEqual(["visible"]);
  });
  it("search combines the owner constraint with the prefix query", async () => {
    await searchVisibleCoursesByName("Ride", 80, new Map(), new Map(), "uid-b");
    expect(mocks.where).toHaveBeenCalledWith("creatorId", "==", "uid-b");
    expect(mocks.where).toHaveBeenCalledWith("name", ">=", "Ride");
  });
  it("does not constrain guest/public search to an owner", async () => {
    await searchVisibleCoursesByName("Ride");
    expect(mocks.where.mock.calls.some(([field]) => field === "creatorId")).toBe(false);
  });
});
