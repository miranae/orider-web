import { renderHook, waitFor } from "@testing-library/react";
import { getCountFromServer, getDocs } from "firebase/firestore";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import { AuthProvider } from "../contexts/AuthContext";
import { ToastProvider } from "../contexts/ToastContext";
import { invalidateCoursesCache } from "./useCourses";
import { useGlobalSearch } from "./useGlobalSearch";

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("useGlobalSearch", () => {
  beforeEach(() => {
    vi.mocked(getDocs).mockClear();
    vi.mocked(getCountFromServer).mockClear();
    invalidateCoursesCache();
  });

  it("does not initialize activity or course reads for an empty normalized query", async () => {
    const { result } = renderHook(() => useGlobalSearch("   "), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.results).toEqual({ activities: [], courses: [] });
    expect(getDocs).not.toHaveBeenCalled();
    expect(getCountFromServer).not.toHaveBeenCalled();
  });

  it("loads and filters both sources after a query is entered", async () => {
    setCollectionDocs("activities", [{
      id: "ride-1",
      userId: "user-1",
      type: "Ride",
      startTime: 1,
      createdAt: 1,
      description: "Tempo ride",
      visibility: "everyone",
      deletedAt: null,
      summary: { distance: 10_000, ridingTimeMillis: 1_000 },
    }]);
    setCollectionDocs("courses", [{
      id: "course-1",
      name: "Tempo loop",
      creatorId: "user-1",
      regions: ["Seoul"],
      deletedAt: null,
      likeCount: 1,
    }]);
    const hook = renderHook(({ query }) => useGlobalSearch(query), {
      wrapper,
      initialProps: { query: "" },
    });

    expect(getDocs).not.toHaveBeenCalled();
    hook.rerender({ query: "  TEMPO  " });

    await waitFor(() => {
      expect(hook.result.current.loading).toBe(false);
      expect(hook.result.current.results.activities.map((item) => item.id)).toEqual(["ride-1"]);
      expect(hook.result.current.results.courses.map((item) => item.id)).toEqual(["course-1"]);
    });
  });
});
