// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CoursePreview from "./CoursePreview";
import { MeetingSegmentCards } from "./MeetingSegments";
import { newClubMeeting } from "./meetingCopy";

// 지도는 이 계약과 무관하다.
vi.mock("./ClubCourseMap", () => ({ default: () => null }));

afterEach(cleanup);

describe("코스·구간 수정은 제목 옆 연필 아이콘으로 둔다", () => {
  it("코스 카드 제목 옆 아이콘 버튼이 코스 수정을 연다", () => {
    const onEdit = vi.fn();
    render(<CoursePreview meeting={newClubMeeting()} onEdit={onEdit} />);
    const button = screen.getByRole("button", { name: "코스 소개·GPX 수정" });
    // 큰 행 버튼이 아니라 아이콘 전용 버튼이고, 카드 제목과 같은 줄에 있다.
    expect(button.className).toContain("ds-btn--icon-only");
    expect(button.textContent).toBe("");
    expect(button.closest(".cp-heading-with-edit")?.querySelector("h2")?.textContent).toBe("이런 길을 함께 달려요");
    fireEvent.click(button);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("수정 권한이 없으면 코스·구간 수정 아이콘을 보여주지 않는다", () => {
    render(<CoursePreview meeting={newClubMeeting()} />);
    expect(screen.queryByRole("button", { name: "코스 소개·GPX 수정" })).toBeNull();
    expect(screen.queryByRole("button", { name: "구간 선택·수정" })).toBeNull();
  });

  it("주요 구간 제목 옆 아이콘 버튼이 구간 수정을 연다", () => {
    const onEdit = vi.fn();
    render(<MeetingSegmentCards segments={[]} onEdit={onEdit} />);
    const button = screen.getByRole("button", { name: "구간 선택·수정" });
    expect(button.className).toContain("ds-btn--icon-only");
    expect(button.closest(".cp-heading-with-edit")?.querySelector("h3")?.textContent).toBe("주요 구간");
    fireEvent.click(button);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
