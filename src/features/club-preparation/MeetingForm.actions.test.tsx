// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MeetingForm from "./MeetingForm";
import { newClubMeeting } from "./meetingCopy";
import type { Meeting, State } from "./domain";
vi.mock("./CoursePreparation", () => ({ default: () => null }));
vi.mock("./CoursePreview", () => ({
  default: () => null,
  CourseSummary: () => null,
}));

const filled: Meeting = {
  ...newClubMeeting(),
  title: "주말 남산 번개",
  date: "2030-10-25",
  place: "반포 한강공원",
  // 실내·실외는 필수다(#1547) — 고르지 않으면 미리보기로 넘어가지 않는다.
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
const bar = () => document.querySelector<HTMLElement>(".cp-form-actions--bar")!;
const barButtons = () =>
  within(bar())
    .getAllByRole("button")
    .map((button) => button.textContent);

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("모임 준비하기 하단 막대", () => {
  it("작성 단계는 설명 문구 없이 두 버튼만 한 줄 막대로 양식 맨 끝에 둔다", () => {
    render(
      <MeetingForm
        state={state([])}
        initial={filled}
        draftNamespace="user.club"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(document.querySelectorAll(".cp-form-actions")).toHaveLength(1);
    expect(bar().classList).toContain("cp-form-actions--bottom");
    expect(bar().parentElement?.tagName).toBe("FORM");
    expect(bar().parentElement?.lastElementChild).toBe(bar());
    expect(barButtons()).toEqual(["닫고 나중에 계속", "모집글 미리보기"]);
    // 버튼 묶음 위 안내 줄을 뺐다 — 막대 안에는 버튼 외 내용이 없다.
    expect(bar().children).toHaveLength(2);
    expect(screen.queryByText(/초안 자동 저장됨/)).toBeNull();
    expect(screen.queryByText("초안 저장 확인 중")).toBeNull();
    expect(within(bar()).queryByRole("status")).toBeNull();
  });

  it("초안 저장이 실패하면 위 경고와 같은 문장을 막대에 한 줄로 알린다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    render(
      <MeetingForm
        state={state([])}
        initial={filled}
        draftNamespace="user.club"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const message =
      "초안을 저장하지 못했어요. 입력값과 브라우저 저장 공간을 확인해주세요.";
    expect(screen.getByRole("alert").textContent).toContain(message);
    const line = bar().querySelector(".cp-form-actions__error");
    expect(line?.textContent).toBe(message);
    // 스크린리더에는 위 경고 하나만 알린다.
    expect(within(bar()).queryByRole("alert")).toBeNull();
    expect(barButtons()).toEqual(["닫고 나중에 계속", "모집글 미리보기"]);
  });

  it("미리보기 단계는 더 수정하기·모집 시작을 같은 막대로 화면 맨 끝에 둔다", () => {
    render(
      <MeetingForm
        state={state([])}
        initial={filled}
        draftNamespace="user.club"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "모집글 미리보기" }));
    expect(document.querySelectorAll(".cp-form-actions")).toHaveLength(1);
    expect(bar().classList).toContain("cp-form-actions--bottom");
    expect(bar().parentElement?.lastElementChild).toBe(bar());
    expect(barButtons()).toEqual(["더 수정하기", "모집 시작"]);
    fireEvent.click(screen.getByRole("button", { name: "더 수정하기" }));
    expect(barButtons()).toEqual(["닫고 나중에 계속", "모집글 미리보기"]);
  });

  it("수정 모드 미리보기는 변경 내용 저장을 오른쪽에 둔다", () => {
    const existing = { ...filled, id: "event", hostId: "user" };
    render(
      <MeetingForm
        state={state([existing])}
        initial={existing}
        draftNamespace="user.club"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "모집글 미리보기" }));
    expect(barButtons()).toEqual(["더 수정하기", "변경 내용 저장"]);
  });
});
