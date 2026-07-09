import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import type { CourseData } from "../features/courses/courseSnapshot";
import CoursesPage from "./CoursesPage";

const mockCourses: CourseData[] = [
  {
    id: "course-a",
    name: "남한강 자전거길",
    polyline: "",
    distance: 42000,
    elevationGain: 320,
    climbs: [],
    regions: ["양평"],
    tags: ["distance:long"],
    autoTags: [],
    segmentNames: [],
    distanceBand: "long",
    elevationBand: "rolling",
    difficultyBand: "moderate",
    bikeLaneRatioStatus: null,
    likeCount: 3,
    createdAt: 2,
    surface: "paved",
    difficulty: 2,
    startLat: 37.5,
    startLon: 127.0,
    visibility: "public",
    curated: false,
    creatorId: null,
  },
  {
    id: "course-b",
    name: "북한강 코스",
    polyline: "",
    distance: 30000,
    elevationGain: 210,
    climbs: [],
    regions: ["춘천"],
    tags: [],
    autoTags: [],
    segmentNames: [],
    distanceBand: null,
    elevationBand: null,
    difficultyBand: null,
    bikeLaneRatioStatus: null,
    likeCount: 1,
    createdAt: 1,
    surface: "paved",
    difficulty: 1,
    startLat: 37.6,
    startLon: 127.1,
    visibility: "public",
    curated: false,
    creatorId: null,
  },
];

vi.mock("../utils/mapbox", () => ({
  getMapboxToken: () => "test-token",
}));

vi.mock("../features/courses/useCourseCatalog", () => ({
  useCourseCatalog: () => ({
    courses: mockCourses,
    loading: false,
    loadingMore: false,
    hasMore: false,
    loadMore: vi.fn(),
    polylineCache: { current: new Map() },
  }),
}));

vi.mock("../features/courses/CoursesMap", () => ({
  isCourseInBounds: () => true,
  CoursesMap: ({ className }: { className?: string }) => (
    <div data-testid="courses-map" className={className}>지도</div>
  ),
}));

describe("CoursesPage mobile layout", () => {
  it("keeps the map hidden by default and shows it from the mobile toggle", async () => {
    renderWithProviders(<CoursesPage />, { route: "/courses" });

    expect(screen.getByText("남한강 자전거길")).toBeInTheDocument();
    expect(screen.getByTestId("courses-map")).toHaveClass("hidden");

    await userEvent.click(screen.getByRole("button", { name: "지도 보기" }));

    expect(screen.getByTestId("courses-map")).not.toHaveClass("hidden");
    expect(screen.getByTestId("courses-map")).toHaveClass("h-56");
    expect(screen.getByRole("button", { name: "지도 접기" })).toHaveAttribute("aria-expanded", "true");
  });
});
