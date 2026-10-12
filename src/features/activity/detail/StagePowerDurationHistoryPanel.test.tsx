import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { historyCompute, historyComputed, historyCandidate, historyPage, historySelection } from "../../../services/stagePowerDurationHistory.testFixture";
import Panel from "./StagePowerDurationHistoryPanel";
const mocks = vi.hoisted(() => ({ hook: vi.fn(), start: vi.fn(), next: vi.fn(), calculate: vi.fn() }));
vi.mock("../../../hooks/useStagePowerDurationHistory", () => ({ useStagePowerDurationHistory: (...args: unknown[]) => mocks.hook(...args) }));
const state = () => ({ available: true, durationSeconds: 17, periods: historySelection.periods.map(() => ({ page: null, candidates: [] })), computed: [], canStart: () => true, canNext: () => true, busy: false, failure: null, start: mocks.start, next: mocks.next, calculate: mocks.calculate });
beforeEach(() => { mocks.hook.mockReset().mockReturnValue(state()); mocks.start.mockClear(); mocks.next.mockClear(); mocks.calculate.mockClear(); });
it("stays folded with zero actions on mount/open/draft/unit changes and starts a selected period manually", () => {
  renderWithProviders(<Panel ownerUid="owner" periods={historySelection.periods} />);
  const title = screen.getByText("기간별 원하는 시간 파워 비교"); expect(title.closest("details")).not.toHaveAttribute("open"); fireEvent.click(title);
  fireEvent.change(screen.getByRole("textbox", { hidden: true }), { target: { value: "2:17" } }); fireEvent.click(screen.getByRole("button", { name: "W/kg", hidden: true }));
  expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.calculate).not.toHaveBeenCalled(); expect(mocks.next).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("button", { name: "이 기간 확인", hidden: true })[0]!); expect(mocks.start).toHaveBeenCalledWith(0);
});
it("shows separate W/weight winners and origin qualifications with actual source links and no extra query", () => {
  const a = historyComputed(historyCandidate("a"),300,100), b = historyComputed(historyCandidate("b"),280,50), c = historyComputed({ ...historyCandidate("c"), sourcePowerOrigin: "stored_native_watts_unverified" },1000,25);
  mocks.hook.mockReturnValue({ ...state(), computed: [historyCompute([a,b]),historyCompute([c])] });
  renderWithProviders(<Panel ownerUid="owner" periods={historySelection.periods} />);
  expect(screen.getByText("300 W · 0:17")).toBeInTheDocument(); expect(screen.getAllByText("저장된 파워값 · 측정 출처 미확인")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "W/kg", hidden: true })); expect(screen.getByText("5.6 W/kg · 0:17")).toBeInTheDocument();
  expect(screen.getByText(/계산 당시 설정 체중 50kg/)).toHaveTextContent("계산 시점 미확인");
  expect(screen.getAllByRole("link", { hidden: true }).map(a => a.getAttribute("href"))).toContain("/ko/activity/b"); expect(mocks.calculate).not.toHaveBeenCalled();
});
it("keeps zero distinct from no prepared/uncalculated results and query exhaustion distinct from full-account best", () => {
  const page = historyPage(); mocks.hook.mockReturnValue({ ...state(), periods: [{ page, candidates: page.activities }, { page: null, candidates: [] }], computed: [historyCompute([historyComputed(undefined,0,null)])] });
  renderWithProviders(<Panel ownerUid="owner" periods={historySelection.periods} />);
  expect(screen.getByText("0 W · 0:17")).toBeInTheDocument(); expect(screen.getByText(/전체 기록의 최고를 확정하지 않습니다/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "W/kg", hidden: true })); expect(screen.queryByText("0 W/kg · 0:17")).not.toBeInTheDocument();
  expect(screen.getAllByText("이 기준에서 계산된 기록이 없습니다.").length).toBeGreaterThan(0);
});
