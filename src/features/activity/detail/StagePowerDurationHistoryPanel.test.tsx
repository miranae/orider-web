import { fireEvent, screen, within } from "@testing-library/react";
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
  expect(screen.getByText("300 W · 0:17")).toBeInTheDocument(); expect(screen.getAllByText("저장된 파워값 · 측정 출처 미확인")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "W/kg", hidden: true })); expect(screen.getByText("5.6 W/kg · 0:17")).toBeInTheDocument();
  expect(screen.getByText(/계산 당시 설정 체중 50kg/)).toHaveTextContent("계산 시점 미확인");
  expect(screen.getAllByRole("link", { hidden: true }).map(a => a.getAttribute("href"))).toContain("/ko/activity/b"); expect(mocks.calculate).not.toHaveBeenCalled();
});
it("keeps zero distinct from no prepared/uncalculated results and query exhaustion distinct from full-account best", () => {
  const page = historyPage(); mocks.hook.mockReturnValue({ ...state(), periods: [{ page, candidates: page.activities }, { page: null, candidates: [] }], computed: [historyCompute([historyComputed(undefined,0,null)])] });
  renderWithProviders(<Panel ownerUid="owner" periods={historySelection.periods} />);
  expect(screen.getByText("0 W · 0:17")).toBeInTheDocument(); expect(screen.getByText(/전체 기록의 최고를 확정하지 않습니다/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "W/kg", hidden: true })); expect(screen.queryByText("0 W/kg · 0:17")).not.toBeInTheDocument();
  expect(screen.getAllByText("계산 확인 완료 · 표시할 W/kg 결과 없음").length).toBeGreaterThan(0);
});
it("uses one date for a KST day, h23 calculation times, and retains exact exclusive bounds in the closed basis", () => {
  const from = Date.UTC(2026,9,10,15), to = from + 86400000;
  const ranges = [{ fromInclusive: from, toExclusive: to }];
  const candidate = historyCandidate("actual-source",from+3600000), calculated = historyComputed(candidate,400,76);
  calculated.weightNormalized!.computedAt = from + 13*3600000 + 25*60000;
  const response = historyCompute([calculated]); response.periods = ranges;
  mocks.hook.mockReturnValue({ ...state(), computed: [response], periods: [{ page: null, candidates: [] }] });
  renderWithProviders(<Panel ownerUid="owner" periods={ranges} />);
  const heading = screen.getByRole("heading", { name: /^기간 1/, hidden: true });
  expect(heading).toHaveTextContent("2026. 10. 11."); expect(heading.textContent).not.toMatch(/00:00|23:59|오전|오후|–/);
  fireEvent.click(screen.getByRole("button", { name: "W/kg", hidden: true }));
  expect(screen.getByText(/계산 당시 설정 체중 76kg/)).toHaveTextContent("13:25 (한국 시간)");
  expect(screen.getByText(/계산 당시 설정 체중 76kg/)).not.toHaveTextContent(/오전|오후/);
  const basis = screen.getByText("비교의 기준").closest("details")!; expect(basis).not.toHaveAttribute("open");
  expect(within(basis).getByText(/기간 1 · 시작/)).toHaveTextContent("00:00:00 포함 / 종료 2026. 10. 12. 00:00:00 제외 (한국 시간)");
  expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.calculate).not.toHaveBeenCalled();
});
it("shows overall uncertainty once, preserves zero detail counts in basis, and explains uncomputed loaded periods", () => {
  const first = historyPage([historyCandidate("a"), { ...historyCandidate("unsupported"), analysisState: "unsupported", sourcePowerOrigin: null }]);
  const second = historyPage([historyCandidate("b",500)]);
  mocks.hook.mockReturnValue({ ...state(), periods: [{ page: first, candidates: first.activities }, { page: second, candidates: second.activities }], computed: [historyCompute([historyComputed(first.activities[0])])] });
  renderWithProviders(<Panel ownerUid="owner" periods={historySelection.periods} />);
  expect(screen.getAllByText("조회를 마쳐도 전체 기록의 최고를 확정하지 않습니다.")).toHaveLength(1);
  expect(screen.getByText(/확인 2건 · 계산 확인 1건 · 미계산 1건/)).toHaveTextContent("(미계산 중 기준 미충족 1건 포함)");
  expect(screen.getByText("계산된 기록 없음 · 선택 후 계산하세요.")).toBeInTheDocument();
  const basis = screen.getByText("비교의 기준").closest("details")!;
  expect(within(basis).getAllByText("이 기간의 조회를 마쳤습니다.")).toHaveLength(2);
  expect(within(basis).getByText(/준비 데이터 없음 0건 · 연속 구간 없음 0건/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "W/kg", hidden: true }));
  expect(within(basis).getByText(/체중 확인 1건 · 없음 0건 · 유효하지 않음 0건 · 호환되지 않음 0건/)).toBeInTheDocument();
  expect(screen.queryByText("0 W · 0:17")).not.toBeInTheDocument(); expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.calculate).not.toHaveBeenCalled();
});
it("keeps multi-day labels and millisecond precision in applied boundary evidence", () => {
  const range = { fromInclusive: Date.UTC(2026,9,10,15)+1, toExclusive: Date.UTC(2026,9,12,15)+25 };
  mocks.hook.mockReturnValue({ ...state(), periods: [{ page: null, candidates: [] }] });
  renderWithProviders(<Panel ownerUid="owner" periods={[range]} />);
  expect(screen.getByRole("heading", { name: /^기간 1/, hidden: true })).toHaveTextContent("2026. 10. 11.–2026. 10. 13.");
  const basis = screen.getByText("비교의 기준").closest("details")!;
  expect(within(basis).getByText(/기간 1 · 시작/)).toHaveTextContent("00:00:00.001 포함 / 종료 2026. 10. 13. 00:00:00.025 제외");
});
it("does not invite selecting records when every inspected candidate is unqualified", () => {
  const page = historyPage([{ ...historyCandidate("unsupported"), analysisState: "unsupported", sourcePowerOrigin: null }]);
  mocks.hook.mockReturnValue({ ...state(), periods: [{ page, candidates: page.activities }, { page: null, candidates: [] }] });
  renderWithProviders(<Panel ownerUid="owner" periods={historySelection.periods} />);
  expect(screen.getByText("계산된 기록 없음 · 선택 가능한 기록 없음")).toBeInTheDocument();
  expect(screen.queryByText("계산된 기록 없음 · 선택 후 계산하세요.")).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { hidden: true })).toBeDisabled();
  expect(screen.queryByText(/0 W/)).not.toBeInTheDocument(); expect(mocks.calculate).not.toHaveBeenCalled();
});

it("distinguishes a completed missing snapshot check from an unexecuted selectable record", () => {
  const candidate = { ...historyCandidate("native-missing"), snapshotState: "missing" as const, sourcePowerOrigin: "stored_native_watts_unverified" as const };
  const page = historyPage([candidate]);
  const checked = { ...historyComputed(candidate), state: "unavailable" as const, reason: "snapshot_missing" as const, result: null, comparison: null, sourceDigest: null, weightNormalized: undefined };
  mocks.hook.mockReturnValue({ ...state(), periods: [{ page, candidates: page.activities }, { page: null, candidates: [] }], computed: [historyCompute([checked])] });
  renderWithProviders(<Panel ownerUid="owner" periods={historySelection.periods} />);
  expect(screen.getByText("계산 확인 완료 · 준비된 파워 데이터 없음")).toBeInTheDocument();
  expect(screen.queryByText("계산된 기록 없음 · 선택 후 계산하세요.")).not.toBeInTheDocument();
  expect(screen.queryByText("0 W · 0:17")).not.toBeInTheDocument();
  const basis = screen.getByText("비교의 기준").closest("details")!;
  expect(within(basis).getByText(/준비 데이터 없음 1건/)).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { hidden: true })).toBeDisabled();
  expect(mocks.calculate).not.toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled();
});

it("offers a ready native candidate with a missing snapshot for its first explicit check", () => {
  const candidate = { ...historyCandidate("native-missing"), snapshotState: "missing" as const, sourcePowerOrigin: "stored_native_watts_unverified" as const };
  const page = historyPage([candidate]);
  mocks.hook.mockReturnValue({ ...state(), periods: [{ page, candidates: page.activities }, { page: null, candidates: [] }] });
  renderWithProviders(<Panel ownerUid="owner" periods={historySelection.periods} />);
  expect(screen.getByText("계산된 기록 없음 · 선택 후 계산하세요.")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { hidden: true })).toBeEnabled();
  expect(screen.queryByText("계산 확인 완료 · 준비된 파워 데이터 없음")).not.toBeInTheDocument();
  expect(mocks.calculate).not.toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled();
});

it("labels availability counts and never describes missing weight as missing prepared power", () => {
  mocks.hook.mockReturnValue({ ...state(), computed: [historyCompute([historyComputed(historyCandidate("weighted-missing"),250,null)])] });
  renderWithProviders(<Panel ownerUid="owner" periods={historySelection.periods} />);
  expect(screen.getByText("250 W · 0:17")).toBeInTheDocument();
  expect(screen.getByText("표시 가능한 파워 결과 1/1건")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "W/kg", hidden: true }));
  expect(screen.getByText("계산 확인 완료 · 표시할 W/kg 결과 없음")).toBeInTheDocument();
  expect(screen.getByText("표시 가능한 파워 결과 0/1건")).toBeInTheDocument();
  expect(screen.queryByText("계산 확인 완료 · 준비된 파워 데이터 없음")).not.toBeInTheDocument();
  expect(screen.queryByText("0 W/kg · 0:17")).not.toBeInTheDocument();
  expect(mocks.calculate).not.toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled();
});
