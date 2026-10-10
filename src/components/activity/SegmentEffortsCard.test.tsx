import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import SegmentEffortsCard, { type SegmentEffortData } from "./SegmentEffortsCard";
const native = { id: "orider_a_native", name: "Synthetic segment", elapsedTime: 120000, movingTime: 120000, distance: 1000, startIndex: 1, endIndex: 2, averageWatts: null, averageHeartrate: null, maxHeartrate: null, averageCadence: null, prRank: null, komRank: null, achievements: [], segment: { id: "native", name: "Synthetic segment", distance: 1000, averageGrade: 0, maximumGrade: 0, elevationHigh: 1, elevationLow: 0, climbCategory: 0, starred: false } } satisfies SegmentEffortData;
describe("activity segment link context", () => {
  it("links the actual current activity and canonical effort ID with localized navigation", () => {
    render(<MemoryRouter><SegmentEffortsCard efforts={[native]} activityId="orider_a" showAll={false} setShowAll={() => {}} onHover={() => {}} formatTime={() => "2:00"} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: native.name })).toHaveAttribute("href", "/ko/segment/native?currentActivityId=orider_a&currentEffortId=orider_a_native");
  });
});
