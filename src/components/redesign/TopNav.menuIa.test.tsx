import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import TopNav from "./TopNav";
import MobileTabBar from "../mobile/MobileTabBar";

vi.mock("../../hooks/useGlobalSearch", () => ({
  useGlobalSearch: () => ({ results: { activities: [], courses: [] } }),
}));

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
    const avatar = await screen.findByRole("button", { name: "프로필" });
    expect(avatar).toHaveAttribute("aria-current", "page");
    expect(within(avatar).getByLabelText("받은 친구 요청 3건")).toBeInTheDocument();
    await user.click(avatar);
    for (const [name, href] of accountLinks) {
      expect(screen.getAllByRole("link", { name }).every(link => link.getAttribute("href") === href)).toBe(true);
    }
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  });

  it("includes account and footer destinations in the mobile slide menu", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TopNav active="home" />, { authenticated: true });
    await user.click(await screen.findByRole("button", { name: "더보기" }));
    for (const [name, href] of accountLinks) {
      expect(screen.getAllByRole("link", { name }).every(link => link.getAttribute("href") === href)).toBe(true);
    }
    expect(screen.getByRole("link", { name: "오라이더 소개" })).toHaveAttribute("href", "/ko/about");
    expect(screen.getByRole("link", { name: "개발자 문서" })).toHaveAttribute("href", "/ko/explore/recipes");
    expect(screen.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/ko/terms");
  });
  it("provides seven localized creation routes with their required query entries", async () => {
    renderWithProviders(<TopNav active="home" />, { authenticated: true });
    await userEvent.click(screen.getByRole("button", { name: "+ 만들기" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(7);
    expect(within(menu).getByRole("menuitem", { name: "클럽 만들기" })).toHaveAttribute("href", "/ko/clubs?new=1");
    expect(within(menu).getByRole("menuitem", { name: "활동 가져오기" })).toHaveAttribute("href", "/ko/athlete/me/activities?import=1");
    expect(within(menu).getByRole("menuitem", { name: "목표 만들기" })).toHaveAttribute("href", "/ko/coach/goals?new=1");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

});
