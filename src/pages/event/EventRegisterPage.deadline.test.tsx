import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { setDocData } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import EventRegisterPage from "./EventRegisterPage";

function renderRegistration(closeAt: unknown, status = "OPEN", authenticated = true) {
  setDocData("events/qa-event", { info: { name: "Deadline fixture", status, type: "TOUR",
    startTime: Date.now() + 86_400_000, closeAt, feeType: "FREE", categories: [] } });
  return renderWithProviders(<Routes><Route path="/ko/event/:eventId/register" element={<EventRegisterPage />} /></Routes>,
    { route: "/ko/event/qa-event/register", authenticated });
}

describe("event registration Firestore deadline", () => {
  it("renders a future Timestamp deadline without rendering its raw object", async () => {
    renderRegistration({ seconds: Math.floor((Date.now() + 43_200_000) / 1000), nanoseconds: 0 });
    expect((await screen.findAllByText("Deadline fixture")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/문제가 발생했어요/)).not.toBeInTheDocument();
  });

  it.each(["timestamp", "iso"])("blocks a still-future event after its %s deadline", async (format) => {
    const past = Date.now() - 60_000;
    renderRegistration(format === "timestamp" ? { seconds: Math.floor(past / 1000), nanoseconds: 0 } : new Date(past).toISOString());
    expect(await screen.findByText("모집이 마감되었습니다")).toBeInTheDocument();
    expect(screen.queryByText("참가자 정보")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "참가", exact: true }));
    expect(screen.getByText("모집이 마감되었습니다")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("홍길동")).not.toBeInTheDocument();
  });
  it.each(["LIVE", "FINISHED", "DRAFT", "CANCELLED"])("keeps %s registration readonly and exposes results only for LIVE/FINISHED", async status => {
    renderRegistration(new Date(Date.now() + 43200000).toISOString(), status);
    const closedTitle = await screen.findByText("현재 모집 중이 아닙니다");
    expect(closedTitle.closest(".event-register-state")).not.toBeNull();
    expect(closedTitle.closest("[role=status]")?.querySelector("svg.lucide-clock-3")).not.toBeNull();
    expect(screen.queryByText("⏱️")).toBeNull();
    expect(screen.getByTestId("D4-T")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "참가", exact: true })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "종합 결과", exact: true }) !== null).toBe(["LIVE", "FINISHED"].includes(status));
    fireEvent.click(screen.getByRole("link", { name: "참가", exact: true }));
    expect(screen.queryByPlaceholderText("홍길동")).not.toBeInTheDocument();
  });
  it("keeps direct registration behind Google login even after selecting the participation tab", async () => {
    renderRegistration(new Date(Date.now() + 43200000).toISOString(), "OPEN", false);
    expect(await screen.findByRole("button", { name: /Google/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "참가", exact: true }));
    expect(screen.getByRole("button", { name: /Google/ })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("홍길동")).not.toBeInTheDocument();
  });
});
