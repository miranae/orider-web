import { Suspense } from "react";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import koCommon from "../../i18n/resources/ko/common.json";
import enCommon from "../../i18n/resources/en/common.json";
import TopNav from "./TopNav";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { searchPublicUserProfilesPage } from "../../services/publicProfiles";
import MobileMenuSearch from "./MobileMenuSearch";
vi.mock("../../hooks/useGlobalSearch", () => ({ useGlobalSearch: () => ({ results: { activities: [], courses: [] } }) }));
vi.mock("../../services/publicProfiles", () => ({ searchPublicUserProfilesPage: vi.fn() }));
beforeEach(() => { sessionStorage.clear(); vi.mocked(searchPublicUserProfilesPage).mockReset(); });
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }

it.each([
  ["activities", "/ko/?q=test&scope=all&date=all&sport=all"], ["clubs", "/ko/clubs?q=test"], ["courses", "/ko/explore/courses?q=test"],
  ["segments", "/ko/explore/segments?q=test"], ["posts", "/ko/community/board?q=test"],
])("submits %s to its real localized search destination", async (category, path) => {
  const onNavigate = vi.fn();
  renderWithProviders(<><MobileMenuSearch onNavigate={onNavigate} /><Location /></>, { route: "/ko" });
  await userEvent.selectOptions(screen.getByLabelText("검색 대상"), category);
  await userEvent.type(screen.getByLabelText("검색어"), "test");
  await userEvent.click(screen.getByRole("button", { name: "검색하기" }));
  expect(onNavigate).toHaveBeenCalledOnce();
  expect(screen.getByRole("status").textContent).toBe(path);
});

it("searches real public athlete profiles and paginates before profile navigation", async () => {
  const cursor = { id: "cursor" };
  vi.mocked(searchPublicUserProfilesPage).mockResolvedValueOnce({ items: [{ id: "a", nickname: "moon", photoURL: "https://example.com/missing.png" }], cursor, hasMore: true } as never)
    .mockResolvedValueOnce({ items: [{ id: "b", nickname: "moon2", photoURL: null }], cursor: null, hasMore: false });
  const onNavigate = vi.fn();
  renderWithProviders(<MobileMenuSearch onNavigate={onNavigate} />);
  await userEvent.selectOptions(screen.getByLabelText("검색 대상"), "athletes");
  await userEvent.type(screen.getByLabelText("검색어"), "moon");
  await userEvent.click(screen.getByRole("button", { name: "검색하기" }));
  expect(await screen.findByRole("link", { name: "moon" })).toHaveAttribute("href", "/ko/athlete/a");
  fireEvent.error(screen.getByAltText(""));
  expect(screen.queryByAltText("")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "moon" })).toHaveTextContent("m");
  expect(onNavigate).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "더 보기" }));
  await waitFor(() => expect(searchPublicUserProfilesPage).toHaveBeenLastCalledWith("moon", cursor));
  await userEvent.click(await screen.findByRole("link", { name: "moon2" }));
  expect(onNavigate).toHaveBeenCalledOnce();
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

it("exposes username exact matching and waits for submit before searching", async () => {
  vi.mocked(searchPublicUserProfilesPage).mockResolvedValue({ items: [], cursor: null, hasMore: false });
  renderWithProviders(<MobileMenuSearch onNavigate={vi.fn()} />);
  await userEvent.selectOptions(screen.getByLabelText("검색 대상"), "athletes");
  expect(screen.getByRole("option", { name: "사용자명" })).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText("사용자명 일치 방식"), "exact");
  await userEvent.type(screen.getByLabelText("검색어"), "moon");
  expect(searchPublicUserProfilesPage).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "검색하기" }));
  await waitFor(() => expect(searchPublicUserProfilesPage).toHaveBeenCalledWith("moon", null, undefined, "exact"));
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
