import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MeetingDiscord from "./MeetingDiscord";
import type { MeetingDiscordView } from "../../services/clubMeetings";
import { resetRuntimeConfigForTests } from "../../services/runtimeConfig";
import type { useWorldEvent } from "../ride-world/useWorldEvent";
const api = vi.hoisted(() => ({signals:[] as (()=>void)[],getClubMeetingDiscord:vi.fn(),openClubMeetingDiscord:vi.fn(),closeClubMeetingDiscord:vi.fn()}));
const transport = vi.hoisted(() => ({ paths: [] as string[], subscribe: vi.fn<typeof useWorldEvent>() }));
vi.mock("../ride-world/useWorldEvent",()=>({useWorldEvent:transport.subscribe}));
vi.mock("./useClubMeetingsApi",()=>({useClubMeetingsApi:()=>api}));
vi.mock("../../services/errorLogger",()=>({logClientError:vi.fn()}));
vi.mock("../../components/LocalizedLink",()=>({LocalizedLink:({to,children,...props}:any)=><a href={to} {...props}>{children}</a>}));
vi.mock("firebase/firestore",()=>({doc:(_db:unknown,path:string)=>path,onSnapshot:(path:string,next:()=>void)=>{transport.paths.push(path);api.signals.push(next);return vi.fn();}}));
const services={auth:{currentUser:{uid:"host"}},firestore:{},ensureAppCheckReady:async()=>{}};
vi.mock("../../contexts/FirebaseServicesContext",()=>({useFirebaseServices:()=>services}));
const view=(extra:Partial<MeetingDiscordView>={}):MeetingDiscordView=>({available:true,isHost:true,linked:true,state:"none",inviteUrl:null,channelUrl:null,serverInviteUrl:"https://discord.gg/server",expiresAt:null,...extra});
const ready=view({state:"ready",inviteUrl:"https://discord.gg/meeting"});
const show=(extra={})=>render(<MemoryRouter><MeetingDiscord eventId="meeting" groupId="club" uid="host" en={false} {...extra}/></MemoryRouter>);
beforeEach(()=>{vi.resetAllMocks();transport.paths=[];api.signals=[];api.getClubMeetingDiscord.mockResolvedValue(view());api.openClubMeetingDiscord.mockResolvedValue(ready);api.closeClubMeetingDiscord.mockResolvedValue(view({state:"closed"}));});
afterEach(()=>{vi.unstubAllEnvs();resetRuntimeConfigForTests();});
describe("meeting public Discord voice",()=>{
 it("keeps public-room guidance available on demand without replacing close confirmation",async()=>{
  api.getClubMeetingDiscord.mockResolvedValue(ready);show();
  const close=await screen.findByRole("button",{name:"음성 채널 닫기"});
  const help=screen.getByRole("button",{name:"디스코드 음성 모임"});
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.click(help);
  expect(screen.getByRole("tooltip")).toHaveTextContent("공개 음성 채널");
  expect(help).toHaveAttribute("aria-describedby",screen.getByRole("tooltip").id);
  fireEvent.keyDown(document,{key:"Escape"});
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.click(close);
  expect(screen.getByRole("group",{name:"음성 채널 닫기 확인"})).toHaveTextContent("연결 중인 사람들의 통화도 끝납니다");
  expect(api.closeClubMeetingDiscord).not.toHaveBeenCalled();
 });
 it("lets a host open the room and confirm closing before ending calls",async()=>{
  show();fireEvent.click(await screen.findByRole("button",{name:"음성 채널 열기"}));
  expect((await screen.findByRole("link",{name:"디스코드에서 함께하기"})).getAttribute("href")).toBe("https://discord.gg/meeting");
  const close=screen.getByRole("button",{name:"음성 채널 닫기"});
  // 음성 채널 닫기는 카드 제목 옆 아이콘 전용 버튼이다.
  expect(close.className).toContain("ds-btn--icon-only");expect(close.textContent).toBe("");expect(close).toHaveAttribute("title","음성 채널 닫기");
  expect(close.closest(".cp-heading-with-edit")?.querySelector("h2")?.textContent).toBe("디스코드 음성 모임");
  fireEvent.click(close);expect(api.closeClubMeetingDiscord).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"채널 닫기 확정"}));await waitFor(()=>expect(api.closeClubMeetingDiscord).toHaveBeenCalledWith("meeting"));
  await waitFor(()=>expect(screen.queryByRole("link",{name:"디스코드에서 함께하기"})).toBeNull());
 });
 it("shares the public invite with spectators without host controls",async()=>{
  api.getClubMeetingDiscord.mockResolvedValue({...ready,isHost:false,linked:false});show();
  await screen.findByRole("link",{name:"디스코드에서 함께하기"});expect(screen.queryByRole("button",{name:"음성 채널 닫기"})).toBeNull();
 });
 it("asks an unlinked host to connect the existing Discord account",async()=>{
  api.getClubMeetingDiscord.mockResolvedValue(view({linked:false}));show();await screen.findByRole("link",{name:"디스코드 계정 연결"});expect(screen.queryByRole("button",{name:"음성 채널 열기"})).toBeNull();
 });
 it("hides expired meeting actions even if a prior room snapshot is ready",async()=>{
  api.getClubMeetingDiscord.mockResolvedValue(ready);show({ended:true});await screen.findByText("모임이 끝나 음성 채널을 정리합니다.");
  await act(async()=>{});expect(screen.queryByRole("link",{name:"디스코드에서 함께하기"})).toBeNull();
 });
 it("rejects unsafe invite destinations",async()=>{
  api.getClubMeetingDiscord.mockResolvedValue({...ready,inviteUrl:"https://evil.test/discord.gg"});show();await screen.findByRole("button",{name:"음성 채널 닫기"});expect(screen.queryByRole("link",{name:"디스코드에서 함께하기"})).toBeNull();
 });
 it("ignores focus reloads during a mutation so an old snapshot cannot replace the room",async()=>{
  let release!:(value:MeetingDiscordView)=>void;api.openClubMeetingDiscord.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));show();fireEvent.click(await screen.findByRole("button",{name:"음성 채널 열기"}));
  fireEvent.focus(window);expect(api.getClubMeetingDiscord).toHaveBeenCalledTimes(1);
  api.getClubMeetingDiscord.mockResolvedValue(ready);await act(async()=>release(ready));await screen.findByRole("link",{name:"디스코드에서 함께하기"});
 });
 it("refreshes from a server signal without periodic polling",async()=>{
  show();await screen.findByRole("button",{name:"음성 채널 열기"});api.getClubMeetingDiscord.mockResolvedValue(ready);
  await act(async()=>api.signals[0]!());await screen.findByRole("link",{name:"디스코드에서 함께하기"});
 });
 it("keeps the Firestore invite while the initial world connection is unavailable",async()=>{
  vi.stubEnv("VITE_ORIDER_LOCAL_WORLD","1");
  vi.stubEnv("VITE_ORIDER_LOCAL_DISCORD_REDIS","1");
  resetRuntimeConfigForTests({useEmulators:true,firebaseProjectId:"demo-orider-world"});
  api.getClubMeetingDiscord.mockResolvedValue(ready);
  show();
  await screen.findByRole("link",{name:"디스코드에서 함께하기"});
  act(()=>transport.subscribe.mock.lastCall?.[4]?.disconnected?.(1013));
  expect(screen.getByRole("link",{name:"디스코드에서 함께하기"})).toBeInTheDocument();
 });
 it("uses the Discord WebSocket for invalidation, and clears stale links on disconnect or revocation",async()=>{
  vi.stubEnv("VITE_ORIDER_LOCAL_WORLD","1");
  vi.stubEnv("VITE_ORIDER_LOCAL_DISCORD_REDIS","1");
  resetRuntimeConfigForTests({useEmulators:true,firebaseProjectId:"demo-orider-world"});
  const signal=()=>transport.subscribe.mock.lastCall?.[4];
  show();
  await screen.findByRole("button",{name:"음성 채널 열기"});
  expect(transport.subscribe.mock.lastCall?.[0]).toBe("meeting");
  expect(signal()?.topic).toBe("discord");
  expect(transport.paths).toEqual(["events/meeting/discord_signals/latest","events/meeting","groups/club","groups/club/members/host"]);
  api.getClubMeetingDiscord.mockResolvedValue(ready);
  await act(async()=>signal()?.changed("1"));
  await screen.findByRole("link",{name:"디스코드에서 함께하기"});
  act(()=>signal()?.disconnected?.(1013));
  expect(screen.queryByRole("link",{name:"디스코드에서 함께하기"})).toBeNull();
  await act(async()=>signal()?.changed("2"));
  await screen.findByRole("link",{name:"디스코드에서 함께하기"});
  act(()=>signal()?.disconnected?.(4003));
  expect(screen.queryByRole("link",{name:"디스코드에서 함께하기"})).toBeNull();
  expect(screen.getByRole("alert")).toBeInTheDocument();
 });
 it("discards an old account's response after the scope changes",async()=>{
  let release!:(value:MeetingDiscordView)=>void;api.getClubMeetingDiscord.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const ui=show();ui.rerender(<MemoryRouter><MeetingDiscord eventId="other" groupId="club" uid="viewer" en={false}/></MemoryRouter>);
  await screen.findByRole("button",{name:"음성 채널 열기"});await act(async()=>release(ready));expect(screen.queryByRole("link",{name:"디스코드에서 함께하기"})).toBeNull();
 });
});
