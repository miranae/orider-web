import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MeetingSpectatorView from "./MeetingSpectatorView";
import { spectatorFixture } from "./fixtures";
vi.mock("../../components/event/EventMap", () => ({default: ({selectedUid, onSelectParticipant}: {selectedUid: string | null; onSelectParticipant: (uid: string | null) => void}) => <><button onClick={() => onSelectParticipant("rider-two")}>지도 선택 {selectedUid}</button><button onClick={() => onSelectParticipant(null)}>지도 팝업 닫기</button></>}));
describe("클럽 가상 관전", () => {
  it("배번 없이 검색·선택·팔로우하고 코스 전체 보기에서도 친구 선택을 유지한다", () => {
    renderWithProviders(<MeetingSpectatorView snapshot={spectatorFixture(100000)} now={100000} receivedAt={100000} en={false} />);
    expect(screen.getAllByText("0 W")[0]).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "지도 선택"}));
    expect(screen.getByRole("button", {name: "나래", exact: true})).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", {name: "나래 팔로우"}));
    fireEvent.click(screen.getByRole("button", {name: /팔로우만 보기/}));
    expect(screen.queryByRole("button", {name: "솔바람", exact: true})).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), {target: {value: "rider-two"}});
    expect(screen.getByRole("button", {name: "나래", exact: true})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "지도 팝업 닫기"}));
    expect(screen.getByRole("button", {name: "나래", exact: true})).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", {name: "코스 전체 보기"}));
    expect(screen.getByRole("button", {name: "나래", exact: true})).toHaveAttribute("aria-pressed", "true");
  });
  it("종료 후 실시간 위치 대신 모임 결과와 기록 비교 진입을 제공한다", () => {
    renderWithProviders(<MeetingSpectatorView snapshot={{...spectatorFixture(100000), status: "FINISHED", course: null, locations: []}} now={100000} receivedAt={100000} en={false} />);
    expect(screen.getByRole("link", {name: "모임 결과 확인"})).toHaveAttribute("href", "/ko/club/fixture-club/meetings/fixture#meeting-results");
    expect(screen.queryByText(/지도 선택/)).not.toBeInTheDocument();
  });
});

it("위치가 없는 출발 대기 친구도 검색하고 선택한다", () => {
  renderWithProviders(<MeetingSpectatorView snapshot={{...spectatorFixture(100000), participants: [{uid: "waiting", displayName: "출발 전 친구", status: "REGISTERED"}], locations: []}} now={100000} receivedAt={100000} en={false} />);
  fireEvent.change(screen.getByRole("textbox"), {target: {value: "출발 전 친구"}});
  fireEvent.click(screen.getByRole("button", {name: "출발 전 친구", exact: true}));
  expect(screen.getByRole("button", {name: "출발 전 친구", exact: true})).toHaveAttribute("aria-pressed", "true");
  expect(screen.getAllByText("출발 대기").length).toBeGreaterThan(0);
});
it("취소된 모임에 결과 업로드를 안내하지 않는다", () => {
  renderWithProviders(<MeetingSpectatorView snapshot={{...spectatorFixture(100000), status: "CANCELLED"}} now={100000} receivedAt={100000} en={false} />);
  expect(screen.getByText("모임이 취소됐어요")).toBeInTheDocument();
  expect(screen.queryByRole("link", {name: "모임 결과 확인"})).not.toBeInTheDocument();
});

it("출발 전에 고른 친구의 위치가 들어오면 재선택 없이 지도를 따라간다", () => {
  const fixture = spectatorFixture(100000);
  const waiting = {...fixture, participants: [{uid: "rider-two", displayName: "나래", status: "REGISTERED"}], locations: []};
  const view = renderWithProviders(<MeetingSpectatorView snapshot={waiting} now={100000} receivedAt={100000} en={false} />);
  fireEvent.click(screen.getByRole("button", {name: "나래", exact: true}));
  view.rerender(<MeetingSpectatorView snapshot={{...fixture, participants: [{uid: "rider-two", displayName: "나래", status: "RIDING"}]}} now={100000} receivedAt={100000} en={false} />);
  expect(screen.getByRole("button", {name: "지도 선택 rider-two"})).toBeInTheDocument();
  expect(screen.getByRole("button", {name: "나래", exact: true})).toHaveAttribute("aria-pressed", "true");
});
