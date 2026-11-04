import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MeetingDiscord from "./MeetingDiscord";
import type { MeetingDiscordView } from "../../services/clubMeetings";
const api = vi.hoisted(() => ({getClubMeetingDiscord:vi.fn(),openClubMeetingDiscord:vi.fn(),closeClubMeetingDiscord:vi.fn()}));
vi.mock("./useClubMeetingsApi",()=>({useClubMeetingsApi:()=>api}));
vi.mock("../../services/errorLogger",()=>({logClientError:vi.fn()}));
vi.mock("../../components/LocalizedLink",()=>({LocalizedLink:({to,children,...props}:any)=><a href={to} {...props}>{children}</a>}));
const view=(extra:Partial<MeetingDiscordView>={}):MeetingDiscordView=>({available:true,isHost:true,linked:true,state:"none",inviteUrl:null,channelUrl:null,serverInviteUrl:"https://discord.gg/server",expiresAt:null,...extra});
const ready=view({state:"ready",inviteUrl:"https://discord.gg/meeting"});
const show=(extra={})=>render(<MemoryRouter><MeetingDiscord eventId="meeting" uid="host" en={false} {...extra}/></MemoryRouter>);
beforeEach(()=>{vi.resetAllMocks();api.getClubMeetingDiscord.mockResolvedValue(view());api.openClubMeetingDiscord.mockResolvedValue(ready);api.closeClubMeetingDiscord.mockResolvedValue(view({state:"closed"}));});
describe("meeting public Discord voice",()=>{
 it("lets a host open the room and confirm closing before ending calls",async()=>{
  show();fireEvent.click(await screen.findByRole("button",{name:"음성 채널 열기"}));
  expect((await screen.findByRole("link",{name:"디스코드에서 함께하기"})).getAttribute("href")).toBe("https://discord.gg/meeting");
  fireEvent.click(screen.getByRole("button",{name:"음성 채널 닫기"}));expect(api.closeClubMeetingDiscord).not.toHaveBeenCalled();
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
  await act(async()=>release(ready));await screen.findByRole("link",{name:"디스코드에서 함께하기"});
 });
 it("discards an old account's response after the scope changes",async()=>{
  let release!:(value:MeetingDiscordView)=>void;api.getClubMeetingDiscord.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const ui=show();ui.rerender(<MemoryRouter><MeetingDiscord eventId="other" uid="viewer" en={false}/></MemoryRouter>);
  await screen.findByRole("button",{name:"음성 채널 열기"});await act(async()=>release(ready));expect(screen.queryByRole("link",{name:"디스코드에서 함께하기"})).toBeNull();
 });
});
