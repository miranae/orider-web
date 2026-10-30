import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import SegmentLocalLegend from "./SegmentLocalLegend";
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../../services/segmentLocalLegend", () => ({ loadSegmentLocalLegend: mocks.load }));
const result = { coverage: "complete", windowStartMs: 1, windowEndMs: 1000, scannedCount: 6, totalEfforts: 6, riderCount: 2, leader: { userId: "u", nickname: "", effortCount: 3 } };
beforeEach(() => mocks.load.mockReset());
it("renders anonymous verified leader and clears names on failed refresh", async () => {
  mocks.load.mockResolvedValueOnce(result);
  renderWithProviders(<SegmentLocalLegend segmentId="s" />, { authenticated: true });
  fireEvent.click(screen.getByRole("button", { name: "완주 수 조회·새로고침" }));
  expect(await screen.findByText(/확인된 모집단의 최다 완주: 라이더 · 3회/)).toBeInTheDocument();
  mocks.load.mockRejectedValueOnce(new Error("denied"));
  fireEvent.click(screen.getByRole("button", { name: "완주 수 조회·새로고침" }));
  await screen.findByRole("alert"); expect(screen.queryByText(/확인된 모집단의 최다 완주:/)).not.toBeInTheDocument();
});
it("explains partial coverage without presenting a winner", async () => {
  mocks.load.mockResolvedValueOnce({ ...result, coverage: "partial", leader: null });
  renderWithProviders(<SegmentLocalLegend segmentId="s" />, { authenticated: true });
  fireEvent.click(screen.getByRole("button", { name: "완주 수 조회·새로고침" }));
  expect(await screen.findByRole("status")).toHaveTextContent("전체 기간을 확인하지 못해 레전드를 선정하지 않습니다");
  expect(screen.queryByText(/확인된 모집단의 최다 완주:/)).not.toBeInTheDocument();
});

it("removes a completed legacy result on focus without automatic refetch",async()=>{
 mocks.load.mockResolvedValueOnce(result);renderWithProviders(<SegmentLocalLegend segmentId="s"/>,{authenticated:true});fireEvent.click(screen.getByRole("button",{name:"완주 수 조회·새로고침"}));await screen.findByText(/확인된 모집단의 최다 완주:/);act(()=>window.dispatchEvent(new Event("focus")));expect(screen.queryByText(/확인된 모집단의 최다 완주:/)).not.toBeInTheDocument();expect(mocks.load).toHaveBeenCalledTimes(1);
});
it("keeps the provisional 500-record explanation collapsed and labels its scope", async () => {
 mocks.load.mockResolvedValue({...result,coverage:"partial",scannedCount:500,leader:null});
 renderWithProviders(<SegmentLocalLegend segmentId="s"/>,{authenticated:true});
 fireEvent.click(screen.getByRole("button",{name:"완주 수 조회·새로고침"}));
 const summary=await screen.findByText("빠른 조회 · 최대 500개");
 expect(summary.closest("details")).not.toHaveAttribute("open");
});
