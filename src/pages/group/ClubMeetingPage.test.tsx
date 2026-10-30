import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import ClubMeetingPage from "./ClubMeetingPage";
import { newClubMeeting } from "../../features/club-preparation/meetingCopy";
import {
  clubMeetingAttendance,
  finishClubMeeting,
  createClubMeeting,
  updateClubMeeting,
  type ClubMeetingSnapshot,
} from "../../services/clubMeetings";
const control = vi.hoisted(() => ({
  role: "member" as string | null,
  data: null as ClubMeetingSnapshot | null,
  reload: vi.fn(),
  form: null as null | {
    initial: ReturnType<typeof newClubMeeting>;
    initialRevision?: number;
    onSave: (
      meeting: ReturnType<typeof newClubMeeting>,
      revision?: number,
    ) => Promise<void>;
  },
}));
vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({
    group: { id: "club", name: "Club", creatorId: "owner" },
    loading: false,
  }),
  useGroupMemberRole: () => ({ role: control.role, loading: false }),
}));
vi.mock("../../features/club-preparation/useClubMeeting", () => ({
  useClubMeeting: () => ({
    data: control.data,
    loading: false,
    error: null,
    reload: control.reload,
  }),
}));
vi.mock("../../features/club-preparation/MeetingForm", () => ({
  default: (props: NonNullable<typeof control.form>) => {
    control.form = props;
    return (
      <button onClick={() => void props.onSave(props.initial, 3)}>
        서버 저장
      </button>
    );
  },
}));
vi.mock("../../features/club-preparation/CoursePreview", () => ({
  default: () => null,
  CourseSummary: () => null,
}));
vi.mock("../../components/group/GroupSubNav", () => ({ default: () => null }));
vi.mock("../../services/clubMeetings", () => ({
  createClubMeeting: vi.fn(async () => ({ eventId: "created" })),
  updateClubMeeting: vi.fn(async () => ({ revision: 4 })),
  clubMeetingAttendance: vi.fn(async () => ({ status: "none" })),
  setClubMeetingRecruitment: vi.fn(),
  cancelClubMeeting: vi.fn(),
  finishClubMeeting: vi.fn(async () => ({success: true})),
  publishClubMeetingNotice: vi.fn(),
  confirmClubMeetingNotice: vi.fn(),
}));
const registration = {
  memberId: "test-uid",
  status: "joined" as const,
  order: 1,
  payment: "unpaid" as const,
  refundDue: 0,
  refunded: 0,
  outbound: "자전거",
  inbound: "기차",
  joinId: "main",
};
function show(mode: "new" | "detail" | "edit", route?: string) {
  renderWithProviders(
    <Routes>
      <Route
        path={`/:lang/club/:groupId/meetings/${mode === "new" ? "new" : ":meetingId" + (mode === "edit" ? "/edit" : "")}`}
        element={<ClubMeetingPage mode={mode} />}
      />
      <Route
        path="/:lang/club/:groupId/meetings/created"
        element={<p>생성 완료</p>}
      />
    </Routes>,
    {
      route:
        route ??
        `/ko/club/club/meetings/${mode === "new" ? "new" : "event" + (mode === "edit" ? "/edit" : "")}`,
      authenticated: true,
    },
  );
}
beforeEach(() => {
  localStorage.clear();
  control.role = "member";
  control.data = null;
  control.form = null;
  vi.clearAllMocks();
});
describe("실제 인증 회원의 클럽 모임 동선", () => {
  it("일반 회원도 역할 선택 없이 생성하고 서버가 부여한 ID로 이동한다", async () => {
    show("new");
    await screen.findByRole("button", { name: "서버 저장" });
    expect(control.form?.initial.hostId).toBeUndefined();
    expect(control.form?.initial.registrations).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "서버 저장" }));
    await waitFor(() => expect(createClubMeeting).toHaveBeenCalled());
    expect(vi.mocked(createClubMeeting).mock.calls[0]![0]).toBe("club");
    expect(vi.mocked(createClubMeeting).mock.calls[0]![2]).toBeTruthy();
  });
  it("복구한 초안의 기준 revision을 서버 수정 요청에 그대로 전달한다", async () => {
    control.data = {
      eventId: "event",
      groupId: "club",
      revision: 9,
      isHost: true,
      meeting: { ...newClubMeeting(), id: "event", hostId: "test-uid" },
      members: [],
    };
    show("edit");
    await screen.findByRole("button", { name: "서버 저장" });
    expect(control.form?.initialRevision).toBe(9);
    fireEvent.click(screen.getByRole("button", { name: "서버 저장" }));
    await waitFor(() =>
      expect(updateClubMeeting).toHaveBeenCalledWith(
        "event",
        expect.any(Object),
        3,
      ),
    );
  });
  it("주최 권한과 자신의 참석 취소를 독립적으로 처리하고 합류 계획은 주최자에게만 보여준다", async () => {
    control.data = {
      eventId: "event",
      groupId: "club",
      revision: 1,
      isHost: true,
      meeting: {
        ...newClubMeeting(),
        id: "event",
        hostId: "test-uid",
        title: "실제 모임",
        registrations: [registration],
      },
      members: [{ id: "test-uid", name: "실제 회원" }],
    };
    show("detail");
    expect(await screen.findByText("합류·이동 현황")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "참석 취소" }));
    await waitFor(() =>
      expect(clubMeetingAttendance).toHaveBeenCalledWith("event", "cancel"),
    );
    expect(
      screen.getByRole("button", { name: "모임 수정" }),
    ).toBeInTheDocument();
  });
  it("비회원에게 작성 동작을 제공하지 않는다", async () => {
    control.role = null;
    show("new");
    expect(
      await screen.findByText("현재 활동 중인 클럽 회원만 이용할 수 있어요."),
    ).toBeInTheDocument();
    expect(control.form).toBeNull();
  });
});

describe("클럽 모임 마무리와 개인 결과", () => {
  function fixture(isHost: boolean, completed = false) {
    control.data = {eventId:"event",groupId:"club",revision:7,isHost,rideStatus:completed?"FINISHED":"OPEN",meeting:{...newClubMeeting(),id:"event",hostId:isHost?"test-uid":"host",registrations:[registration]},members:[{id:"test-uid",name:"테스트 회원"}],...(completed?{completion:{state:"ready" as const,summary:{totalParticipants:6,finishedCount:5,pendingCount:1,dnfCount:0},own:{status:"FINISHED",verified:true,durationMs:125000}}}:{})};
  }
  it("주최자의 확인 뒤만 최신 revision으로 마무리하며 중복 클릭을 막는다", async () => {
    fixture(true);let release!:()=>void;
    vi.mocked(finishClubMeeting).mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve({success:true});}));
    show("detail");fireEvent.click(await screen.findByRole("button",{name:"모임 마무리"}));
    expect(finishClubMeeting).not.toHaveBeenCalled();
    const confirm=screen.getByRole("button",{name:"마무리 확정"});fireEvent.click(confirm);fireEvent.click(confirm);
    expect(finishClubMeeting).toHaveBeenCalledTimes(1);expect(finishClubMeeting).toHaveBeenCalledWith("event",7);release();
    await waitFor(()=>expect(control.reload).toHaveBeenCalled());
  });
  it("참가자에게 마무리 조작을 제공하지 않고 자기 결과와 대기 수를 구분한다", async () => {
    fixture(false,true);show("detail");
    expect(await screen.findByText("모임 결과")).toBeInTheDocument();
    expect(screen.getByText(/완료 5명 · 확인 대기 1명/)).toBeInTheDocument();
    expect(screen.getByText(/내 기록 · 결과 확인 완료 · 2:05/)).toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"모임 마무리"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"참석 신청"})).not.toBeInTheDocument();
  });
  it.each(["REGISTERED", "CHECKED_IN", "PAID"])("미시작 참가 상태 %s는 기록 없음으로 표시한다", async status => {
    fixture(false,true);control.data!.completion={state:"ready",summary:null,own:{status,verified:false,durationMs:null}};show("detail");
    expect(await screen.findByText(/내 기록 · 기록 없음/)).toBeInTheDocument();
    expect(screen.queryByText(/내 기록 · 결과 확인 대기/)).not.toBeInTheDocument();
  });
  it("집계 전이나 자기 미확인 기록을 성공으로 표시하지 않는다", async () => {
    fixture(false,true);control.data!.completion={state:"processing",summary:null,own:{status:"FINISHED",verified:false,durationMs:null}};show("detail");
    expect(await screen.findByText(/모임 요약을 집계 중/)).toBeInTheDocument();
    expect(screen.getByText(/내 기록 · 결과 확인 대기/)).toBeInTheDocument();
    expect(screen.queryByText(/결과 확인 완료/)).not.toBeInTheDocument();
  });
});
