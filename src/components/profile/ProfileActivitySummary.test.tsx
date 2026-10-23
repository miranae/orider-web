import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { readOwnProfileActivitySummary } from "../../services/profileActivitySummary";
import ProfileActivitySummary from "./ProfileActivitySummary";
import { createMockActivity } from "../../__tests__/fixtures/mockData";
vi.mock("../../services/profileActivitySummary", () => ({ readOwnProfileActivitySummary: vi.fn() }));
const day = Date.parse("2026-10-19T00:00:00+09:00");
function summary() {
  return { latest: createMockActivity({ id: "own-latest", description: "나의 최근 라이딩", startTime: day }), latestComplete: true,
    limited: false, weeksCount: 16, atLeast: false,
    week: Array.from({ length: 7 }, (_, index) => ({ timestamp: day + index * 86400000, today: index === 2, future: index > 2, active: index === 1 })) };
}
beforeEach(() => { vi.mocked(readOwnProfileActivitySummary).mockReset().mockResolvedValue(summary()); });
it("shows the actual latest activity and a sixteen-week streak independently of the searched feed", async () => {
  renderWithProviders(<ProfileActivitySummary uid="owner" />, { route: "/ko?q=unrelated&scope=friends&sport=run" });
  expect(await screen.findByRole("link", { name: /나의 최근 라이딩/ })).toHaveAttribute("href", "/ko/activity/own-latest");
  expect(screen.getByText("16주")).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "이번 주 활동" })).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(7);
  expect(screen.getByRole("listitem", { name: "10월 20일 활동 있음" })).toBeInTheDocument();
  expect(readOwnProfileActivitySummary).toHaveBeenCalledWith("owner");
});
it("labels a bounded streak as at least rather than an exact full-history number", async () => {
  vi.mocked(readOwnProfileActivitySummary).mockResolvedValue({ ...summary(), atLeast: true, limited: true });
  renderWithProviders(<ProfileActivitySummary uid="owner" />);
  expect(await screen.findByText("16주 이상")).toBeInTheDocument();
  expect(screen.getByText(/최근 활동 400개/)).toBeInTheDocument();
});
it("shows an unavailable state instead of inventing a zero on read failure", async () => {
  vi.mocked(readOwnProfileActivitySummary).mockRejectedValue(new Error("denied"));
  renderWithProviders(<ProfileActivitySummary uid="owner" />);
  expect(await screen.findAllByText("활동 기록을 불러오지 못했습니다.")).not.toHaveLength(0);
  expect(screen.queryByText("0주")).not.toBeInTheDocument();
});
it("masks old data while a different owner request is pending", async () => {
  const view = renderWithProviders(<ProfileActivitySummary uid="owner" />);
  await screen.findByText("16주");
  vi.mocked(readOwnProfileActivitySummary).mockImplementation(() => new Promise(() => {}));
  view.rerender(<ProfileActivitySummary uid="other" />);
  await waitFor(() => expect(screen.queryByText("16주")).not.toBeInTheDocument());
  expect(screen.queryByText("나의 최근 라이딩")).not.toBeInTheDocument();
});

it("keeps the streak explanation in the standard information tooltip", async () => {
  renderWithProviders(<ProfileActivitySummary uid="owner" />);
  await screen.findByText("16주");
  expect(screen.queryByText(/최근 52주 · 한국시간/)).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "나의 연속 운동" });
  expect(trigger).toHaveTextContent("나의 연속 운동");
  expect(trigger.querySelector("svg")).toBeNull();
  expect(trigger.style.textDecoration).not.toContain("underline");
  await userEvent.hover(trigger);
  trigger.focus();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  await userEvent.keyboard("{Enter}");
  expect(await screen.findByRole("tooltip")).toHaveTextContent("최근 52주");
  expect(trigger).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
  trigger.blur();
  trigger.focus();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  await userEvent.keyboard(" ");
  expect(await screen.findByRole("tooltip")).toBeInTheDocument();
});
