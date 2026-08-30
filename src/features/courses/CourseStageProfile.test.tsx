import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CourseStageProfile } from "./CourseStageProfile";

const profile = [
  { distance: 0, elevation: 100 },
  { distance: 10_000, elevation: 400 },
  { distance: 20_000, elevation: 100 },
  { distance: 30_000, elevation: 500 },
  { distance: 40_000, elevation: 100 },
  { distance: 50_000, elevation: 600 },
  { distance: 60_000, elevation: 100 },
  { distance: 70_000, elevation: 700 },
  { distance: 80_000, elevation: 100 },
  { distance: 90_000, elevation: 800 },
  { distance: 100_000, elevation: 100 },
];

describe("CourseStageProfile", () => {
  it("uses three annotation rows and connects each panel to its numbered ridge point", () => {
    const { container } = render(<CourseStageProfile data={profile} />);
    const slots = [...container.querySelectorAll<HTMLElement>(".course-stage-profile__annotation-slot")];

    expect(slots).toHaveLength(5);
    expect(slots.map((slot) => slot.style.getPropertyValue("--profile-row"))).toEqual(["0", "1", "2", "0", "1"]);
    expect(container.querySelectorAll(".course-stage-profile__connector")).toHaveLength(5);
    expect(container.querySelectorAll(".course-stage-profile__ridge-connector")).toHaveLength(5);
  });

  it("labels derived landmarks truthfully without climb categories", () => {
    render(<CourseStageProfile data={profile} />);

    expect(screen.getAllByText("고점 1").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Cat|HC/)).not.toBeInTheDocument();
    expect(screen.getByText(/오르막 카테고리를 뜻하지 않습니다/)).toBeInTheDocument();
  });

  it("exposes keyboard and touch targets with exact distance and elevation", () => {
    const onHoverIndex = vi.fn();
    const { container } = render(<CourseStageProfile data={profile} onHoverIndex={onHoverIndex} />);
    const target = screen.getAllByRole("button", { name: /주요 고점 3/ }).at(-1)!;

    fireEvent.focus(target);
    expect(target).toHaveAttribute("aria-pressed", "true");
    expect(onHoverIndex).toHaveBeenLastCalledWith(5);
    expect(screen.getByText("50 km")).toBeInTheDocument();
    expect(screen.getByText("600 m")).toBeInTheDocument();
    fireEvent.blur(target);
    expect(onHoverIndex).toHaveBeenLastCalledWith(null);

    const annotation = container.querySelectorAll<HTMLButtonElement>(".course-stage-profile__annotation-card")[2]!;
    fireEvent.focus(annotation);
    fireEvent.blur(annotation);
    expect(onHoverIndex).toHaveBeenLastCalledWith(null);
  });

  it("describes the mobile control by the next landmark it will select", () => {
    render(<CourseStageProfile data={profile} />);
    const next = screen.getByRole("button", { name: /다음 주요 고점 보기: 고점 2/ });

    fireEvent.click(next);
    expect(screen.getByRole("button", { name: /다음 주요 고점 보기: 고점 3/ })).toBeInTheDocument();
  });
});
