import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { getDocs } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TrainingLogPage from "./TrainingLogPage";
import { planCalendarDate, planMonthBounds } from "@shared/training/planDate";

const state = vi.hoisted(() => ({ mobile: false, user: { uid: "rider" } }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("../hooks/useMobile", () => ({ useMobile: () => state.mobile }));
vi.mock("../components/mobile/ImportActivityModal", () => ({ default: () => null }));

// 훈련 달력의 날짜 경계는 실행 머신의 시간대와 무관하게 KST 계약을 따른다.
const now = planCalendarDate(Date.now());
const startTime = planMonthBounds(now.getUTCFullYear(), now.getUTCMonth()).start + 12 * 3600000;
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
    data: () => ({ userId: "rider", startTime: startTime + index * 2 * 3600000, type: "Ride", description: `Ride ${index}`, summary }),
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
    await waitFor(() => expectMetric("활동 수", "7"));
    expectMetric("총 거리", "15.0");
    expectMetric("총 시간", "1h 30m");
    expectMetric("총 고도", "150");
    expectMetric("총 TSS", "140");
    const more = screen.getByRole("button", { name: "외 4건 보기" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(screen.getByRole("button", { name: /Ride 5/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "접기" })).toHaveAttribute("aria-expanded", "true");
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it("모바일 월 요약·종목 거리·활동 목록도 같은 안전한 측정값을 사용한다", async () => {
    state.mobile = true;
    const { container } = render(<MemoryRouter><TrainingLogPage /></MemoryRouter>);
    await waitFor(() => expectMetric("총 세션", "7"));
    const glance = screen.getByLabelText("이번 달 운동 요약");
    expect(glance).toHaveTextContent("1h 30m");
    expect(glance).toHaveTextContent("140");
    expectMetric("상승고도", "150m");
    expect(glance).toHaveTextContent("15.0km");
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
    fireEvent.click(screen.getByRole("tab", { name: "활동" }));
    expect(screen.getByText("Ride 2")).toBeInTheDocument();
    expect([...container.querySelectorAll(".mobile-log__activity-distance")].filter((item) => item.textContent === "—")).toHaveLength(5);
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });
});

describe("운동 기록의 확정 부하와 달성 상태", () => {
  it("날짜 경계 쌍둥이의 원본 목록은 보존하고 대표 부하가 없는 날짜는 달성을 확정하지 않는다", async () => {
    const nativeStart = startTime + 12 * 3600000 - 15000;
    const stravaStart = nativeStart + 30000;
    const docs = [
      { id: "native-boundary", data: () => ({ userId: "rider", source: "orider", type: "Ride", description: "원본 기록",
        startTime: nativeStart, summary: { distance: 1000, ridingTimeMillis: 3600000, tss: 100 } }) },
      { id: "strava_1", data: () => ({ userId: "rider", source: "strava", type: "Ride", description: "대표 기록",
        startTime: stravaStart, summary: { distance: 1000, ridingTimeMillis: 3600000, tss: 100 } }) },
    ];
    vi.mocked(getDocs).mockReset();
    vi.mocked(getDocs).mockResolvedValue({ docs: [], empty: true } as never)
      .mockResolvedValueOnce({ docs, empty: false } as never)
      .mockResolvedValueOnce({ docs: [], empty: true } as never)
      .mockResolvedValueOnce({ docs: [{ id: "goal", data: () => ({}) }], empty: false } as never)
      .mockResolvedValueOnce({ docs: [{ id: "week", data: () => ({ days: [nativeStart, stravaStart].map((date) => ({
        date, workout: "z2", plannedTSS: 80, plannedDurationMin: 60,
      })) }) }], empty: false } as never);
    render(<MemoryRouter><TrainingLogPage /></MemoryRouter>);
    await waitFor(() => expectMetric("총 TSS", "100"));
    expectMetric("활동 수", "2");
    await waitFor(() => expect(screen.getByLabelText("실제 부하 미확인 · 달성 여부 판단 불가")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /원본 기록/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /대표 기록/ })).toBeInTheDocument();
  });

  it.each([false, true])("accepted 부하를 쓰고 미확인 활동 혼입=%s면 달성을 확정하지 않는다", async (unknown) => {
    const docs = [{id: "accepted-ride", data: () => ({userId: "rider", source: "strava", type: "Ride", startTime,
      summary: {ridingTimeMillis: 3600000, tss: 122},
      serverDerivedLoad: {schemaVersion: 1, userId: "rider", inputBinding: "accepted-revision", streamTss: 306.93}})}];
    if (unknown) docs.push({id: "unknown-ride", data: () => ({userId: "rider", source: "strava", type: "Ride", startTime: startTime + 7200000,
      summary: null as unknown as {ridingTimeMillis: number; tss: number}, serverDerivedLoad: undefined as never})});
    vi.mocked(getDocs).mockReset();
    vi.mocked(getDocs).mockResolvedValue({docs: [], empty: true} as never)
      .mockResolvedValueOnce({docs, empty: false} as never)
      .mockResolvedValueOnce({docs: [], empty: true} as never)
      .mockResolvedValueOnce({docs: [{id: "goal", data: () => ({})}], empty: false} as never)
      .mockResolvedValueOnce({docs: [{id: "week", data: () => ({days: [{date: startTime, workout: "z2", plannedTSS: 200, plannedDurationMin: 60}]})}], empty: false} as never);
    render(<MemoryRouter><TrainingLogPage /></MemoryRouter>);
    await waitFor(() => expectMetric("총 TSS", "307"));
    if (unknown) {
      await waitFor(() => expect(screen.getByLabelText("실제 부하 미확인 · 달성 여부 판단 불가")).toBeInTheDocument());
      expect(screen.queryByText("△")).not.toBeInTheDocument();
      expect(screen.queryByText("✓")).not.toBeInTheDocument();
    } else {
      await waitFor(() => expect(screen.getByText("✓")).toBeInTheDocument());
    }
  });
});

it("개별 미확인 거리·시간은 실제 영 기록과 구분한다", async () => {
  state.mobile = true;
  const docs = [
    {id: "zero", data: () => ({userId: "rider", startTime, type: "Ride", description: "실제 영 기록", summary: {distance: 0, ridingTimeMillis: 0, tss: 0}})},
    {id: "missing", data: () => ({userId: "rider", startTime: startTime + 7200000, type: "Ride", description: "미확인 기록", summary: {}})},
  ];
  vi.mocked(getDocs).mockReset().mockResolvedValue({docs: [], empty: true} as never)
    .mockResolvedValueOnce({docs, empty: false} as never);
  render(<MemoryRouter><TrainingLogPage /></MemoryRouter>);
  await waitFor(() => expectMetric("총 세션", "2"));
  fireEvent.click(screen.getByRole("tab", {name: "활동"}));
  const zero = screen.getByText("실제 영 기록").closest("button")!;
  const missing = screen.getByText("미확인 기록").closest("button")!;
  expect(zero).toHaveTextContent("0.0km");
  expect(zero).toHaveTextContent("0:00");
  expect(missing).toHaveTextContent("—");
  expect(missing).not.toHaveTextContent("0.0km");
  expect(missing).not.toHaveTextContent("0:00");
});
