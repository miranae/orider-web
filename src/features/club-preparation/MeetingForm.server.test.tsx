// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MeetingForm from "./MeetingForm";
import i18n from "../../i18n";
import { newClubMeeting } from "./meetingCopy";
import { readDraft } from "./meetingDrafts";
import type { State } from "./domain";
vi.mock("./CoursePreparation", () => ({ default: () => null }));
vi.mock("./CoursePreview", () => ({
  default: () => null,
  CourseSummary: () => null,
}));
const initial = {
  ...newClubMeeting(),
  id: "event",
  hostId: "user",
  title: "원래 모임",
  date: "2030-10-25",
  place: "클럽 집결지",
  venue: "outdoor" as const,
};
const state: State = {
  version: 1,
  now: 0,
  kinds: [{ id: "flash", name: "번개", active: true }],
  members: [{ id: "user", name: "실제 회원" }],
  meetings: [initial],
};
beforeEach(() => localStorage.clear());
afterEach(cleanup);
describe("실제 서버 저장을 기다리는 작성 초안", () => {
  it("중복 저장을 막고 오류 후에도 사용자 범위 초안과 편집 기준 revision을 보존한다", async () => {
    let reject!: (error: Error) => void;
    const save = vi.fn(
      () =>
        new Promise<void>((_resolve, failure) => {
          reject = failure;
        }),
    );
    const view = render(
      <MeetingForm
        state={state}
        initial={initial}
        initialRevision={4}
        draftNamespace="user.club"
        onSave={save}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("모임 이름"), {
      target: { value: "수정하던 모임" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "모집글 미리보기" })[0]!,
    );
    fireEvent.click(screen.getByRole("button", { name: "변경 내용 저장" }));
    fireEvent.click(screen.getByRole("button", { name: "변경 내용 저장" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![1]).toBe(4);
    await act(async () => reject(new Error("네트워크 실패")));
    expect(screen.getByRole("alert").textContent).toContain("네트워크 실패");
    expect(readDraft("user.club.edit-event").meeting?.title).toBe(
      "수정하던 모임",
    );
    view.unmount();
    const retry = vi.fn().mockResolvedValue(undefined);
    render(
      <MeetingForm
        state={state}
        initial={{ ...initial, title: "새 서버 내용" }}
        initialRevision={9}
        draftNamespace="user.club"
        onSave={retry}
        onClose={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("모임 이름") as HTMLInputElement).value).toBe(
      "수정하던 모임",
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "모집글 미리보기" })[0]!,
    );
    fireEvent.click(screen.getByRole("button", { name: "변경 내용 저장" }));
    await waitFor(() => expect(retry).toHaveBeenCalled());
    expect(retry.mock.calls[0]![1]).toBe(4);
    await waitFor(() =>
      expect(readDraft("user.club.edit-event").meeting).toBeUndefined(),
    );
  });
  it("영어 작성 화면도 같은 작성 데이터 계약을 사용한다", async () => {
    await i18n.changeLanguage("en");
    try {
      render(
        <MeetingForm
          state={state}
          initial={initial}
          draftNamespace="en-user.club"
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      );
      expect(screen.getByLabelText("Meeting title")).toHaveValue("원래 모임");
      expect(
        screen.getAllByRole("button", { name: "Preview invitation" }),
      ).toHaveLength(1);
    } finally {
      await i18n.changeLanguage("ko");
    }
  });
  it("다른 사용자·클럽 초안을 복구하지 않는다", () => {
    const view = render(
      <MeetingForm
        state={state}
        initial={initial}
        draftNamespace="user.club"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("모임 이름"), {
      target: { value: "개인 초안" },
    });
    view.unmount();
    render(
      <MeetingForm
        state={state}
        initial={initial}
        draftNamespace="other.club"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect((screen.getByLabelText("모임 이름") as HTMLInputElement).value).toBe(
      "원래 모임",
    );
  });
  describe("집결 시각 하한 (현재 시각 이하 거부)", () => {
    const now = Date.parse("2030-10-25T10:30:00+09:00");
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
    });
    afterEach(() => vi.useRealTimers());
    const renderForm = (existing: boolean, onSave = vi.fn()) => {
      render(
        <MeetingForm
          state={existing ? state : { ...state, meetings: [] }}
          initial={{ ...initial, time: "12:00" }}
          initialRevision={existing ? 4 : undefined}
          draftNamespace={existing ? "limit-edit" : "limit-new"}
          onSave={onSave}
          onClose={vi.fn()}
        />,
      );
      return onSave;
    };
    const setTime = (value: string) =>
      fireEvent.change(screen.getByLabelText("집결 시각"), {
        target: { value },
      });
    const preview = () =>
      fireEvent.click(
        screen.getAllByRole("button", { name: "모집글 미리보기" })[0]!,
      );
    it("새 모임은 현재 시각 정각으로 미리보기·게시할 수 없다", () => {
      const save = renderForm(false);
      setTime("10:30");
      preview();
      expect(screen.getByRole("alert").textContent).toContain(
        "집결 시각이 이미 지났어요",
      );
      expect(screen.queryByRole("button", { name: "모집 시작" })).toBeNull();
      expect(save).not.toHaveBeenCalled();
    });
    it("1분 뒤 시각은 새 모임으로 게시할 수 있다", async () => {
      const save = renderForm(false);
      setTime("10:31");
      preview();
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByRole("button", { name: "모집 시작" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    });
    it("지난 기존 모임의 일정을 유지한 설명 수정은 저장할 수 있다", async () => {
      const old = { ...initial, time: "08:00" };
      const save = vi.fn().mockResolvedValue(undefined);
      render(<MeetingForm state={{ ...state, meetings: [old] }} initial={old} initialRevision={4}
        draftNamespace="past-metadata" onSave={save} onClose={vi.fn()} />);
      fireEvent.change(screen.getByLabelText("모임 이름"), { target: { value: "설명 변경 모임" } });
      preview();
      fireEvent.click(screen.getByRole("button", { name: "변경 내용 저장" }));
      await waitFor(() => expect(save).toHaveBeenCalledOnce());
      expect(save.mock.calls[0][0]).toMatchObject({ title: "설명 변경 모임", time: "08:00" });
    });

    it("일정 변경도 현재 시각 정각이면 막는다", () => {
      const save = renderForm(true);
      setTime("10:30");
      preview();
      expect(screen.getByRole("alert").textContent).toContain(
        "집결 시각이 이미 지났어요",
      );
      expect(
        screen.queryByRole("button", { name: "변경 내용 저장" }),
      ).toBeNull();
      expect(save).not.toHaveBeenCalled();
    });
    it("1분 뒤 시각으로 바꾸는 일정 변경은 저장한다", async () => {
      const save = renderForm(true);
      setTime("10:31");
      preview();
      fireEvent.click(screen.getByRole("button", { name: "변경 내용 저장" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      expect(save.mock.calls[0]![0].time).toBe("10:31");
    });
  });
});
describe("실내 / 실외 선택", () => {
  const legacy = { ...initial, venue: undefined };
  it("새 모임은 선택하기 전에는 미리보기로 넘어가지 않고 고른 값을 저장한다", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const fresh = { ...newClubMeeting(), title: "새 모임", date: "2030-10-25", place: "집결지" };
    render(
      <MeetingForm
        state={{ ...state, meetings: [] }}
        initial={fresh}
        draftNamespace="venue.new"
        onSave={save}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "모집글 미리보기" })[0]!);
    expect(screen.queryByRole("button", { name: "모집 시작" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /실내/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "모집글 미리보기" })[0]!);
    expect(screen.getByText(/실내 · 2030-10-25/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "모집 시작" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![0]).toMatchObject({ venue: "indoor" });
  });
  it("값이 없는 기존 모임을 수정하면 선택을 요구한다", () => {
    render(
      <MeetingForm
        state={{ ...state, meetings: [legacy] }}
        initial={legacy}
        initialRevision={2}
        draftNamespace="venue.legacy"
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/아직 실내·실외가 정해지지 않았어요/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "모집글 미리보기" })[0]!);
    expect(screen.queryByRole("button", { name: "변경 내용 저장" })).toBeNull();
  });
  it("기존 값이 있는 모임을 수정하면 그 값을 유지해 저장한다", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      <MeetingForm
        state={state}
        initial={initial}
        initialRevision={3}
        draftNamespace="venue.keep"
        onSave={save}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("radio", { name: /실외/ })).toBeChecked();
    fireEvent.click(screen.getAllByRole("button", { name: "모집글 미리보기" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "변경 내용 저장" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]![0]).toMatchObject({ venue: "outdoor" });
  });
});
