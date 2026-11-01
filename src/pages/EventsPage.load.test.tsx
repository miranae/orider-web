import { fireEvent, screen } from "@testing-library/react";
import { getDocs } from "firebase/firestore";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import EventsPage from "./EventsPage";
const empty = (fromCache = false) => ({ docs: [], forEach: () => {}, metadata: { fromCache } });
describe("public event discovery failure contract", () => {
  it("distinguishes a request failure from a confirmed empty list and recovers on retry", async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(new Error("offline"));
    renderWithProviders(<EventsPage />, { route: "/ko/explore/events" });
    expect(await screen.findByText("이벤트를 불러오지 못했어요. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(screen.queryByText("등록된 이벤트가 없습니다")).not.toBeInTheDocument();
    vi.mocked(getDocs).mockResolvedValueOnce(empty() as never);
    fireEvent.click(screen.getByRole("button", { name: /다시/ }));
    expect(await screen.findByText("등록된 이벤트가 없습니다")).toBeInTheDocument();
    expect(screen.queryByText("이벤트를 불러오지 못했어요. 다시 시도해 주세요.")).not.toBeInTheDocument();
  });
  it("does not advertise a cache-only result as a server-confirmed empty directory", async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(empty(true) as never);
    renderWithProviders(<EventsPage />, { route: "/ko/explore/events" });
    expect(await screen.findByText("이벤트를 불러오지 못했어요. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(screen.queryByText("등록된 이벤트가 없습니다")).not.toBeInTheDocument();
  });
});
