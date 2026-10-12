import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import type { CyclingDistanceHistoryRequest } from "@shared/types/training-cycling-distance-history";
import { coveredFixture } from "../../../services/stageCyclingDistanceCoveredRankings.fixture";
import ko from "../../../i18n/resources/ko/activity.json";
import en from "../../../i18n/resources/en/activity.json";
import Panel from "./CyclingDistanceCoveredRankingsPanel";
const mocks = vi.hoisted(() => ({ hook: vi.fn(), confirm: vi.fn(), cancel: vi.fn(), locale: "ko" }));
vi.mock("../../../hooks/useStageCyclingDistanceCoveredRankings", () => ({ useStageCyclingDistanceCoveredRankings: mocks.hook }));
vi.mock("../../../contexts/LocaleContext", () => ({ useLocale: () => ({ locale: mocks.locale }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: mocks.locale }, t: (key: string, params?: Record<string, unknown>) => { let value: unknown = mocks.locale === "ko" ? ko : en; for (const part of key.split(".")) value = (value as Record<string, unknown>)?.[part]; return typeof value === "string" ? value.replace(/{{(\w+)}}/g, (_, name: string) => String(params?.[name] ?? "")) : key; } }) }));
const activity = { id: "native", userId: "owner", type: "Ride" } as Activity;
const selection: CyclingDistanceHistoryRequest = { mode: "cycling_distance_history_page", discipline: "bike", calendarBasis: "Asia/Seoul", rangeBasis: "calendar_year", year: 2026 };
const idle = () => ({ available: true, status: "idle", response: null, confirm: mocks.confirm, cancel: mocks.cancel });
function open() { const details = document.querySelector("details")!; details.open = true; fireEvent(details, new Event("toggle")); }
beforeEach(() => { mocks.locale = "ko"; mocks.confirm.mockReset(); mocks.cancel.mockReset(); mocks.hook.mockReset().mockReturnValue(idle()); });
it("mount/open/year/custom/lifetime edits cause zero requests, only manual buttons confirm", () => {
  render(<Panel activity={activity} selection={selection} headIdentity="a" />); expect(mocks.hook).not.toHaveBeenCalled(); open();
  fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2025" } });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "custom" } });
  fireEvent.change(screen.getByLabelText(ko.cyclingCoveredRankings.from), { target: { value: "2025-01-01" } });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "lifetime" } }); expect(mocks.confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "10개 확인" })); fireEvent.click(screen.getByRole("button", { name: "20개 확인" })); expect(mocks.confirm.mock.calls.map(call => call[0])).toEqual([10, 20]);
});
it.each(["ko", "en"])("covered-only results use local target/top switches and exact activity links in %s", locale => {
  mocks.locale = locale; mocks.hook.mockReturnValue({ ...idle(), status: "ready", response: coveredFixture() });
  render(<Panel activity={activity} selection={selection} headIdentity="a" />); open();
  const copy = locale === "ko" ? ko : en;
  expect(screen.getByText(copy.cyclingCoveredRankings.scope)).toBeInTheDocument(); expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", `/${locale}/activity/native`);
  fireEvent.change(screen.getByRole("combobox", { name: copy.manualBikeEvidence.distance }), { target: { value: "20km" } });
  fireEvent.change(screen.getByRole("combobox", { name: copy.cyclingCoveredRankings.top }), { target: { value: "10" } });
  expect(mocks.confirm).not.toHaveBeenCalled(); expect(document.querySelector("path[data-observation-count]")).toHaveAttribute("data-observation-count", "2");
});
it("invalidation renders only manual recheck, never stale links or automatic call", () => {
  mocks.hook.mockReturnValue({ ...idle(), status: "invalidated" }); render(<Panel activity={activity} selection={selection} headIdentity="a" />); open();
  expect(screen.queryByRole("link")).not.toBeInTheDocument(); expect(mocks.confirm).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: ko.cyclingCoveredRankings.recheck })); expect(mocks.confirm).toHaveBeenCalledWith(10);
});
it("cancel is an explicit loading action", () => {
  mocks.hook.mockReturnValue({ ...idle(), status: "loading" }); render(<Panel activity={activity} selection={selection} headIdentity="a" />); open();
  fireEvent.click(screen.getByRole("button", { name: ko.cyclingCoveredRankings.cancel })); expect(mocks.cancel).toHaveBeenCalledOnce(); expect(mocks.confirm).not.toHaveBeenCalled();
});

it("plots faster elapsed seconds above slower observations on chronological X", () => {
  mocks.hook.mockReturnValue({ ...idle(), status: "ready", response: coveredFixture() });
  render(<Panel activity={activity} selection={selection} headIdentity="a" />); open();
  const chart = screen.getByRole("img");
  const points = [...chart.querySelector("path")!.getAttribute("d")!.matchAll(/M([\d.]+),([\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])]);
  expect(points).toEqual([[65, 25], [385, 135]]); expect(points[0]![1]).toBeLessThan(points[1]![1]!);
  expect(chart).toHaveAttribute("data-y-axis", "elapsedSec"); expect(chart).toHaveAccessibleDescription(/100.*200 s/);
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it.each(["excluded", "unavailable"])("never charts %s efforts or invents a slope for one point", state => {
  const response = coveredFixture("10km");
  if (state === "unavailable") for (const row of response.rows.filter(row => row.activityId !== "other")) {
    const e = row.efforts.find(e => e.target === "10km")!;
    e.originalElapsedSec = null; e.effectiveElapsedSec = null; e.basis = "unavailable"; e.effortSourceActivityId = null; e.excluded = false;
  }
  if (state === "unavailable") response.coverage.excludedByTarget["10km"] = 0;
  mocks.hook.mockReturnValue({ ...idle(), status: "ready", response });
  render(<Panel activity={activity} selection={selection} headIdentity="a" />); open();
  const path = document.querySelector("path[data-observation-count]")!;
  expect(path).toHaveAttribute("data-observation-count", "1"); expect(path.getAttribute("d")).toMatch(/^M225,80m/);
  expect(mocks.confirm).not.toHaveBeenCalled();
});

it.each(["ko", "en"])("uses design-system year/date fields and folds read costs without requests in %s", locale => {
  mocks.locale = locale;
  render(<Panel activity={activity} selection={selection} headIdentity="a" />); open();
  const copy = locale === "ko" ? ko : en;
  const year = screen.getByRole("spinbutton", { name: copy.cyclingCoveredRankings.year });
  expect(year).toHaveClass("ds-input"); expect(year.closest("label")).toHaveClass("block", "space-y-2");
  fireEvent.change(screen.getByRole("combobox", { name: copy.cyclingCoveredRankings.range }), { target: { value: "custom" } });
  for (const name of [copy.cyclingCoveredRankings.from, copy.cyclingCoveredRankings.to]) {
    const input = screen.getByLabelText(name);
    expect(input).toHaveClass("ds-input"); expect(input).toHaveAttribute("type", "date"); expect(input.closest("label")).toHaveClass("block", "space-y-2");
  }
  const summary = screen.getByText(copy.cyclingCoveredRankings.costDetails).closest("summary")!;
  const details = summary.closest("details")!;
  expect(details.open).toBe(false); expect(summary.className).toContain("var(--dim-button-height)");
  expect(screen.getByText(copy.cyclingCoveredRankings.cost)).not.toBeVisible();
  details.open = true; fireEvent(details, new Event("toggle"));
  expect(screen.getByText(copy.cyclingCoveredRankings.cost)).toBeVisible();
  expect(mocks.confirm).not.toHaveBeenCalled(); expect(mocks.cancel).not.toHaveBeenCalled();
});
it.each(["ko", "en"])("keeps technical timestamps and receipts folded while describing checked records plainly in %s", locale => {
  mocks.locale = locale; mocks.hook.mockReturnValue({ ...idle(), status: "ready", response: coveredFixture() });
  const { container } = render(<Panel activity={activity} selection={selection} headIdentity="a" />); open();
  const copy = locale === "ko" ? ko : en;
  expect(screen.getByText(copy.cyclingCoveredRankings.title)).not.toHaveTextContent("Stage");
  const details = screen.getByText(copy.cyclingCoveredRankings.costDetails).closest("details")!;
  const technicalStamp = screen.getByText(/^Source .*Stage /);
  expect(technicalStamp.closest("details")).toBe(details); expect(technicalStamp).not.toBeVisible();
  for (const row of container.querySelectorAll("p, a")) if (row.closest("details") !== details) expect(row.textContent).not.toMatch(/Source|Stage|snapshot|owner|metadata/);
  details.open = true; fireEvent(details, new Event("toggle")); expect(technicalStamp).toBeVisible();
  expect(mocks.confirm).not.toHaveBeenCalled();
});
