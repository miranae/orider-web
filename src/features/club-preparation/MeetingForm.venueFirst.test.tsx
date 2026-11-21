// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MeetingForm from "./MeetingForm";
import { newClubMeeting } from "./meetingCopy";
import { clearCourse } from "./meetingCoursePlan";
import { meetingDateTimeLabel } from "./meetingSchedule";
import type { CourseSource, Meeting, State } from "./domain";

const track = {
  fileName: "코스",
  segmentStarts: [0],
  points: Array.from({ length: 60 }, (_, i) => ({ lat: 37.5 + i * 0.00018, lon: 127 })),
  distanceKm: 1.2,
  elevationGainM: 0,
};
const builtin: CourseSource = { kind: "builtin", id: "builtin_hangang", name: "한강 자전거길" };
const gpx: CourseSource = { kind: "gpx", name: "autumn-ride.GPX" };

// 코스 준비 단계는 「코스를 골랐다」만 흉내 낸다 — 이 파일은 실내·실외 선택과 코스의 관계를 본다.
vi.mock("./CoursePreparation", () => ({
  default: ({ meeting, onChange }: { meeting: Meeting; onChange: (meeting: Meeting) => void }) => (
    <section className="cp-course-preparation">
      <output aria-label="고른 코스">{meeting.courseSource?.name ?? "없음"}</output>
      <button type="button" onClick={() => onChange({ ...meeting, courseSource: builtin, courseTrack: track, distanceKm: 1.2, courseReady: true })}>
        내장 코스 고르기
      </button>
      <button type="button" onClick={() => onChange({ ...meeting, courseSource: gpx, courseTrack: track, distanceKm: 1.2, courseReady: true })}>
        GPX 고르기
      </button>
    </section>
  ),
}));
vi.mock("./CoursePreview", () => ({ default: () => null, CourseSummary: () => null }));

const state = (meetings: Meeting[]): State => ({
  version: 1,
  now: Date.now(),
  kinds: [{ id: "flash", name: "번개", active: true }],
  members: [{ id: "host", name: "주최자" }],
  meetings,
});
const fresh: Meeting = { ...newClubMeeting(), date: "2030-10-25" };
const chosen = () => screen.getByLabelText("고른 코스").textContent;
const radio = (name: RegExp) => screen.getByRole("radio", { name }) as HTMLInputElement;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("실내·실외를 먼저 고르는 모임 작성 (#1779)", () => {
  it("실내·실외 선택이 코스 준비보다 먼저 나온다", () => {
    render(<MeetingForm state={state([])} initial={fresh} draftNamespace="vf.order" onSave={vi.fn()} onClose={vi.fn()} />);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(headings.slice(0, 2)).toEqual(["1. 실내·실외를 골라주세요", "3. 모임을 알려주세요"]);
    const venue = screen.getByRole("radio", { name: /실내/ });
    const course = document.querySelector(".cp-course-preparation")!;
    expect(venue.compareDocumentPosition(course) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("실내·실외를 바꿔 코스가 맞지 않으면 확인을 받고 코스를 비운다", () => {
    render(<MeetingForm state={state([])} initial={fresh} draftNamespace="vf.switch" onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(radio(/실내/));
    fireEvent.click(screen.getByRole("button", { name: "내장 코스 고르기" }));
    expect(chosen()).toBe("한강 자전거길");

    fireEvent.click(radio(/실외/));
    // 확인 전에는 실내 그대로이고 코스도 남아 있다.
    const confirm = screen.getByRole("region", { name: "실내·실외 변경 확인" });
    expect(confirm.textContent).toContain("한강 자전거길");
    expect(radio(/실내/).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "그대로 두기" }));
    expect(screen.queryByRole("region", { name: "실내·실외 변경 확인" })).toBeNull();
    expect(chosen()).toBe("한강 자전거길");

    fireEvent.click(radio(/실외/));
    fireEvent.click(screen.getByRole("button", { name: "실외로 바꾸고 코스 비우기" }));
    expect(radio(/실외/).checked).toBe(true);
    expect(chosen()).toBe("없음");
  });

  it("코스가 없거나 새 선택에 맞으면 묻지 않고 바꾼다", () => {
    render(<MeetingForm state={state([])} initial={fresh} draftNamespace="vf.free" onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(radio(/실내/));
    fireEvent.click(radio(/실외/));
    expect(screen.queryByRole("region", { name: "실내·실외 변경 확인" })).toBeNull();
    expect(radio(/실외/).checked).toBe(true);
  });

  it("GPX 로 저장된 기존 실내 모임은 실외로 갔다가 돌아와도 코스를 지키고 저장된다", async () => {
    const saved: Meeting = { ...fresh, id: "m1", title: "기존 실내", venue: "indoor", place: "우리 집", courseSource: gpx, courseTrack: track, courseReady: true };
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<MeetingForm state={state([saved])} initial={saved} initialRevision={3} draftNamespace="vf.kept" onSave={onSave} onClose={vi.fn()} />);
    fireEvent.click(radio(/실외/));
    fireEvent.click(radio(/실내/));
    expect(screen.queryByRole("region", { name: "실내·실외 변경 확인" })).toBeNull();
    expect(chosen()).toBe("autumn-ride.GPX");
    fireEvent.change(document.getElementById("meeting-title")!, { target: { value: "제목만 수정" } });
    fireEvent.click(screen.getByRole("button", { name: "모집글 미리보기" }));
    fireEvent.click(screen.getByRole("button", { name: "변경 내용 저장" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    // 주최자가 예전에 적은 집결 장소는 고정 문구로 덮어쓰지 않는다.
    expect(onSave.mock.calls[0]![0]).toMatchObject({ title: "제목만 수정", venue: "indoor", place: "우리 집", courseSource: gpx });
  });

  it("실내·실외 구분 전에 만든 모임은 실내를 골라도 저장된 코스를 지킨다", async () => {
    const legacy: Meeting = { ...fresh, id: "m0", title: "예전 모임", venue: undefined, place: "우리 집", weather: "비 오면 실내로", parking: "지하 주차장",
      joins: [{ id: "main", place: "우리 집", time: "08:00" }, { id: "j2", place: "카페", time: "08:20" }], courseSource: gpx, courseTrack: track, courseReady: true };
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<MeetingForm state={state([legacy])} initial={legacy} initialRevision={2} draftNamespace="vf.legacy" onSave={onSave} onClose={vi.fn()} />);
    fireEvent.click(radio(/실내/));
    expect(screen.queryByRole("region", { name: "실내·실외 변경 확인" })).toBeNull();
    expect(chosen()).toBe("autumn-ride.GPX");
    fireEvent.click(screen.getByRole("button", { name: "모집글 미리보기" }));
    fireEvent.click(screen.getByRole("button", { name: "변경 내용 저장" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    // 예전에 적어 둔 집결 장소·안내는 실내를 골라도 말없이 지우지 않는다.
    expect(onSave.mock.calls[0]![0]).toMatchObject({ venue: "indoor", courseSource: gpx, place: "우리 집", weather: "비 오면 실내로", parking: "지하 주차장" });
    expect((onSave.mock.calls[0]![0] as Meeting).joins).toHaveLength(2);
  });

  it("실외 집결·합류 및 안내 변경을 보여주고 확인받은 후 실내로 저장한다", async () => {
    // 화면에서 숨긴 값이 그대로 저장되면 참석자가 실내 모임에서 이전 야외 집결지를 본다(#1780 리뷰).
    const outdoor: Meeting = { ...fresh, id: "m3", title: "남산 번개", venue: "outdoor", place: "반포 한강공원", weather: "비 오면 취소", parking: "공영주차장",
      joins: [{ id: "main", place: "반포 한강공원", time: "08:00" }, { id: "j2", place: "잠수교", time: "08:20" }] };
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<MeetingForm state={state([outdoor])} initial={outdoor} initialRevision={2} draftNamespace="vf.toIndoor" onSave={onSave} onClose={vi.fn()} />);
    fireEvent.click(radio(/실내/));
    fireEvent.click(screen.getByRole("button", { name: "내장 코스 고르기" }));
    fireEvent.click(screen.getByRole("button", { name: "모집글 미리보기" }));
    const summary = document.querySelector(".cp-review-summary")!;
    expect(summary.textContent).toContain("반포 한강공원");
    expect(summary.textContent).toContain("잠수교");
    expect(summary.textContent).toContain("비 오면 취소");
    expect(summary.textContent).toContain("공영주차장");
    expect(summary.textContent).toContain("앱 실내 라이딩");
    const saveButton = screen.getByRole("button", { name: "변경 내용 저장" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /정보가 변경되거나 삭제/ }));
    expect(saveButton.disabled).toBe(false);
    fireEvent.click(saveButton);
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0]![0] as Meeting;
    expect(saved).toMatchObject({ venue: "indoor", place: "앱 실내 라이딩", weather: "", parking: "" });
    expect(saved.joins).toEqual([{ id: "main", place: "앱 실내 라이딩", time: "08:00" }]);
  });

  it("실내로 바꿔도 참석자가 이미 고른 합류 지점은 남긴다", async () => {
    // 참석자가 고른 합류 지점을 지우면 저장이 거부된다(#1781 리뷰).
    const outdoor: Meeting = { ...fresh, id: "m4", title: "남산 번개", venue: "outdoor", place: "반포 한강공원",
      joins: [{ id: "main", place: "반포 한강공원", time: "08:00" }, { id: "j2", place: "잠수교", time: "08:20" }, { id: "j3", place: "옥수", time: "08:30" }],
      registrations: [{ memberId: "host", status: "joined", order: 1, payment: "unpaid", refundDue: 0, refunded: 0, joinId: "j2" }] };
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<MeetingForm state={state([outdoor])} initial={outdoor} initialRevision={2} draftNamespace="vf.joins" onSave={onSave} onClose={vi.fn()} />);
    fireEvent.click(radio(/실내/));
    fireEvent.click(screen.getByRole("button", { name: "내장 코스 고르기" }));
    fireEvent.click(screen.getByRole("button", { name: "모집글 미리보기" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /정보가 변경되거나 삭제/ }));
    fireEvent.click(screen.getByRole("button", { name: "변경 내용 저장" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    // 남긴 지점의 장소도 실내 문구로 바꾼다 — 예전 야외 장소 이름이 실내 모임 안내에 남지 않는다(#1782 리뷰).
    expect((onSave.mock.calls[0]![0] as Meeting).joins).toEqual([
      { id: "main", place: "앱 실내 라이딩", time: "08:00" },
      { id: "j2", place: "앱 실내 라이딩", time: "08:20" },
    ]);
  });

  it("코스를 고르면 빈 모임 이름만 코스 이름으로 채운다", () => {
    render(<MeetingForm state={state([])} initial={fresh} draftNamespace="vf.title" onSave={vi.fn()} onClose={vi.fn()} />);
    const title = () => (document.getElementById("meeting-title") as HTMLInputElement).value;
    fireEvent.click(radio(/실외/));
    fireEvent.click(screen.getByRole("button", { name: "GPX 고르기" }));
    expect(title()).toBe("autumn-ride");
    // 코스 이름 그대로인 이름은 코스를 바꾸면 따라 바뀌고, 코스를 비우면 함께 비워진다.
    fireEvent.click(screen.getByRole("button", { name: "내장 코스 고르기" }));
    expect(title()).toBe("한강 자전거길");
    fireEvent.click(radio(/실내/));
    fireEvent.click(radio(/실외/));
    fireEvent.click(screen.getByRole("button", { name: "실외로 바꾸고 코스 비우기" }));
    expect(title()).toBe("");
    cleanup();
    render(<MeetingForm state={state([])} initial={{ ...fresh, title: "토요 정기 라이딩" }} draftNamespace="vf.title2" onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(radio(/실외/));
    fireEvent.click(screen.getByRole("button", { name: "GPX 고르기" }));
    expect(title()).toBe("토요 정기 라이딩");
  });

  it("새 모임 요약은 적은 항목만 싣고 모임 종류·비용을 보이며 날짜 확인은 버튼 바로 위에 둔다", () => {
    const outdoor: Meeting = { ...fresh, title: "남산 번개", venue: "outdoor", place: "반포 한강공원", fee: 12000,
      joins: [{ id: "main", place: "반포 한강공원", time: "08:00" }] };
    render(<MeetingForm state={state([])} initial={outdoor} draftNamespace="vf.review" onSave={vi.fn()} onClose={vi.fn()} />);
    // 속도·운영 강도는 접힌 칸이 아니라 기본 칸에 있다.
    expect(document.getElementById("meeting-pace")!.closest("details")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "모집글 미리보기" }));
    const terms = [...document.querySelectorAll(".cp-review-summary dt")].map((term) => term.textContent);
    expect(terms).toEqual(["모임 이름", "실내 / 실외", "모임 종류", "일시", "집결 장소", "정원", "비용", "합류 지점"]);
    expect(document.querySelector(".cp-review-summary")!.textContent).toContain("12,000원");
    expect(screen.queryByText("안내 없음")).toBeNull();
    const check = screen.getByRole("checkbox").closest("label")!;
    expect(check.textContent).toContain("2030-10-25 (금) 08:00에 개최하는 모임이 맞습니다.");
    expect(check.nextElementSibling).toBe(screen.getByRole("button", { name: "모집 시작" }).parentElement);
  });

  it("수정 요약은 비용만 바꿔도 그 변경을 보인다", () => {
    const saved: Meeting = { ...fresh, id: "m2", title: "남산 번개", venue: "outdoor", place: "반포", joins: [{ id: "main", place: "반포", time: "08:00" }] };
    render(<MeetingForm state={state([saved])} initial={saved} initialRevision={1} draftNamespace="vf.fee" onSave={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(document.getElementById("meeting-fee")!, { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "모집글 미리보기" }));
    const summary = document.querySelector(".cp-review-summary")!;
    expect([...summary.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(["비용"]);
    expect(summary.textContent).toContain("5,000원");
  });
});

describe("코스 비우기·요일 표시", () => {
  it("코스에서 온 값만 지우고 모임 정보는 그대로 둔다", () => {
    const meeting: Meeting = { ...fresh, title: "남산", courseSource: builtin, courseTrack: track, distanceKm: 1.2, elevationGainM: 10,
      courseStops: ["출발"], courseCheckpoints: [{ name: "출발", source: "gpx" }], courseReady: true };
    const cleared = clearCourse(meeting);
    expect(cleared).toMatchObject({ title: "남산", date: "2030-10-25", courseStops: [], courseCheckpoints: [], segments: [], courseReady: false });
    expect("courseSource" in cleared || "courseTrack" in cleared || "distanceKm" in cleared || "elevationGainM" in cleared).toBe(false);
  });
  it("날짜에 요일을 붙이고 형식이 틀리면 그대로 돌려준다", () => {
    expect(meetingDateTimeLabel("2026-11-28", "08:00")).toBe("2026-11-28 (토) 08:00");
    expect(meetingDateTimeLabel("2026-11-28", "08:00", "en")).toBe("2026-11-28 (Sat) 08:00");
    expect(meetingDateTimeLabel("", "08:00")).toBe("08:00");
  });
});
