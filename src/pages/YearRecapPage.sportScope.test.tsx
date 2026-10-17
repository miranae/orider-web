import i18n from "i18next";
import enRecap from "../i18n/resources/en/recap.json";
import enCommon from "../i18n/resources/en/common.json";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { createMockActivity, createMockSummary } from "../__tests__/fixtures/mockData";
const mocks = vi.hoisted(() => ({ activities: [] as import("@shared/types").Activity[], draw: vi.fn((_recap: unknown, _labels: unknown, _ratio: unknown) => ({})), save: vi.fn() }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "owner" }, profile: { nickname: "Owner" } }) }));
vi.mock("../hooks/useYearActivities", () => ({ useYearActivities: () => ({ activities: mocks.activities, loading: false }) }));
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
  fireEvent.click(screen.getByRole("button", { name: /정사각/ }));
  await waitFor(() => expect(mocks.draw).toHaveBeenCalled());
  return mocks.draw.mock.calls[0]![0] as unknown as { totalDistanceMeters: number; totalCount: number; breakdown: Array<{ discipline: string }> };
}
describe("annual recap sport scope", () => {
  it.each(["", "&sport=tri"])("includes running and swimming in default/all totals and sharing %s", async query => {
    show(query);
    expect(screen.getByText("2025년 나의 활동")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /통합/ })).toHaveAttribute("aria-selected", "true");
    const recap = await sharedRecap();
    expect(recap.totalDistanceMeters).toBe(16000);
    expect(recap.totalCount).toBe(3);
  });
  it("filters to running and returns to all through the visible tab", async () => {
    show("&sport=run");
    expect((await sharedRecap()).totalDistanceMeters).toBe(5000);
    fireEvent.click(screen.getByRole("tab", { name: /통합/ }));
    mocks.draw.mockClear();
    expect((await sharedRecap()).totalDistanceMeters).toBe(16000);
  });
});

it("places annual context before expandable lifetime running records and labels lifetime distance scope", () => {
  show("&sport=run");
  const header = screen.getByRole("heading", {name: "연간 기록"});
  const running = screen.getByText("전체 기간 러닝 개인기록과 배지");
  expect(header.compareDocumentPosition(running) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(running.closest("details")).not.toHaveAttribute("open");
  const lifetime = screen.getByText("전체 기간 거리 기록");
  expect(lifetime.closest("details")).not.toHaveAttribute("open");
  fireEvent.click(lifetime);
  expect(screen.getByTestId("lifetime-scope")).toHaveTextContent("러닝·걷기·하이킹");
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
