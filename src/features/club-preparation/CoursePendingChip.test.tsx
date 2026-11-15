// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CoursePreview from "./CoursePreview";
import MeetingForm from "./MeetingForm";
import { newClubMeeting } from "./meetingCopy";
import type { Meeting, State } from "./domain";

// 지도·코스 가져오기는 이 계약과 무관하다.
vi.mock("./ClubCourseMap", () => ({ default: () => null }));
vi.mock("./CoursePreparation", () => ({ default: () => null }));

const meeting: Meeting = {
  ...newClubMeeting(),
  title: "새만금 야간 번개",
  date: "2030-10-25",
  place: "새만금",
  venue: "outdoor",
  courseReady: false,
  joins: [{ id: "main", place: "새만금", time: "21:00" }],
};
const state: State = {
  version: 1,
  now: 0,
  kinds: [{ id: "flash", name: "번개", active: true }],
  members: [{ id: "user", name: "실제 회원" }],
  meetings: [meeting],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("「최종 코스 준비 중」 칩은 눌러서 해결·확인으로 이어진다", () => {
  it("주최자에게는 칩이 버튼이고, 누르면 코스 확정으로 데려간다", () => {
    const onConfirmCourse = vi.fn();
    render(<CoursePreview meeting={meeting} onConfirmCourse={onConfirmCourse} />);
    const chip = screen.getByRole("button", { name: /최종 코스 준비 중/ });
    fireEvent.click(chip);
    expect(onConfirmCourse).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(chip, { key: "Enter" });
    expect(onConfirmCourse).toHaveBeenCalledTimes(2);
  });

  it("참가자에게는 누르면 확정 전 상태와 알림 방법을 펼쳐 보여준다", () => {
    render(<CoursePreview meeting={meeting} />);
    const chip = screen.getByRole("button", { name: /최종 코스 준비 중/ });
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/아직 최종 코스를 확정하지 않았어요/)).toBeNull();
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/아직 최종 코스를 확정하지 않았어요/)).toBeTruthy();
  });

  it("코스가 확정되면 경고 칩 대신 누를 필요 없는 안내 칩만 둔다", () => {
    render(
      <CoursePreview meeting={{ ...meeting, courseReady: true }} onConfirmCourse={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /최종 코스 준비 중/ })).toBeNull();
    expect(screen.getByText("코스 안내")).toBeTruthy();
  });

  it("수정 화면에 확정 칸 초점 요청으로 들어오면 접힌 코스 섹션을 펼치고 확정 칸에 초점을 둔다", () => {
    render(
      <MeetingForm
        state={state}
        initial={meeting}
        draftNamespace="user.club.edit"
        initialRevision={3}
        focusCourseReady
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const select = document.getElementById("meeting-course") as HTMLSelectElement;
    expect(select.closest("details")?.open).toBe(true);
    expect(document.activeElement).toBe(select);
  });

  it("초점 요청이 없으면 코스 섹션은 접힌 채로 둔다", () => {
    render(
      <MeetingForm
        state={state}
        initial={meeting}
        draftNamespace="user.club.edit"
        initialRevision={3}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const select = document.getElementById("meeting-course") as HTMLSelectElement;
    expect(select.closest("details")?.open).toBe(false);
  });
});
