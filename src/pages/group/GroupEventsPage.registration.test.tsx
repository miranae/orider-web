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
/** 지금부터 offset 뒤의 KST 날짜·시각 — 모임 목록 항목 형식. */
function kst(offset:number){const at=new Date(Date.now()+offset+9*3600000).toISOString();return {date:at.slice(0,10),time:at.slice(11,16)};}
function showPage() {
  renderWithProviders(<Routes><Route path="/:lang/club/:groupId/events" element={<GroupEventsPage />} /></Routes>, { route: "/ko/club/club/events", authenticated: true });
}
describe("club event registration actions", () => {
  beforeEach(() => { vi.mocked(listClubMeetings).mockResolvedValue({meetings:[],nextCursor:null}); installEventDiscoveryFixture(); roleState.error=null;roleState.retry.mockClear();setCollectionDocs("events", [{ id: "event-1", info: { name: "Club event", groupId: "club", status: "OPEN", startTime: Date.now() + 86400000 } }]); });
  it("shows upcoming meetings and races first and moves stale OPEN with finished and cancelled to the past tab (#1620)",async()=>{
    const day=86400000;
    const meeting=(eventId:string,rideStatus:ClubMeetingListItem["rideStatus"],offset:number,cancelled=false)=>({eventId,rideStatus,meeting:{title:eventId,...kst(offset),place:"집결지",status:cancelled?"cancelled":"open",capacity:10},participantCount:2,waitingCount:0}) as ClubMeetingListItem;
    vi.mocked(listClubMeetings).mockResolvedValue({meetings:[meeting("취소한 모임","CANCELLED",day,true),meeting("진행 모임","LIVE",-day),meeting("끝난 모임","FINISHED",-2*day),meeting("모집 모임","OPEN",2*day),meeting("지난 모집 모임","OPEN",-3*day)],nextCursor:null});
    setCollectionDocs("events",[["OPEN",day],["LIVE",-day],["FINISHED",-1.5*day],["CANCELLED",3*day],["STALE",-4*day]].map(([status,offset])=>({id:`race-${status}`,info:{name:`대회 ${status}`,groupId:"club",status:status==="STALE"?"OPEN":status,startTime:Date.now()+Number(offset)}})));
    showPage();
    expect(await screen.findByRole("link",{name:"모집 모임"})).toBeInTheDocument();
    const upcoming=()=>screen.getAllByRole("link").map(link=>link.textContent).filter(text=>/\s모임$|^대회 /.test(text??""));
    expect(await screen.findByRole("link",{name:"대회 OPEN"})).toBeInTheDocument();
    // 진행 중 먼저, 그다음 시작이 가까운 순.
    expect(upcoming()).toEqual(["진행 모임","대회 LIVE","대회 OPEN","모집 모임"]);
    for(const hidden of ["취소한 모임","끝난 모임","지난 모집 모임","대회 FINISHED","대회 CANCELLED","대회 STALE"]) expect(screen.queryByRole("link",{name:hidden})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"지난 이벤트",exact:true}));
    expect(await screen.findByRole("link",{name:"대회 STALE"})).toBeInTheDocument();
    expect(await screen.findByRole("link",{name:"지난 모집 모임"})).toBeInTheDocument();
    // 지난 이벤트는 최근 순 — 시작이 지난 모집 중도 여기로 온다.
    expect(upcoming()).toEqual(["대회 CANCELLED","취소한 모임","대회 FINISHED","끝난 모임","지난 모집 모임","대회 STALE"]);
    expect(screen.queryByRole("link",{name:"모집 모임"})).not.toBeInTheDocument();
  });
  it("offers host editing for open races and live meetings only to hosts",async()=>{
    const meeting=(eventId:string,isHost:boolean,rideStatus:ClubMeetingListItem["rideStatus"],cancelled=false)=>({eventId,isHost,rideStatus,meeting:{title:eventId,...kst(86400000),place:"집결지",status:cancelled?"cancelled":"open",capacity:10},participantCount:1,waitingCount:0}) as ClubMeetingListItem;
    vi.mocked(listClubMeetings).mockResolvedValue({meetings:[meeting("내 모임",true,"OPEN"),meeting("남의 모임",false,"OPEN"),meeting("취소한 내 모임",true,"CANCELLED",true)],nextCursor:null});
    setCollectionDocs("events",[
      {id:"mine",info:{name:"내 대회",groupId:"club",status:"OPEN",creatorId:"test-uid",startTime:Date.now()+3600000}},
      {id:"cohost",info:{name:"공동 주최 대회",groupId:"club",status:"OPEN",creatorId:"owner",hostIds:["test-uid"],startTime:Date.now()+7200000}},
      {id:"other",info:{name:"남의 대회",groupId:"club",status:"OPEN",creatorId:"owner",startTime:Date.now()+10800000}},
      {id:"done",info:{name:"끝난 내 대회",groupId:"club",status:"FINISHED",creatorId:"test-uid",startTime:Date.now()-3600000}},
    ]);
    showPage();
    await screen.findByRole("link",{name:"내 대회"});
    expect(screen.getAllByTestId("club-event-edit").map(link=>link.getAttribute("href"))).toEqual(["/ko/event/mine/host/edit","/ko/event/cohost/host/edit"]);
    expect(screen.getAllByTestId("club-meeting-edit").map(link=>link.getAttribute("href"))).toEqual(["/ko/club/club/meetings/내 모임/edit"]);
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
  it("names the empty state for the selected past tab",async()=>{
    setCollectionDocs("events",[]);showPage();fireEvent.click(screen.getByRole("button",{name:"지난 이벤트"}));
    expect(await screen.findByText("지난 모임이나 대회가 없어요")).toBeInTheDocument();
    expect(screen.queryByText("예정된 모임이나 대회가 없어요")).not.toBeInTheDocument();
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
