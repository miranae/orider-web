import i18n from "i18next";
import enRecap from "../i18n/resources/en/recap.json";
import enCommon from "../i18n/resources/en/common.json";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockActivity, createMockSummary } from "../__tests__/fixtures/mockData";
const mocks = vi.hoisted(() => ({ activities: [] as import("@shared/types").Activity[], error: false, retry: vi.fn(), lifetimeRead: vi.fn(async () => [] as import("@shared/types").Activity[]), draw: vi.fn((_recap: unknown, _labels: unknown, _ratio: unknown) => ({})), save: vi.fn() }));
vi.mock("../hooks/yearActivitiesRead", () => ({ readLifetimeActivities: mocks.lifetimeRead }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner" }, profile: { nickname: "Owner" } }) }));
vi.mock("../hooks/useYearActivities", () => ({ useYearActivities: (_uid: string, selectedYear?: number) => ({ year: selectedYear ?? 2025, years: [2025, 2024], activities: mocks.activities, loading: false, error: mocks.error, retry: mocks.retry }) }));
vi.mock("../hooks/useRunRecords", () => ({ useRunRecords: () => ({ run: undefined }) }));
vi.mock("../hooks/useMilestones", () => ({ useMilestones: () => ({ achieved: new Map(), loading: false, markCelebrated: vi.fn() }) }));
vi.mock("../components/fitness/LifetimeMilestonesGrid", () => ({ default: ({scopeLabel}: {scopeLabel: string}) => <p data-testid="lifetime-scope">{scopeLabel}</p> }));
vi.mock("../components/recap/recapShareCanvas", () => ({ drawRecapShareCard: mocks.draw, canvasToPngBlob: () => Promise.resolve(new Blob(["image"], { type: "image/png" })) }));
vi.mock("file-saver", () => ({ saveAs: mocks.save }));
import YearRecapPage from "./YearRecapPage";
function show(query = "") {
  mocks.draw.mockClear();
  mocks.activities = [
    createMockActivity({ type: "Ride", startTime: Date.UTC(2025, 1, 1), summary: createMockSummary({ distance: 10000 }) }),
    createMockActivity({ type: "Run", startTime: Date.UTC(2025, 1, 2), summary: createMockSummary({ distance: 5000 }) }),
    createMockActivity({ type: "Swim", startTime: Date.UTC(2025, 1, 3), summary: createMockSummary({ distance: 1000 }) }),
  ];
  return render(<MemoryRouter initialEntries={[`/ko/athlete/me/records?year=2025${query}`]}><YearRecapPage /></MemoryRouter>);
}
async function sharedRecap() {
  fireEvent.click(within(screen.getByTestId("P2-4-2")).getByRole("button", { name: /정사각/ }));
  await waitFor(() => expect(mocks.draw).toHaveBeenCalled());
  return mocks.draw.mock.calls[0]![0] as unknown as { totalDistanceMeters: number; totalCount: number; breakdown: Array<{ discipline: string }> };
}
beforeEach(() => { mocks.error = false; mocks.retry.mockClear(); mocks.lifetimeRead.mockReset().mockResolvedValue([]); });

describe("annual recap sport scope", () => {
  it.each(["", "&sport=tri"])("includes running and swimming in default/all totals and sharing %s", async query => {
    show(query);
    expect(screen.getByText("2025년 나의 활동")).toBeInTheDocument();
    expect(within(screen.getByTestId("P2-0-1")).getByRole("tab", { name: /통합/ })).toHaveAttribute("aria-selected", "true");
    const recap = await sharedRecap();
    expect(recap.totalDistanceMeters).toBe(16000);
    expect(recap.totalCount).toBe(3);
  });
  it("filters to running and returns to all through the visible tab", async () => {
    show("&sport=run");
    expect((await sharedRecap()).totalDistanceMeters).toBe(5000);
    fireEvent.click(within(screen.getByTestId("P2-0-1")).getByRole("tab", { name: /통합/ }));
    mocks.draw.mockClear();
    expect((await sharedRecap()).totalDistanceMeters).toBe(16000);
  });
});

it("keeps lifetime distances in a separate unopened disclosure", () => {
  show("&sport=run");
  const header = screen.getByRole("heading", {name: "연간 기록"});
  const running = screen.getByText("전체 기간 러닝 개인기록과 배지");
  expect(header.compareDocumentPosition(running) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(running.closest("details")).not.toHaveAttribute("open");
  expect(screen.getByText("전체 기간 거리 기록").closest("details")).not.toHaveAttribute("open");
  expect(screen.queryByTestId("lifetime-scope")).not.toBeInTheDocument();
});

it("renders English sport activity counts from the recap namespace without leaking a translation key", async () => {
  i18n.addResourceBundle("en", "recap", enRecap);
  i18n.addResourceBundle("en", "common", enCommon);
  await i18n.changeLanguage("en");
  try {
    show();
    expect(screen.getAllByText(/1 activity ·/)).toHaveLength(3);
    expect(document.body.textContent).not.toContain("activityCount");
  } finally { await i18n.changeLanguage("ko"); }
});

it("shows a retryable read error instead of an empty year or share actions", () => {
  mocks.error = true;
  show();
  expect(screen.getByRole("alert")).toHaveTextContent("연간 기록을 불러오지 못했습니다");
  expect(screen.queryByTestId("P2.emptyYear")).not.toBeInTheDocument();
  expect(screen.queryByTestId("P2-4-2")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(mocks.retry).toHaveBeenCalledOnce();
});

it("selects another calendar year through the dropdown without changing the sport", () => {
  show("&sport=run");
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "2024" }));
  expect(screen.getByText("2024년 나의 활동")).toBeInTheDocument();
  expect(within(screen.getByTestId("P2-0-1")).getByRole("tab", { name: /러닝/ })).toHaveAttribute("aria-selected", "true");
});

it("loads lifetime distances only on explicit disclosure opening and reuses them after changing year", async () => {
  show("&sport=run");
  expect(mocks.lifetimeRead).not.toHaveBeenCalled();
  const details = screen.getByText("전체 기간 거리 기록").closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  await waitFor(() => expect(screen.getByTestId("lifetime-scope")).toHaveTextContent("러닝·걷기·하이킹"));
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "2024" }));
  expect(mocks.lifetimeRead).toHaveBeenCalledTimes(1);
});

it("shows retry instead of lifetime achievements when the manual read is incomplete", async () => {
  mocks.lifetimeRead.mockRejectedValueOnce(new Error("year-read-budget-exceeded"));
  show();
  const details = screen.getByText("전체 기간 거리 기록").closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  await waitFor(() => expect(within(details).getByRole("alert")).toBeInTheDocument());
  expect(screen.queryByTestId("lifetime-scope")).not.toBeInTheDocument();
  fireEvent.click(within(details).getByRole("button", { name: "다시 시도" }));
  await waitFor(() => expect(screen.getByTestId("lifetime-scope")).toBeInTheDocument());
});
