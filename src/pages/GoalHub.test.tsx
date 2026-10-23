import i18n from "i18next";
import enTraining from "../i18n/resources/en/training.json";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setDocData } from "../__tests__/mocks/firebase";
import GoalHub from "./GoalHub";
const state = vi.hoisted(() => ({ goal: null as null | Record<string, unknown>, sport: "bike", loading: false, loadError: null as Error | null, freshLoaded: true, user: { uid: "owner" } as { uid: string; isAnonymous?: boolean } | null }));
vi.mock("../hooks/usePlanModel", () => ({ usePlanModel: () => ({ user: state.user, goal: state.goal, discipline: state.sport, loading: state.loading, loadError: state.loadError, freshLoaded: state.freshLoaded, goalMatchesDiscipline: true, progress: 12, weeks: [], daysLeft: 30, goalDate: new Date("2026-12-01"), retryLoad: vi.fn() }) }));
vi.mock("./ClimbGoalSetupPage", () => ({ default: () => <div>climb form</div> }));
beforeEach(() => { window.matchMedia = vi.fn().mockImplementation(query => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })); state.loading = false; state.loadError = null; state.freshLoaded = true; state.goal = null; state.sport = "bike"; state.user = { uid: "owner" }; });
describe("goal hub", () => {
  it("shows the existing goal before type selection and opens the wizard only after choosing", () => {
    state.goal = { id: "g", title: "Winter course", courseName: "Course", eventType: "completion" };
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />, { route: "/ko/coach/goals?sport=bike" });
    expect(screen.getByTestId("K3-1-1")).toHaveTextContent("Winter course");
    expect(screen.getByTestId("K3-1-2")).toHaveTextContent("목표기간 훈련 부하");
    expect(screen.getByTestId("K3-1-2")).toHaveTextContent("목표기간을 확인할 수 없어");
    expect(screen.queryByRole("progressbar", { name: "목표 진행률" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "목표 포기" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "계획 보기 →" })).toHaveAttribute("href", "/ko/coach/plan?sport=bike");
    expect(screen.queryByText("event wizard")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "대회·코스 완주" }));
    expect(screen.getByText("event wizard")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Winter course");
  });
  it("shows server goal-day projection only when its goal identity matches", async () => {
    state.goal = { id: "g", title: "Projection goal", eventType: "completion" };
    setDocData("users/owner/fitness/projection_bike", { goalId: "g", discipline: "bike", goalDay: { ctl: 42, tsb: 5 } });
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />);
    expect(await screen.findByText(/목표일 예상/)).toHaveTextContent("목표일 예상 · CTL 42.0 · TSB 5.0");
  });
  it("offers run race and program routes without a bike wizard", () => {
    state.sport = "run";
    renderWithProviders(<GoalHub wizard={<div>run wizard</div>} />, { route: "/ko/coach/goals?sport=run&new=1" });
    expect(screen.getByRole("button", { name: "러닝 대회" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "30분 달리기 프로그램" })).toHaveAttribute("href", "/ko/coach/plan?sport=run");
    expect(screen.queryByRole("button", { name: "대회·코스 완주" })).not.toBeInTheDocument();
  });
  it("offers one current-program plan link and hides swimming without changing saved goals", () => {
    state.sport = "run";
    state.goal = { id: "run", title: "30분 달리기", runProgram: { week: 1 } };
    renderWithProviders(<GoalHub wizard={<div>run wizard</div>} />);
    expect(screen.getAllByRole("link", { name: "계획 보기 →" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "30분 달리기 프로그램" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /수영/ })).not.toBeInTheDocument();
    expect(state.goal.runProgram).toEqual({ week: 1 });
  });
  it("requires sign-in for anonymous identities before type selection", () => {
    state.user = { uid: "anonymous", isAnonymous: true };
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />);
    expect(screen.getByTestId("K3-2-5")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "대회·코스 완주" })).not.toBeInTheDocument();
  });
  it("keeps guests out of the type picker and wizard", () => {
    state.user = null;
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />);
    expect(screen.getByTestId("K3-2-5")).toBeInTheDocument();
    expect(screen.queryByTestId("K3-2")).not.toBeInTheDocument();
  });
});


it.each(['ko', 'en'])('uses the active %s UI locale for the saved target date', async locale => {
  const previous = i18n.language;
  i18n.addResourceBundle('en', 'training', enTraining, true, true);
  const expectedDate = new Date('2026-12-01').toLocaleDateString(locale, { timeZone: 'Asia/Seoul' });
  const format = vi.spyOn(Date.prototype, 'toLocaleDateString');
  try {
    await i18n.changeLanguage(locale);
    state.goal = { id: 'localized-date', title: 'Locale goal', eventType: 'completion', eventDate: Date.parse('2026-12-01') };
    renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />, { route: `/${locale}/coach/goals?sport=bike` });
    expect(screen.getByTestId('K3-1-1')).toHaveTextContent(expectedDate);
    expect(format).toHaveBeenCalledWith(locale, { timeZone: 'Asia/Seoul' });
  } finally { format.mockRestore(); await i18n.changeLanguage(previous); }
});

it("shows elapsed goal days without changing a saved goal", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-22T12:00:00+09:00"));
  try {
    state.goal = { id: "past", title: "Saved goal", eventDate: Date.parse("2026-10-18T00:00:00+09:00") };
    renderWithProviders(<GoalHub wizard={<div />} />);
    expect(screen.getByTestId("K3-1-1")).toHaveTextContent("D+4");
    expect(state.goal.title).toBe("Saved goal");
  } finally { vi.useRealTimers(); }
});

it("separates a generated mobile goal name and metadata while retaining the original", () => {
  const media = vi.spyOn(window, "matchMedia").mockImplementation(query => ({
    matches: query.includes("max-width"), media: query, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  }));
  const raw = "2026_비앙키그란폰도춘천_그란폰도_122.91km";
  try {
    state.goal = { id: "readable", title: raw };
    renderWithProviders(<GoalHub wizard={<div />} />);
    expect(screen.getByRole("heading", { name: "비앙키그란폰도춘천" })).toBeVisible();
    expect(screen.getByText("2026 · 그란폰도 · 122.91 km")).toBeVisible();
    fireEvent.click(screen.getByText("목표 이름 원문"));
    expect(screen.getByText(raw)).toBeVisible();
    expect(state.goal.title).toBe(raw);
  } finally { media.mockRestore(); }
});


it.each(["loading", "stale", "error"])("does not offer goal replacement before the existing state is confirmed: %s", phase => {
  state.loading = phase === "loading";
  state.freshLoaded = phase !== "stale";
  state.loadError = phase === "error" ? new Error("read failed") : null;
  renderWithProviders(<GoalHub wizard={<div>event wizard</div>} />, { route: "/ko/coach/goals?sport=bike" });
  expect(screen.getByRole("button", { name: "대회·코스 완주" })).toBeDisabled();
  expect(screen.getByTestId("K3-2-2")).toBeDisabled();
  expect(screen.queryByText("event wizard")).not.toBeInTheDocument();
  if (phase === "error") expect(screen.getByRole("alert")).toHaveTextContent("기존 목표");
  else expect(screen.getByRole("status")).toBeInTheDocument();
});
