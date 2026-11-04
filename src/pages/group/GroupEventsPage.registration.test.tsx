import { installEventDiscoveryFixture } from "../../__tests__/fixtures/eventDiscovery";
vi.mock("../../services/clubMeetings",()=>{ const api = {listClubMeetings:vi.fn(async()=>({meetings:[],nextCursor:null}))}; return { ...api, createClubMeetingsApi: () => api }; });
import { listClubMeetings, type ClubMeetingListItem } from "../../services/clubMeetings";
import { getDoc } from "firebase/firestore";
import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { setCollectionDocs, setDocData } from "../../__tests__/mocks/firebase";
import GroupEventsPage from "./GroupEventsPage";
const roleState=vi.hoisted(()=>({error:null as Error|null,retry:vi.fn()}));
vi.mock("../../hooks/useGroup", () => ({
  useGroup: () => ({ group: { id: "club", name: "Club", creatorId: "owner", memberCount: 2 }, loading: false }),
  useGroupMemberRole: () => ({ role: roleState.error ? null : "member", loading: false, error:roleState.error,retry:roleState.retry }),
}));
function showPage() {
  renderWithProviders(<Routes><Route path="/:lang/club/:groupId/events" element={<GroupEventsPage />} /></Routes>, { route: "/ko/club/club/events", authenticated: true });
}
describe("club event registration actions", () => {
  beforeEach(() => { vi.mocked(listClubMeetings).mockResolvedValue({meetings:[],nextCursor:null}); installEventDiscoveryFixture(); roleState.error=null;roleState.retry.mockClear();setCollectionDocs("events", [{ id: "event-1", info: { name: "Club event", groupId: "club", status: "OPEN", startTime: Date.now() + 86400000 } }]); });
  it("merges meetings and races under shared filters including cancelled and finished",async()=>{
    const meeting=(eventId:string,rideStatus:ClubMeetingListItem["rideStatus"],cancelled=false)=>({eventId,rideStatus,meeting:{title:eventId,date:"2026-11-05",time:"08:00",place:"집결지",status:cancelled?"cancelled":"open",capacity:10},participantCount:2,waitingCount:0}) as ClubMeetingListItem;
    vi.mocked(listClubMeetings).mockResolvedValue({meetings:[meeting("취소한 모임","CANCELLED",true),meeting("진행 모임","LIVE"),meeting("끝난 모임","FINISHED"),meeting("모집 모임","OPEN")],nextCursor:null});
    setCollectionDocs("events",["OPEN","LIVE","FINISHED","CANCELLED"].map((status,index)=>({id:`race-${status}`,info:{name:`대회 ${status}`,groupId:"club",status,startTime:Date.now()+index*3600000}})));
    showPage();
    expect(await screen.findByRole("link",{name:"취소한 모임"})).toBeInTheDocument();
    expect(await screen.findByRole("link",{name:"대회 FINISHED"})).toBeInTheDocument();
    for(const [label,title,race] of [["모집 중","모집 모임","OPEN"],["진행 중","진행 모임","LIVE"],["종료","끝난 모임","FINISHED"],["취소","취소한 모임","CANCELLED"]]){
      fireEvent.click(screen.getByRole("button",{name:label,exact:true}));
      expect(await screen.findByRole("link",{name:title})).toBeInTheDocument();
      expect(await screen.findByRole("link",{name:`대회 ${race}`})).toBeInTheDocument();
      expect(screen.queryByRole("link",{name:title==="취소한 모임"?"모집 모임":"취소한 모임"})).not.toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button",{name:"전체",exact:true}));
    expect(await screen.findByRole("link",{name:"취소한 모임"})).toBeInTheDocument();
    expect(await screen.findByRole("link",{name:"대회 OPEN"})).toBeInTheDocument();
  });
  it("shows membership lookup failure and retries it instead of redirecting as a nonmember",()=>{
    roleState.error=new Error("membership unavailable");showPage();
    expect(screen.getByText("클럽 정보를 불러오지 못했습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:/다시/}));expect(roleState.retry).toHaveBeenCalledTimes(1);
  });
  it("keeps the event visible when optional registration lookup fails without offering registration",async()=>{
    vi.mocked(getDoc).mockRejectedValueOnce(new Error("participant offline"));showPage();
    expect(await screen.findByRole("link",{name:"Club event"})).toBeInTheDocument();
    expect(await screen.findByRole("link",{name:"이벤트 보기"})).toHaveAttribute("href","/ko/event/event-1");
    expect(screen.queryByRole("link",{name:"참가 신청"})).not.toBeInTheDocument();
  });
  it("keeps hidden club envelopes bounded until an explicit next page reveals legacy events",async()=>{
    const envelope=(id:string,kind?:string)=>({id,info:{name:id,groupId:"club",kind,status:"OPEN",startTime:Date.now()+86400000}});
    setCollectionDocs("events",[...Array.from({length:20},(_,index)=>envelope(`meeting-${index}`,"CLUB_MEETING")),envelope("Legacy race")]);
    showPage();
    const next=await screen.findByRole("button",{name:"다음",exact:true});
    expect(screen.queryByRole("link",{name:"Legacy race"})).not.toBeInTheDocument();
    fireEvent.click(next);
    expect(await screen.findByRole("link",{name:"Legacy race"})).toBeInTheDocument();expect(screen.queryByRole("link",{name:"meeting-0"})).not.toBeInTheDocument();
  });
  it("names the empty state for the selected finished filter",async()=>{
    setCollectionDocs("events",[]);showPage();fireEvent.click(screen.getByRole("button",{name:"종료"}));
    expect(await screen.findByText("종료된 이벤트가 없어요")).toBeInTheDocument();
    expect(screen.queryByText("예정된 이벤트가 없어요")).not.toBeInTheDocument();
  });
  it.each(["REGISTERED", "PAID", "CHECKED_IN", "RIDING"])("offers management for canonical active status %s", async status => {
    setDocData("events/event-1/participants/test-uid", { status });
    showPage();
    expect(await screen.findByRole("link", { name: "확인 · 취소" })).toHaveAttribute("href", "/ko/event/event-1");
    expect(screen.queryByRole("link", { name: "참가 신청" })).not.toBeInTheDocument();
  });
  it.each(["REFUNDED", "CANCELLED", "WITHDRAWN", "WAITLISTED", "PENDING", "FUTURE_STATUS"])("offers registration rather than treating history status %s as active", async status => {
    setDocData("events/event-1/participants/test-uid", { status });
    showPage();
    expect(await screen.findByRole("link", { name: "참가 신청" })).toHaveAttribute("href", "/ko/event/event-1/register");
    expect(screen.queryByRole("link", { name: "확인 · 취소" })).not.toBeInTheDocument();
  });
});
