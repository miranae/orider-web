vi.mock("../../services/clubMeetings",()=>({listClubMeetings:vi.fn(async()=>({meetings:[],nextCursor:null}))}));
import { getDoc, getDocs } from "firebase/firestore";
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
  beforeEach(() => { roleState.error=null;roleState.retry.mockClear();setCollectionDocs("events", [{ id: "event-1", info: { name: "Club event", groupId: "club", status: "OPEN", startTime: Date.now() + 86400000 } }]); });
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
  it("does not let twenty club meeting envelopes hide legacy events",async()=>{
    const envelope=(id:string,kind?:string)=>({id,data:()=>({info:{name:id,groupId:"club",kind,status:"OPEN",startTime:Date.now()+86400000}})});
    vi.mocked(getDocs).mockResolvedValueOnce({docs:Array.from({length:20},(_,index)=>envelope(`meeting-${index}`,"CLUB_MEETING"))} as never).mockResolvedValueOnce({docs:[envelope("Legacy race")]} as never);
    showPage();expect(await screen.findByRole("link",{name:"Legacy race"})).toBeInTheDocument();expect(screen.queryByRole("link",{name:"meeting-0"})).not.toBeInTheDocument();
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
