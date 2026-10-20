import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useLocation, useNavigate } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import type { CourseData } from "../features/courses/courseSnapshot";
import CoursesPage from "./CoursesPage";

const { mockLogClientError } = vi.hoisted(() => ({
  mockLogClientError: vi.fn(),
}));

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

vi.mock("../services/errorLogger", () => ({
  logClientError: mockLogClientError,
}));

vi.mock("../features/courses/useCourseCatalog", () => ({
  searchVisibleCoursesPage: vi.fn().mockResolvedValue({ items: [], cursor: null, hasMore: false }),
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
  CoursesMap: ({ className, onMapFailed }: { className?: string; onMapFailed: (error: unknown, context: Record<string, unknown>) => void }) => (
    <div data-testid="courses-map" className={className}>
      지도
      <button type="button" onClick={() => onMapFailed(new Error("style blocked"), { phase: "style-load", status: 403 })}>
        지도 실패
      </button>
    </div>
  ),
}));

describe("CoursesPage mobile layout", () => {
  beforeEach(() => {
    mockLogClientError.mockClear();
  });

  it("applies menu surface and difficulty filters, external updates, reset, and history on the mounted page", async () => {
    function RouteControls() {
      const navigate = useNavigate();
      const location = useLocation();
      return <>
        <output data-testid="route">{location.search}</output>
        <button onClick={() => navigate("/explore/courses?surface=paved&difficulty=1&mine=1")}>Menu course filters</button>
        <button onClick={() => navigate("/explore/courses")}>Clear menu course filters</button>
        <button onClick={() => navigate(-1)}>Back</button>
      </>;
    }
    renderWithProviders(<><RouteControls /><CoursesPage /></>, {
      route: "/explore/courses?surface=gravel&difficulty=2", authenticated: true,
    });
    expect(screen.queryByRole("heading", { name: "남한강 자전거길" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "코스 조건 · 2개 적용" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Menu course filters" }));
    expect(await screen.findByRole("heading", { name: "북한강 코스" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "남한강 자전거길" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "내 코스" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Clear menu course filters" }));
    expect(await screen.findByRole("heading", { name: "남한강 자전거길" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "코스 조건 · 0개 적용" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "남한강 자전거길" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByTestId("course-mobile-reset"));
    expect(await screen.findByRole("heading", { name: "남한강 자전거길" })).toBeInTheDocument();
    expect(screen.getByTestId("route")).toHaveTextContent("?mine=1");
  });

  it("preserves active conditions when folded and resets them without clearing My Courses or search", async () => {
    renderWithProviders(<CoursesPage />, { route: "/explore/courses", authenticated: true });
    const filterPanel = screen.getByTestId("E1-3");
    const filters = within(filterPanel);
    expect(filterPanel).toHaveAttribute("data-collapsed", "true");
    await userEvent.click(screen.getByRole("button", { name: "코스 조건 · 0개 적용" }));
    expect(filterPanel).toHaveAttribute("data-collapsed", "false");
    await userEvent.click(filters.getByRole("button", { name: "비포장" }));
    fireEvent.change(filters.getByRole("slider", { name: "최소 이동거리" }), { target: { value: "20" } });
    await userEvent.click(screen.getByRole("button", { name: "내 코스" }));
    await userEvent.type(screen.getByTestId("E1-1-1"), "draft");
    const conditions = screen.getByRole("button", { name: "코스 조건 · 2개 적용" });
    await userEvent.click(conditions);
    expect(filterPanel).toHaveAttribute("data-collapsed", "true");
    expect(conditions).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(screen.getByTestId("course-mobile-reset"));
    expect(screen.getByRole("button", { name: "코스 조건 · 0개 적용" })).toBeInTheDocument();
    expect(filters.getByRole("slider", { name: "최소 이동거리" })).toHaveValue("0");
    expect(screen.getByRole("button", { name: "내 코스" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("E1-1-1")).toHaveValue("draft");
  });

  it("keeps the map hidden by default and shows it from the mobile toggle", async () => {
    renderWithProviders(<CoursesPage />, { route: "/explore/courses" });

    expect(screen.getByRole("heading", { name: "남한강 자전거길" })).toBeInTheDocument();
    expect(screen.getByTestId("courses-map")).toHaveClass("hidden");

    await userEvent.click(screen.getByRole("button", { name: "지도 보기" }));

    expect(screen.getByTestId("courses-map")).not.toHaveClass("hidden");
    expect(screen.getByTestId("courses-map")).toHaveClass("h-56");
    expect(screen.getByRole("button", { name: "지도 접기" })).toHaveAttribute("aria-expanded", "true");
  });

  it("logs a fatal map failure and lets the user retry without leaving the page", async () => {
    renderWithProviders(<CoursesPage />, { route: "/explore/courses" });

    await userEvent.click(within(screen.getByTestId("courses-map")).getByRole("button", { name: "지도 실패" }));

    expect(mockLogClientError).toHaveBeenCalledWith(
      "CoursesPage.map",
      expect.objectContaining({ message: "style blocked" }),
      { phase: "style-load", status: 403 },
    );
    expect(screen.queryByTestId("courses-map")).not.toBeInTheDocument();
    expect(screen.getByText("지도 표시를 준비하지 못했습니다")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "지도 다시 불러오기" }));

    expect(screen.getByTestId("courses-map")).toBeInTheDocument();
  });
});
