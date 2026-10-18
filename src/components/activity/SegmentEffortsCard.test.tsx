import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SegmentEffortsCard, { type SegmentEffortData } from "./SegmentEffortsCard";
const locale = vi.hoisted(() => ({ units: "metric" as "metric" | "imperial" }));
vi.mock("../../contexts/LocaleContext", () => ({ useLocale: () => locale }));
beforeEach(() => { locale.units = "metric"; });
const native = { id: "orider_a_native", name: "Synthetic segment", elapsedTime: 120000, movingTime: 120000, distance: 1000, startIndex: 1, endIndex: 2, averageWatts: null, averageHeartrate: null, maxHeartrate: null, averageCadence: null, prRank: null, komRank: null, achievements: [], segment: { id: "native", name: "Synthetic segment", distance: 1000, averageGrade: 0, maximumGrade: 0, elevationHigh: 1, elevationLow: 0, climbCategory: 0, starred: false } } satisfies SegmentEffortData;
describe("activity segment link context", () => {
  it("keeps map selection separate from the detail link and previews keyboard focus", () => {
    const onHover = vi.fn(), onViewOnMap = vi.fn();
    render(<MemoryRouter><SegmentEffortsCard efforts={[native]} activityId="orider_a" showAll={false} setShowAll={() => {}} onHover={onHover} onViewOnMap={onViewOnMap} canViewOnMap={() => true} selectedEffortId={native.id} formatTime={() => "2:00"} /></MemoryRouter>);
    const action = screen.getByRole("button", { name: `${native.name} 지도에서 보기` });
    expect(action).toHaveAttribute("aria-pressed", "true");
    fireEvent.focus(action);
    expect(onHover).toHaveBeenLastCalledWith(native);
    fireEvent.click(action);
    expect(onViewOnMap).toHaveBeenCalledWith(native, action);
    expect(screen.getByRole("link", { name: native.name })).toHaveAttribute("href", "/ko/segment/native?currentActivityId=orider_a&currentEffortId=orider_a_native");
    fireEvent.blur(action, { relatedTarget: document.body });
    expect(onHover).toHaveBeenLastCalledWith(null);
  });
  it("does not offer a map action when the effort has no trustworthy route range", () => {
    render(<MemoryRouter><SegmentEffortsCard efforts={[native]} showAll={false} setShowAll={() => {}} onHover={() => {}} onViewOnMap={() => {}} canViewOnMap={() => false} formatTime={() => "2:00"} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: /지도에서 보기/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: native.name })).toBeInTheDocument();
  });
  it("does not count a third-best effort as a personal record", () => {
    render(<MemoryRouter><SegmentEffortsCard efforts={[{ ...native, prRank: 3 }]} showAll={false} setShowAll={() => {}} onHover={() => {}} formatTime={() => "2:00"} /></MemoryRouter>);
    expect(screen.getByText("3rd")).toBeInTheDocument();
    expect(screen.queryByText("PR 1")).not.toBeInTheDocument();
  });
  it("shows imperial distance and speed while excluding invalid rank counts", () => {
    locale.units = "imperial";
    render(<MemoryRouter><SegmentEffortsCard efforts={[{ ...native, prRank: 0, komRank: -1 }]} showAll={false} setShowAll={() => {}} onHover={() => {}} formatTime={() => "2:00"} /></MemoryRouter>);
    expect(screen.getByText("0.6mi")).toBeInTheDocument();
    expect(screen.getByText("18.6mph")).toBeInTheDocument();
    expect(screen.queryByText("PR 1")).not.toBeInTheDocument();
    expect(screen.queryByText("KOM 1")).not.toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
  });
  it("links the actual current activity and canonical effort ID with localized navigation", () => {
    render(<MemoryRouter><SegmentEffortsCard efforts={[native]} activityId="orider_a" showAll={false} setShowAll={() => {}} onHover={() => {}} formatTime={() => "2:00"} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: native.name })).toHaveAttribute("href", "/ko/segment/native?currentActivityId=orider_a&currentEffortId=orider_a_native");
  });
});
