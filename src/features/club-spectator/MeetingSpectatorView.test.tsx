import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MeetingSpectatorView from "./MeetingSpectatorView";
import { spectatorFixture } from "./fixtures";
vi.mock("../../components/event/EventMap", () => ({default: ({selectedUid, onSelectParticipant}: {selectedUid: string | null; onSelectParticipant: (uid: string) => void}) => <button onClick={() => onSelectParticipant("rider-two")}>지도 선택 {selectedUid}</button>}));
describe("클럽 가상 관전", () => {
  it("배번 없이 검색·선택·팔로우하고 코스 전체 보기로 선택을 해제한다", () => {
    renderWithProviders(<MeetingSpectatorView snapshot={spectatorFixture(100000)} now={100000} receivedAt={100000} en={false} />);
    expect(screen.getByText("0 W")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "지도 선택"}));
    expect(screen.getByRole("button", {name: "나래", exact: true})).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", {name: "나래 팔로우"}));
    fireEvent.click(screen.getByRole("button", {name: /팔로우만 보기/}));
    expect(screen.queryByRole("button", {name: "솔바람", exact: true})).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox"), {target: {value: "rider-two"}});
    expect(screen.getByRole("button", {name: "나래", exact: true})).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "코스 전체 보기"}));
    expect(screen.getByRole("button", {name: "나래", exact: true})).toHaveAttribute("aria-pressed", "false");
  });
  it("종료 후 실시간 위치 대신 모임 결과와 기록 비교 진입을 제공한다", () => {
    renderWithProviders(<MeetingSpectatorView snapshot={{...spectatorFixture(100000), status: "FINISHED", course: null, locations: []}} now={100000} receivedAt={100000} en={false} />);
    expect(screen.getByRole("link", {name: "모임 결과 확인"})).toHaveAttribute("href", "/ko/club/fixture-club/meetings/fixture");
    expect(screen.queryByText(/지도 선택/)).not.toBeInTheDocument();
  });
});
