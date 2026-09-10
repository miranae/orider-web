import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { getDocs } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TrainingLogPage from "./TrainingLogPage";

const state = vi.hoisted(() => ({ mobile: false, user: { uid: "rider" } }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("../hooks/useMobile", () => ({ useMobile: () => state.mobile }));
vi.mock("../components/mobile/ImportActivityModal", () => ({ default: () => null }));

const now = new Date();
const startTime = new Date(now.getFullYear(), now.getMonth(), 1, 12).getTime();
const summaries = [
  { distance: 12000, ridingTimeMillis: 3600000, elevationGain: 120, tss: 70 },
  { distance: 3000, ridingTimeMillis: 1800000, elevationGain: 30.4, tss: 40 },
  { tss: 15 },
  { distance: null, ridingTimeMillis: null, elevationGain: null, tss: 10 },
  { distance: NaN, ridingTimeMillis: Infinity, elevationGain: -Infinity, tss: 5 },
  { distance: Infinity, ridingTimeMillis: NaN, elevationGain: NaN, tss: 0 },
];

beforeEach(() => {
  state.mobile = false;
  const docs = [...summaries, null].map((summary, index) => ({
    id: `ride-${index}`,
    data: () => ({ userId: "rider", startTime, type: "Ride", description: `Ride ${index}`, summary }),
  }));
  vi.mocked(getDocs).mockReset();
  vi.mocked(getDocs)
    .mockResolvedValue({ docs: [], empty: true } as unknown as Awaited<ReturnType<typeof getDocs>>)
    .mockResolvedValueOnce({ docs, empty: false } as unknown as Awaited<ReturnType<typeof getDocs>>);
});
afterEach(cleanup);

function expectMetric(label: string, value: string) {
  expect(screen.getByText(label).parentElement).toHaveTextContent(value);
}

describe("운동 기록의 부분 요약", () => {
  it("데스크톱 합계와 캘린더에서 누락·비유한 측정값만 제외하고 활동 수와 TSS는 보존한다", async () => {
    const { container } = render(<MemoryRouter><TrainingLogPage /></MemoryRouter>);
    await waitFor(() => expectMetric("활동 수", "6"));
    expectMetric("총 거리", "15.0");
    expectMetric("총 시간", "1h 30m");
    expectMetric("총 고도", "150");
    expectMetric("총 TSS", "140");
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("모바일 월 요약·종목 거리·활동 목록도 같은 안전한 측정값을 사용한다", async () => {
    state.mobile = true;
    const { container } = render(<MemoryRouter><TrainingLogPage /></MemoryRouter>);
    await waitFor(() => expectMetric("총 세션", "6"));
    expectMetric("총 시간", "1h 30m");
    expectMetric("총 TSS", "140");
    expectMetric("상승고도", "150m");
    expect(screen.getByText("15.0")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    fireEvent.click(screen.getByRole("tab", { name: "활동" }));
    expect(screen.getByText("Ride 2")).toBeInTheDocument();
    expect(screen.getAllByText("0.0km")).toHaveLength(4);
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });
});
