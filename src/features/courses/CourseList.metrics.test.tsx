import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { CourseList } from "./CourseList";
import type { CourseData } from "./courseSnapshot";

const course: CourseData = {
  id: "course", name: "읽을 수 있는 코스", polyline: "", distance: 52200, elevationGain: 942,
  climbs: [{ gain: 100, dist: 2000, cat: 1 }], regions: [], tags: [], autoTags: [], segmentNames: [],
  distanceBand: null, elevationBand: null, difficultyBand: null, bikeLaneRatioStatus: null,
  likeCount: 7, createdAt: 0, surface: null, difficulty: null, startLat: 0, startLon: 0,
  visibility: "public", curated: false, creatorId: null,
};
function show(selected = false) {
  const onSelectCourse = vi.fn();
  renderWithProviders(<CourseList courses={[course]} allCourseCount={1} selectedCourse={selected ? course : null}
    selectedId={selected ? course.id : null} hoveredId={null} searchQuery="" cardRefs={{ current: new Map() }} mapUnavailable={false}
    onHoverCourse={vi.fn()} onSelectCourse={onSelectCourse} onOpenCourse={vi.fn()} />);
  return onSelectCourse;
}
describe("course list metric meanings", () => {
  it("labels values and explains ascent per kilometre from the existing distance and gain", () => {
    const select = show();
    expect(screen.getByText("이동거리")).toBeInTheDocument();
    expect(screen.getByText("52.2 km")).toBeInTheDocument();
    expect(screen.getByText("942 m")).toBeInTheDocument();
    fireEvent.click(screen.getByText("거리당상승"));
    expect(screen.getByRole("tooltip")).toHaveTextContent("942 m");
    expect(screen.getByRole("tooltip")).toHaveTextContent("52.2 km");
    expect(screen.getByRole("tooltip")).toHaveTextContent("18.0 m/km");
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: course.name }));
    expect(select).toHaveBeenCalledExactlyOnceWith(course.id);
  });
  it("explains an individual climb separately from the course maximum", () => {
    show(true);
    fireEvent.click(screen.getByRole("button", { name: "등반등급" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("이 오르막 구간");
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("중 가장 높은");
  });
  it("labels the saved like count as likes rather than sharing in the selected panel", () => {
    show(true);
    expect(screen.getAllByText("좋아요수")).toHaveLength(2);
    expect(screen.queryByText("공유")).not.toBeInTheDocument();
    expect(screen.getAllByText("7")).toHaveLength(2);
  });
});


it("explains zero filtered results and offers a filter reset instead of blaming the map", () => {
  const reset = vi.fn();
  renderWithProviders(<CourseList courses={[]} allCourseCount={59} filtersActive onResetFilters={reset} selectedCourse={null} selectedId={null} hoveredId={null} searchQuery="" cardRefs={{ current: new Map() }} mapUnavailable={false} onHoverCourse={vi.fn()} onSelectCourse={vi.fn()} onOpenCourse={vi.fn()} />);
  expect(screen.getByText("선택한 조건에 맞는 코스가 없습니다.")).toBeInTheDocument();
  expect(screen.queryByText(/지도를 이동/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "조건 초기화" }));
  expect(reset).toHaveBeenCalledOnce();
});
