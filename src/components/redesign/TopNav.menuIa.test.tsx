import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { simulateLogin } from "../../__tests__/mocks/firebase";
import TopNav from "./TopNav";
import MobileTabBar from "../mobile/MobileTabBar";

let originalMatchMedia: typeof window.matchMedia;
function headerViewport(desktop: boolean) {
  const implementation = vi.mocked(window.matchMedia).getMockImplementation()!;
  window.matchMedia = vi.fn(query => {
    const media = implementation(query);
    return query === "(min-width: 1024px)" ? { ...media, matches: desktop } : media;
  });
}
beforeEach(() => { originalMatchMedia = window.matchMedia; headerViewport(true); });
afterEach(() => { window.matchMedia = originalMatchMedia; });

const accountLinks = [
  ["내 프로필", "/ko/athlete/me"],
  ["운동일지", "/ko/athlete/me/activities"],
  ["기록", "/ko/athlete/me/records"],
  ["친구", "/ko/athlete/me/friends"],
  ["장비", "/ko/athlete/me/gear"],
  ["설정", "/ko/settings/account"],
];

describe("menu IA v2", () => {
  it("shares the five ordered destinations across desktop and mobile", () => {
    const { container } = renderWithProviders(<><TopNav active="club" /><MobileTabBar active="club" /></>);
    const expected = ["홈", "코치", "클럽", "탐색", "게시판"];
    const desktop = container.querySelector(".hidden.lg\\:flex")!;
    const mobile = screen.getByRole("navigation", { name: "메인 내비게이션" });
    expect(within(desktop as HTMLElement).getAllByRole("link").map(link => link.textContent)).toEqual(expected);
    expect(within(mobile).getAllByRole("link").map(link => link.textContent)).toEqual(expected);
    // TopNav appears at lg; bottom navigation must remain available below that same breakpoint.
    expect(desktop).toHaveClass("hidden", "lg:flex");
    expect(mobile.parentElement).toHaveClass("lg:hidden");
    expect(mobile.parentElement).not.toHaveClass("md:hidden");
    expect(within(mobile).getByRole("link", { name: "클럽" })).toHaveAttribute("aria-current", "page");
  });

  it("shows account destinations and the request badge on the avatar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TopNav active="settings" friendRequestCount={3} />, { authenticated: true });
    const avatar = await screen.findByLabelText("프로필", { selector: "button" });
    expect(avatar).toHaveRole("button");
    expect(avatar).toHaveAccessibleName("프로필");
    expect(avatar).toBeVisible();
    expect(avatar).toHaveAttribute("aria-current", "page");
    expect(within(avatar).getByLabelText("받은 친구 요청 3건")).toBeInTheDocument();
    await user.click(avatar);
    const account = within(avatar.parentElement!);
    for (const [name, href] of accountLinks) {
      expect(account.getAllByRole("link", { name }).every(link => link.getAttribute("href") === href)).toBe(true);
    }
    expect(account.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  });

  it("opens the full-width mobile menu from the hamburger while retaining language and legal destinations", async () => {
    headerViewport(false);
    const user = userEvent.setup();
    renderWithProviders(<TopNav active="home" />, { authenticated: true });
    const avatar = await screen.findByRole("button", { name: "더보기" });
    await user.click(avatar);
    expect(avatar).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("link", { name: "내 프로필" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "프로필" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "오라이더 소개" })).toHaveAttribute("href", "/ko/about");
    expect(screen.getByRole("link", { name: "개발자 문서" })).toHaveAttribute("href", "/ko/explore/recipes");
    expect(screen.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/ko/terms");
    expect(screen.getByRole("radio", { name: "한국어" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "이용약관" }));
    expect(avatar).toHaveAttribute("aria-expanded", "false");
    expect(window.history.state?.oriderMobileMenu).toBeUndefined();
  });
  it("does not accumulate history entries when opening and closing the profile dropdown", async () => {
    headerViewport(false);
    const push = vi.spyOn(window.history, "pushState");
    try {
      renderWithProviders(<TopNav active="home" />, { authenticated: true });
      const profile = await screen.findByRole("button", { name: "프로필" });
      for (let index = 0; index < 3; index += 1) {
        await userEvent.click(profile);
        expect(profile).toHaveAttribute("aria-expanded", "true");
        await userEvent.click(profile);
        expect(profile).toHaveAttribute("aria-expanded", "false");
      }
      expect(push).not.toHaveBeenCalled();
    } finally { push.mockRestore(); }
  });
  it("resets the open search form when the authenticated account changes", async () => {
    headerViewport(false);
    renderWithProviders(<TopNav active="home" />, { authenticated: true });
    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "검색어" }), "private-account-draft");
    act(() => simulateLogin({ uid: "other-user", displayName: "Other" }));
    await waitFor(() => expect(screen.getByRole("searchbox", { name: "검색어" })).toHaveValue(""));
    expect(sessionStorage.getItem("orider.menuSearch.v1.other-user")).not.toContain("private-account-draft");
  });
  it("retains separate mobile notification and profile actions outside the hamburger", async () => {
    headerViewport(false);
    const onNotification = vi.fn();
    renderWithProviders(<TopNav active="home" onMobileNotifClick={onNotification} />, { authenticated: true });
    const profile = await screen.findByRole("button", { name: "프로필" });
    await userEvent.click(screen.getAllByRole("button", { name: "알림" })[0]!);
    expect(onNotification).toHaveBeenCalledOnce();
    await userEvent.click(profile);
    expect(profile).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "내 프로필" })).toBeInTheDocument();
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(profile).toHaveAttribute("aria-expanded", "false"));
    expect(profile).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "내 프로필" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "한국어" })).toBeInTheDocument();
  });
  it("retains the guest menu trigger and its language, login and legal access", async () => {
    headerViewport(false);
    renderWithProviders(<TopNav active="home" />);

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    expect(screen.getByRole("radio", { name: "한국어" })).toBeInTheDocument();
    const terms = screen.getByRole("link", { name: "이용약관" });
    const panel = terms.closest('[data-testid="X1-5"]') as HTMLElement;
    expect(within(panel).getByRole("button", { name: "기록을 저장하려면 로그인" })).toBeInTheDocument();
    await userEvent.click(terms);
    expect(screen.queryByRole("radio", { name: "한국어" })).not.toBeInTheDocument();
  });
  it("opens the shared desktop search without hiding the five header tabs", async () => {
    renderWithProviders(<TopNav active="home" />, { authenticated: true });
    await screen.findByRole("button", { name: "프로필" });
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ 만들기" })).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "더보기" });
    expect(trigger).not.toHaveClass("lg:hidden");
    await userEvent.click(trigger);
    const search = screen.getByRole("searchbox", { name: "검색어" });
    expect(search).toHaveFocus();
    expect(screen.getByLabelText("활동 범위")).toBeInTheDocument();
    const header = screen.getByTestId("X1-1");
    for (const name of ["홈", "코치", "클럽", "탐색", "게시판"]) {
      expect(within(header).getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("radio", { name: "한국어" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
    expect(trigger).toHaveFocus();
  });
  it("closes the menu when navigating from a persistent bottom tab", async () => {
    headerViewport(false);
    renderWithProviders(<><TopNav active="home" /><MobileTabBar active="home" /></>);
    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    expect(screen.getByRole("search")).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("navigation", { name: "메인 내비게이션" })).getByRole("link", { name: "클럽" }));
    await waitFor(() => expect(screen.queryByRole("search")).not.toBeInTheDocument());
    expect(window.history.state?.oriderMobileMenu).toBeUndefined();
  });
  it("closes the mobile menu with Escape and restores the hamburger focus", async () => {
    headerViewport(false);
    renderWithProviders(<TopNav active="home" />);
    const trigger = screen.getByRole("button", { name: "더보기" });
    await userEvent.click(trigger);
    expect(screen.getByRole("search")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("search")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(window.history.state?.oriderMobileMenu).toBeUndefined();
  });
  it("provides seven localized creation routes with their required query entries", async () => {
    renderWithProviders(<TopNav active="home" />, { authenticated: true });
    await screen.findByRole("button", { name: "프로필" });
    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    await userEvent.click(screen.getByText("+ 만들기"));
    const menu = screen.getByText("+ 만들기").parentElement!;
    expect(within(menu).getAllByRole("link")).toHaveLength(7);
    expect(within(menu).getByRole("link", { name: "클럽 만들기" })).toHaveAttribute("href", "/ko/clubs?new=1");
    expect(within(menu).getByRole("link", { name: "활동 가져오기" })).toHaveAttribute("href", "/ko/athlete/me/activities?import=1");
    expect(within(menu).getByRole("link", { name: "목표 만들기" })).toHaveAttribute("href", "/ko/coach/goals?new=1");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("search")).not.toBeInTheDocument());
  });

  it("switches between desktop search, notifications and profile without stacking panels", async () => {
    renderWithProviders(<TopNav active="home" />, { authenticated: true });
    const profile = await screen.findByRole("button", { name: "프로필" });
    const more = screen.getByRole("button", { name: "더보기" });
    const bell = screen.getByRole("button", { name: "알림" });
    await userEvent.click(more);
    await userEvent.click(bell);
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(screen.getByText("알림이 없습니다")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(bell).toHaveFocus();
    await userEvent.click(more);
    await userEvent.click(profile);
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(profile).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    expect(profile).toHaveFocus();
    await userEvent.click(bell);
    await userEvent.click(more);
    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.queryByText("알림이 없습니다")).not.toBeInTheDocument();
  });

  it("closes the mobile search drawer before opening the notification sheet", async () => {
    headerViewport(false);
    const onNotification = vi.fn();
    renderWithProviders(<TopNav active="home" onMobileNotifClick={onNotification} />, { authenticated: true });
    await screen.findByRole("button", { name: "프로필" });
    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    await userEvent.click(screen.getAllByRole("button", { name: "알림" })[0]!);
    expect(onNotification).toHaveBeenCalledOnce();
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
  });

});
