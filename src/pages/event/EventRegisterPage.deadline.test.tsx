import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { setDocData } from "../../__tests__/mocks/firebase";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import EventRegisterPage from "./EventRegisterPage";

function renderRegistration(closeAt: unknown) {
  setDocData("events/qa-event", { info: { name: "Deadline fixture", status: "OPEN", type: "TOUR",
    startTime: Date.now() + 86_400_000, closeAt, feeType: "FREE", categories: [] } });
  return renderWithProviders(<Routes><Route path="/ko/event/:eventId/register" element={<EventRegisterPage />} /></Routes>,
    { route: "/ko/event/qa-event/register", authenticated: true });
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
  });
});
