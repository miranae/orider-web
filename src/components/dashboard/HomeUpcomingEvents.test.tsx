import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ calls: 0, failFirst: true, user: { uid: "owner", isAnonymous: false } }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../../services/firebase", () => ({ functions: {}, ensureAppCheckReady: () => Promise.resolve() }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => async () => {
  mocks.calls++;
  if (mocks.failFirst && mocks.calls === 1) throw new Error("events unavailable");
  return { data: { events: [{ eventId: "e1", name: "Event 1", startTime: Date.now() + 86400000 }] } };
} }));
import HomeUpcomingEvents from "./HomeUpcomingEvents";
import { logClientError } from "../../services/errorLogger";

// 실패 문구 자체를 누르면 다시 읽는다 — 「다시 시도」 버튼을 새로 두지 않는다.
it("re-reads registered events when the failure text is pressed, logging the failure", async () => {
  render(<MemoryRouter><HomeUpcomingEvents compact /></MemoryRouter>);
  const failure = await screen.findByRole("button", { name: "잠시 불러올 수 없어요" });
  expect(logClientError).toHaveBeenCalledWith("HomeTodayStrip.events", expect.any(Error));
  expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  fireEvent.click(failure);
  expect(screen.queryByRole("button", { name: "잠시 불러올 수 없어요" })).toBeNull();
  expect(await screen.findByText(/Event 1/)).toBeInTheDocument();
  expect(mocks.calls).toBe(2);
});
