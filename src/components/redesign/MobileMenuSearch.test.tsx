import { Suspense, useState } from "react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import koCommon from "../../i18n/resources/ko/common.json";
import enCommon from "../../i18n/resources/en/common.json";
import TopNav from "./TopNav";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, useLocation } from "react-router-dom";
import type { User } from "firebase/auth";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import MobileMenuSearch from "./MobileMenuSearch";
import { AuthContextProvider, useAuth } from "../../contexts/AuthContext";
import { readDashboardPreferences, updateDashboardPreferences, useDashboardPreferences } from "../../hooks/useDashboardPreferences";
vi.mock("../../hooks/useGlobalSearch", () => ({ useGlobalSearch: () => ({ results: { activities: [], courses: [] } }) }));
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }
function MountedHomePreferences() {
  const { user, loading } = useAuth();
  const { preferences } = useDashboardPreferences(user?.uid ?? null, loading);
  return <><div data-testid="home-preferences">{JSON.stringify(preferences)}</div><Link to="/ko/">홈으로</Link></>;
}
function ClosingMenuJourney() {
  const [open, setOpen] = useState(true);
  const { user } = useAuth();
  return <>{open ? <MobileMenuSearch key={user?.uid ?? "guest"} onNavigate={() => setOpen(false)} /> : <button onClick={() => setOpen(true)}>메뉴 다시 열기</button>}<MountedHomePreferences /><Location /></>;
}

it.each([
  ["activities", "/ko/?q=test&scope=all&date=all&sport=all"], ["clubs", "/ko/clubs?q=test"], ["courses", "/ko/explore/courses?q=test"],
  ["segments", "/ko/explore/segments?q=test"], ["posts", "/ko/community/board?q=test"], ["athletes", "/ko/explore/athletes?q=test"],
])("submits %s to its real localized search destination", async (category, path) => {
  const onNavigate = vi.fn();
  renderWithProviders(<><MobileMenuSearch onNavigate={onNavigate} /><Location /></>, { route: "/ko" });
  await userEvent.selectOptions(screen.getByLabelText("검색 대상"), category);
  await userEvent.type(screen.getByLabelText("검색어"), "test");
  await userEvent.click(screen.getByRole("button", { name: "검색하기" }));
  expect(onNavigate).toHaveBeenCalledOnce();
  expect(screen.getByRole("status").textContent).toBe(path);
});

it.each([
  ["activities", [["활동 범위", "friends"], ["기간", "30d"], ["종목", "run"]], "/ko/?scope=friends&date=30d&sport=run"],
  ["clubs", [["종목", "run"]], "/ko/clubs?sport=run"],
  ["courses", [["노면", "gravel"], ["난이도", "3"], ["코스 범위", "1"]], "/ko/explore/courses?surface=gravel&difficulty=3&mine=1"],
  ["segments", [["종목", "run"], ["구간 유형", "flat"]], "/ko/explore/segments?sport=run&cat=flat"],
  ["posts", [["게시판", "archive"]], "/ko/community/board?type=archive"],
] as const)("applies %s category filters without requiring a keyword", async (category, controls, destination) => {
  renderWithProviders(<><MobileMenuSearch onNavigate={vi.fn()} /><Location /></>, { route: "/ko", authenticated: true });
  await userEvent.selectOptions(screen.getByLabelText("검색 대상"), category);
  for (const [label, value] of controls) await userEvent.selectOptions(screen.getByLabelText(label), value);
  expect(screen.getByRole("button", { name: "검색하기" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "검색하기" }));
  expect(screen.getByRole("status")).toHaveTextContent(destination);
});

it("keeps category drafts independent and restores unsent drafts on reopen", async () => {
  const view = renderWithProviders(<MobileMenuSearch onNavigate={vi.fn()} />, { route: "/ko" });
  await userEvent.type(screen.getByLabelText("검색어"), "ride");
  await userEvent.selectOptions(screen.getByLabelText("종목"), "bike");
  await userEvent.selectOptions(screen.getByLabelText("검색 대상"), "clubs");
  expect(screen.getByLabelText("검색어")).toHaveValue("");
  expect(screen.getByLabelText("종목")).toHaveValue("ALL");
  await userEvent.type(screen.getByLabelText("검색어"), "club");
  await userEvent.type(screen.getByLabelText("공개 클럽 도시 (정확히 일치)"), "서울");
  await userEvent.selectOptions(screen.getByLabelText("검색 대상"), "activities");
  expect(screen.getByLabelText("검색어")).toHaveValue("ride");
  expect(screen.getByLabelText("종목")).toHaveValue("bike");
  view.unmount();
  renderWithProviders(<MobileMenuSearch onNavigate={vi.fn()} />, { route: "/ko" });
  expect(screen.getByLabelText("검색어")).toHaveValue("ride");
  await userEvent.selectOptions(screen.getByLabelText("검색 대상"), "clubs");
  expect(screen.getByLabelText("검색어")).toHaveValue("club");
  expect(screen.getByLabelText("공개 클럽 도시 (정확히 일치)")).toHaveValue("서울");
});

it("restores applied activity filters and clears both query and filters explicitly", async () => {
  renderWithProviders(<><MobileMenuSearch onNavigate={vi.fn()} /><Location /></>, { route: "/ko/?q=ride&scope=self&sport=bike&date=7d" });
  expect(screen.getByLabelText("검색어")).toHaveValue("ride");
  expect(screen.getByLabelText("활동 범위")).toHaveValue("self");
  expect(screen.getByLabelText("기간")).toHaveValue("7d");
  await userEvent.click(screen.getByRole("button", { name: "검색 조건 초기화" }));
  expect(screen.getByRole("status")).toHaveTextContent("/ko/?scope=all&date=all&sport=all");
  expect(screen.getByLabelText("검색어")).toHaveValue("");
  expect(screen.getByLabelText("종목")).toHaveValue("all");
});

it("restores the people query from the explore page and offers the shared search hint", async () => {
  renderWithProviders(<MobileMenuSearch onNavigate={vi.fn()} />, { route: "/ko/explore/athletes?q=moon" });
  expect(screen.getByLabelText("검색 대상")).toHaveValue("athletes");
  expect(screen.getByRole("option", { name: "사람" })).toBeInTheDocument();
  expect(screen.getByLabelText("검색어")).toHaveValue("moon");
  expect(screen.getByText("이메일, 닉네임, 친구 코드로 찾을 수 있어요")).toBeInTheDocument();
});

it("uses the board's existing names for post search destinations", async () => {
  renderWithProviders(<MobileMenuSearch onNavigate={vi.fn()} />);
  await userEvent.selectOptions(screen.getByLabelText("검색 대상"), "posts");
  expect(screen.getByRole("option", { name: "문의/신고" })).toHaveValue("inquiry");
  expect(screen.getByRole("option", { name: "작업일지" })).toHaveValue("devlog");
  expect(screen.getByRole("option", { name: "이맘쯤 우리는" })).toHaveValue("archive");
});

it.each(["ko", "en"] as const)("keeps the first mobile menu open with a cold board namespace (%s)", async language => {
  const cold = createInstance();
  const read = vi.fn();
  cold.use({ type: "backend", read });
  await cold.init({
    lng: language, fallbackLng: false, ns: ["common"], defaultNS: "common",
    resources: { ko: { common: koCommon }, en: { common: enCommon } },
    partialBundledLanguages: true, react: { useSuspense: true },
  });
  const original = window.matchMedia;
  window.matchMedia = vi.fn(query => ({ ...original(query), matches: false }));
  try {
    renderWithProviders(<I18nextProvider i18n={cold}><Suspense fallback={<p>namespace loading</p>}>
      <TopNav active="home" />
    </Suspense></I18nextProvider>, { route: `/${language}` });
    const trigger = screen.getByRole("button", { name: cold.t("button.more") });
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("search", { name: cold.t("topnav.menuSearch.label") })).toBeVisible();
    expect(screen.queryByText("namespace loading")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(cold.t("topnav.menuSearch.category")), "posts");
    const names = language === "ko" ? ["문의/신고", "작업일지", "이맘쯤 우리는"] : ["Inquiry/Report", "Devlog", "Archive"];
    for (const name of names) expect(screen.getByRole("option", { name })).toBeInTheDocument();
    expect(cold.hasResourceBundle(language, "board")).toBe(false);
    expect(read).not.toHaveBeenCalled();
  } finally { window.matchMedia = original; }
});

it("hides swimming search options and normalizes a saved swimming draft without changing other sports", async () => {
  renderWithProviders(<MobileMenuSearch onNavigate={vi.fn()} />, { route: "/ko?sport=swim" });
  expect(screen.getByLabelText("종목")).toHaveValue("all");
  expect(screen.queryByRole("option", { name: "수영" })).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: "사이클" })).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("검색 대상"), "clubs");
  expect(screen.queryByRole("option", { name: "수영" })).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: "트라이애슬론" })).toBeInTheDocument();
});

it("retains the current calendar year when submitting the shared activity date filter", async () => {
  renderWithProviders(<><MobileMenuSearch onNavigate={vi.fn()} /><Location /></>, { route: "/ko?date=year" });
  expect(screen.getByLabelText("기간")).toHaveValue("year");
  expect(screen.getByRole("option", { name: "올해" })).toHaveValue("year");
  await userEvent.click(screen.getByRole("button", { name: "검색하기" }));
  expect(screen.getByRole("status").textContent).toBe("/ko/?scope=all&date=year&sport=all");
});

it("persists applied filters and reset for mounted home, bare-home navigation and reload", async () => {
  updateDashboardPreferences("test-uid", { feedScope: "self", sportFilter: "bike", datePreset: "7d", workoutNarrativeExpanded: false });
  const fixture = <ClosingMenuJourney />;
  const view = renderWithProviders(fixture, { route: "/ko/", authenticated: true });
  await userEvent.selectOptions(screen.getByLabelText("활동 범위"), "friends");
  await userEvent.selectOptions(screen.getByLabelText("종목"), "run");
  await userEvent.selectOptions(screen.getByLabelText("기간"), "30d");
  await userEvent.click(screen.getByRole("button", { name: "검색하기" }));
  expect(readDashboardPreferences("test-uid")).toEqual({ feedScope: "friends", sportFilter: "run", datePreset: "30d", workoutNarrativeExpanded: false });
  expect(screen.getByTestId("home-preferences")).toHaveTextContent('"feedScope":"friends"');
  await userEvent.click(screen.getByRole("button", { name: "메뉴 다시 열기" }));
  await userEvent.click(screen.getByRole("button", { name: "검색 조건 초기화" }));
  await userEvent.click(screen.getByRole("link", { name: "홈으로" }));
  await userEvent.click(screen.getByRole("button", { name: "메뉴 다시 열기" }));
  expect(screen.getByRole("status")).toHaveTextContent("/ko/");
  expect(screen.getByTestId("home-preferences")).toHaveTextContent('"feedScope":"all"');
  expect(readDashboardPreferences("test-uid")).toEqual({ feedScope: "all", sportFilter: "all", datePreset: "all", workoutNarrativeExpanded: false });
  view.unmount();
  renderWithProviders(fixture, { route: "/ko/", authenticated: true });
  expect(screen.getByLabelText("활동 범위")).toHaveValue("all");
  expect(screen.getByLabelText("종목")).toHaveValue("all");
  expect(screen.getByLabelText("기간")).toHaveValue("all");
  expect(screen.getByTestId("home-preferences")).toHaveTextContent('"feedScope":"all"');
});

it("keeps home preferences unchanged when applying or resetting another search category", async () => {
  updateDashboardPreferences("test-uid", { feedScope: "self", sportFilter: "bike", datePreset: "7d" });
  const saved = readDashboardPreferences("test-uid");
  renderWithProviders(<MobileMenuSearch onNavigate={vi.fn()} />, { route: "/ko/", authenticated: true });
  await userEvent.selectOptions(screen.getByLabelText("검색 대상"), "clubs");
  await userEvent.selectOptions(screen.getByLabelText("종목"), "run");
  await userEvent.click(screen.getByRole("button", { name: "검색하기" }));
  await userEvent.click(screen.getByRole("button", { name: "검색 조건 초기화" }));
  expect(readDashboardPreferences("test-uid")).toEqual(saved);
});

it("reopens reset drafts after the menu closes immediately from bare home", async () => {
  updateDashboardPreferences("test-uid", { feedScope: "self", sportFilter: "bike", datePreset: "7d" });
  renderWithProviders(<ClosingMenuJourney />, { route: "/ko/", authenticated: true });
  expect(screen.getByLabelText("활동 범위")).toHaveValue("self");
  await userEvent.click(screen.getByRole("button", { name: "검색 조건 초기화" }));
  await userEvent.click(screen.getByRole("link", { name: "홈으로" }));
  await userEvent.click(screen.getByRole("button", { name: "메뉴 다시 열기" }));
  expect(screen.getByLabelText("활동 범위")).toHaveValue("all");
  expect(screen.getByLabelText("종목")).toHaveValue("all");
  expect(screen.getByLabelText("기간")).toHaveValue("all");
});

it.each([false, true])("does not persist activity filters for guest or anonymous sessions (%s)", async anonymous => {
  const menu = <MobileMenuSearch onNavigate={vi.fn()} />;
  renderWithProviders(anonymous ? <AuthContextProvider value={{
    user: { uid: "anonymous", isAnonymous: true } as User,
    profile: null, profileLoading: false, loading: false, signIn: vi.fn(), logout: vi.fn(),
  }}>{menu}</AuthContextProvider> : menu, { route: "/ko/" });
  await userEvent.selectOptions(screen.getByLabelText("종목"), "run");
  await userEvent.click(screen.getByRole("button", { name: "검색하기" }));
  await userEvent.click(screen.getByRole("button", { name: "검색 조건 초기화" }));
  expect(Object.keys(localStorage).filter(key => key.startsWith("orider.dashboardPreferences.v1."))).toEqual([]);
});
