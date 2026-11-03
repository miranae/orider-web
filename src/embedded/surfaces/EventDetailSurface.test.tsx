import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../pages/event/EventDetailPage", () => ({ default: () => <div>상세</div> }));
vi.mock("../../pages/event/EventRegisterPage", () => ({ default: () => <div>등록</div> }));
vi.mock("../../pages/event/EventResultsPage", () => ({ default: () => <div>결과</div> }));
vi.mock("../../pages/event/EventDashboardPage", () => ({ default: () => <div>관리</div> }));
vi.mock("../../pages/event/EventEditPage", () => ({ default: () => <div>수정</div> }));
vi.mock("../../pages/event/EventParticipantsPage", () => ({ default: () => <div>참가자</div> }));
vi.mock("../../pages/group/ClubMeetingPage", () => ({ default: function MeetingFixture() {
  const { groupId, meetingId } = useParams();
  return <div>모임 {groupId} {meetingId}</div>;
} }));

import EventDetailSurface from "./EventDetailSurface";

describe("이벤트 상세 웹뷰", () => {
  it.each([
    ["", "상세"], ["/register", "등록"], ["/results", "결과"],
    ["/host", "관리"], ["/host/edit", "수정"], ["/host/participants", "참가자"],
    ["/meeting/group-1/event-1", "모임 group-1 event-1"],
  ])("%s 화면을 공통 임베드 안에 표시한다", async (section, text) => {
    const ready = vi.fn();
    render(<MemoryRouter initialEntries={[`/ko/embed/event/event-1${section}`]}>
      <Routes><Route path="/:lang/embed/event/:eventId/*" element={
        <EventDetailSurface retryKey={0} onReady={ready} onError={vi.fn()} />
      } /></Routes>
    </MemoryRouter>);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByTestId("embedded-event-detail")).toBeInTheDocument();
    expect(ready).toHaveBeenCalledOnce();
  });
});
