// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MeetingForm from "./MeetingForm";
import { newClubMeeting } from "./meetingCopy";
import type { Meeting, State } from "./domain";

// 코스 준비 단계는 선택된 준비 방식 탭만 흉내 낸다 — 오류 버튼이 이 탭으로 초점을 옮기는지가 계약이다.
vi.mock("./CoursePreparation", () => ({
  default: () => (
    <section className="cp-course-preparation">
      <div role="tablist">
        <button type="button" role="tab" aria-selected="false">기존 코스 가져오기</button>
        <button type="button" role="tab" aria-selected="true">GPX로 준비하기</button>
      </div>
    </section>
  ),
}));
vi.mock("./CoursePreview", () => ({ default: () => null, CourseSummary: () => null }));

const base: Meeting = {
  ...newClubMeeting(),
  title: "주말 남산 번개",
  date: "2030-10-25",
  place: "반포 한강공원",
  venue: "outdoor",
  joins: [{ id: "main", place: "반포 한강공원", time: "08:00" }],
};
const state = (meetings: Meeting[]): State => ({
  version: 1,
  now: 0,
  kinds: [{ id: "flash", name: "번개", active: true }],
  members: [{ id: "user", name: "실제 회원" }],
  meetings,
});

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("모임 저장 검증 오류 문구를 누르면 고칠 칸으로 간다", () => {
  it("집결 시각이 지났으면 오류 버튼이 날짜 칸에 초점을 둔다", () => {
    const past = { ...base, date: "2020-01-04" };
    render(<MeetingForm state={state([])} initial={past} draftNamespace="user.club" onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "모집글 미리보기" }));
    expect(screen.getByRole("alert").textContent).toContain("집결 시각이 이미 지났어요");
    // 새 버튼은 없다 — 하단 막대의 한 줄 오류 문구 자체가 눌린다.
    expect(screen.queryByRole("button", { name: /고치러 가기|하러 가기/ })).toBeNull();
    const barFix = document.querySelector<HTMLButtonElement>(".cp-form-actions__error button")!;
    expect(barFix.textContent).toBe("집결 시각이 이미 지났어요. 미래의 날짜와 시각을 선택해주세요.");
    fireEvent.click(barFix);
    expect(document.activeElement).toBe(document.getElementById("meeting-date"));
  });

  it("실내 모임에 코스 경로가 없으면 검토 단계에서 코스 준비 방식으로 데려간다", () => {
    const indoor = { ...base, venue: "indoor" as const };
    const onSave = vi.fn();
    render(
      <MeetingForm state={state([indoor])} initial={indoor} draftNamespace="user.club.edit" initialRevision={2}
        onSave={onSave} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "모집글 미리보기" }));
    fireEvent.click(screen.getByRole("button", { name: "변경 내용 저장" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("실내 모임은 코스 경로가 필요해요");
    expect(screen.queryByRole("button", { name: /하러 가기/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /실내 모임은 코스 경로가 필요해요/ }));
    // 검토 단계를 벗어나 작성 단계의 선택된 코스 준비 방식 탭에 초점이 간다.
    expect(screen.queryByRole("button", { name: "변경 내용 저장" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "GPX로 준비하기" }));
  });

  it("오류 문구가 바뀌면(초안 저장 실패 등) 문구는 눌리지 않는다", () => {
    const past = { ...base, date: "2020-01-04" };
    render(<MeetingForm state={state([])} initial={past} draftNamespace="user.club" onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "모집글 미리보기" }));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    fireEvent.change(document.getElementById("meeting-title")!, { target: { value: "다른 이름" } });
    expect(screen.getByRole("alert").textContent).toContain("초안을 저장하지 못했어요");
    expect(screen.queryByRole("button", { name: /초안을 저장하지 못했어요/ })).toBeNull();
  });
});
