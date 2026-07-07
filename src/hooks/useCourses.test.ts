import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import type { Course } from "@shared/types";
import { AuthProvider } from "../contexts/AuthContext";
import { ToastProvider } from "../contexts/ToastContext";
import { simulateLogin, setCollectionDocs } from "../__tests__/mocks/firebase";
import { invalidateCoursesCache, useCourses } from "./useCourses";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    MemoryRouter,
    null,
    React.createElement(
      AuthProvider,
      null,
      React.createElement(ToastProvider, null, children),
    ),
  );
}

function course(id: string, creatorId: string): Course {
  return {
    id,
    name: id,
    description: "",
    creatorId,
    creatorNickname: creatorId,
    creatorProfileImage: null,
    source: "gpx",
    sourceActivityId: null,
    polyline: "",
    startLat: 0,
    startLon: 0,
    endLat: 0,
    endLon: 0,
    geoHash: "",
    distance: 0,
    elevationGain: 0,
    averageGrade: 0,
    maximumGrade: 0,
    elevationHigh: 0,
    elevationLow: 0,
    keywords: [],
    regions: [],
    likeCount: 0,
    viewCount: 0,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  };
}

describe("useCourses", () => {
  beforeEach(() => {
    invalidateCoursesCache();
  });

  it("does not seed another user's cached courses on first render", async () => {
    simulateLogin({ uid: "user-a" });
    setCollectionDocs("courses", [course("private-a", "user-a")]);

    const first = renderHook(() => useCourses(), { wrapper });
    await waitFor(() => {
      expect(first.result.current.loading).toBe(false);
    });
    expect(first.result.current.courses.map((c) => c.id)).toContain("private-a");
    first.unmount();

    simulateLogin({ uid: "user-b" });
    setCollectionDocs("courses", [course("course-b", "user-b")]);

    const second = renderHook(() => useCourses(), { wrapper });
    expect(second.result.current.courses).toEqual([]);

    await waitFor(() => {
      expect(second.result.current.loading).toBe(false);
    });
    expect(second.result.current.courses.map((c) => c.id)).toEqual(["course-b"]);
  });
});
