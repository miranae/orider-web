import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Layout, { notificationTarget, buildOnboardingRedirectTarget, shouldBypassOnboardingRedirect } from "./Layout";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import {
  setCollectionDocs,
  mockSignInWithPopup,
  mockSignOut,
  mockUpdateDoc,
} from "../__tests__/mocks/firebase";
import { createMockNotification } from "../__tests__/fixtures/mockData";

// Mock icon.svg import
vi.mock("../assets/icon.svg", () => ({ default: "/icon.svg" }));

describe("Layout", () => {
  it.each([
    [{ type: "friend_request" }, "/athlete/me/friends?tab=requests"],
    [{ type: "friend_accept", fromUserId: "friend-uid" }, "/athlete/friend-uid"],
    [{ type: "friend_accept", fromUserId: "uid?value#fragment" }, "/athlete/uid%3Fvalue%23fragment"],
    ...["", "..", ".", "bad/uid", "bad\\uid", "bad uid"].map(fromUserId => [{ type: "friend_accept", fromUserId }, "/athlete/me/friends"] as const),
    [{ type: "group_invite" }, "/clubs"],
    [{ type: "group_request_approved", groupId: "g 1" }, "/club/g%201"],
    [{ type: "group_request_rejected", groupId: "g1" }, "/clubs"],
    [{ type: "event_alert", eventId: "e1" }, "/event/e1"],
    [{ type: "coach_prescription", threadId: "t1" }, "/coach/chat/t1"],
    [{ type: "comment", activityId: "a1" }, "/activity/a1"],
    [{ type: "pr", segmentId: "s1" }, "/segment/s1"],
    [{ type: "comment", deepLink: "https://example.com" }, "/"],
  ] as const)("routes supported notification payload %j to its real destination", (payload, target) => {
    expect(notificationTarget(createMockNotification({ activityId: undefined, ...payload }))).toBe(target);
  });
  it("provides utility footer links and app installation destinations", async () => {
    renderWithProviders(<Layout />);
    const footer = await screen.findByRole("contentinfo");
    expect(footer).toHaveAttribute("data-testid", "H-F");
    const user = userEvent.setup();
    const navigation = within(footer).getByRole("navigation", { name: "사이트 안내" });
    expect(within(navigation).getAllByRole("button")).toHaveLength(3);
    expect(within(navigation).getByRole("link", { name: "협력 문의" })).toHaveAttribute("href", "/ko/partnership");
    expect(screen.queryByText("orider.app@gmail.com")).not.toBeInTheDocument();
    await user.click(within(navigation).getByRole("button", { name: "도움말" }));
    const help = screen.getByRole("region", { name: "도움말" });
    expect(within(help).getByRole("link", { name: "앱 설명서" })).toHaveAttribute("href", "/ko/manual");
    expect(within(help).getByRole("link", { name: "웹 설명서" })).toHaveAttribute("href", "/ko/web-manual");
    expect(within(help).getByRole("link", { name: "공개 계산기" })).toHaveAttribute("href", "/ko/tools/virtual-power");
    await user.click(within(navigation).getByRole("button", { name: "앱 설치" }));
    expect(screen.queryByRole("region", { name: "도움말" })).not.toBeInTheDocument();
    const install = screen.getByRole("region", { name: "앱 설치" });
    expect(within(install).getByRole("link", { name: "App Store" })).toHaveAttribute("target", "_blank");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "앱 설치" })).not.toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: "앱 설치" })).toHaveFocus();
    await user.click(within(navigation).getByRole("button", { name: "도움말" }));
    await user.pointer({ target: document.body, keys: "[MouseLeft]" });
    expect(screen.queryByRole("region", { name: "도움말" })).not.toBeInTheDocument();
    await user.click(within(navigation).getByRole("button", { name: "도움말" }));
    const reopenedHelp = screen.getByRole("region", { name: "도움말" });
    expect(within(reopenedHelp).getByRole("link", { name: "앱 설명서" })).toHaveFocus();
    await user.tab();
    expect(within(reopenedHelp).getByRole("link", { name: "웹 설명서" })).toHaveFocus();
    await user.click(within(reopenedHelp).getByRole("link", { name: "웹 설명서" }));
    expect(screen.queryByRole("region", { name: "도움말" })).not.toBeInTheDocument();
    const helpTrigger = within(navigation).getByRole("button", { name: "도움말" });
    const bounds = vi.spyOn(helpTrigger, "getBoundingClientRect").mockReturnValue(new DOMRect(0, -10, 80, 44));
    await user.click(helpTrigger);
    expect(screen.queryByRole("region", { name: "도움말" })).not.toBeInTheDocument();
    bounds.mockRestore();
  });

  it("allows Strava connection routes before onboarding is done", () => {
    expect(shouldBypassOnboardingRedirect("/settings")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/settings/connections")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/policies/community")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/policies/ai-coach")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/strava/callback")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/migrate")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/onboarding")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/terms")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/partnership")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/privacy")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/community")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/strava-terms")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/")).toBe(false);
    expect(shouldBypassOnboardingRedirect("/activity/abc")).toBe(false);
  });

  it("preserves a deep link when redirecting to onboarding", () => {
    expect(buildOnboardingRedirectTarget("/ko/group/abc", "?tab=rides", "#today"))
      .toBe("/onboarding?returnTo=%2Fgroup%2Fabc%3Ftab%3Drides%23today");
    expect(buildOnboardingRedirectTarget("/ko")).toBe("/onboarding");
  });

  it("renders Orider logo", async () => {
    renderWithProviders(<Layout />);
    await waitFor(() => {
      const logo = screen.getByAltText("Orider");
      expect(logo).toBeInTheDocument();
    });
  });

  it("shows the five primary hub labels and keeps settings out of primary navigation", async () => {
    renderWithProviders(<Layout />);
    await waitFor(() => {
      expect(screen.getAllByText("클럽").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("코치").length).toBeGreaterThan(0);
    expect(screen.getAllByText("탐색").length).toBeGreaterThan(0);
    expect(screen.getAllByText("게시판").length).toBeGreaterThan(0);
    const tabBar = screen.getByRole("navigation", { name: "메인 내비게이션" });
    expect(within(tabBar).queryByRole("link", { name: "설정" })).not.toBeInTheDocument();
  });

  it("shows Google login button when not authenticated", async () => {
    renderWithProviders(<Layout />, { authenticated: false });
    await waitFor(() => {
      expect(screen.getByText("기록을 저장하려면 로그인")).toBeInTheDocument();
    });
  });

  it("calls signInWithGoogle when login button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Layout />, { authenticated: false });

    await waitFor(() => {
      expect(screen.getByText("기록을 저장하려면 로그인")).toBeInTheDocument();
    });

    await user.click(screen.getByText("기록을 저장하려면 로그인"));
    expect(mockSignInWithPopup).toHaveBeenCalled();
  });

  it("shows profile avatar when authenticated", async () => {
    renderWithProviders(<Layout />, {
      authenticated: true,
      user: { displayName: "Rider", photoURL: "https://example.com/photo.jpg" },
    });

    await waitFor(() => {
      const img = screen.getByAltText("");
      expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
    });
  });

  it("shows notification badge with unread count", async () => {
    renderWithProviders(<Layout />, {
      authenticated: true,
      user: { uid: "uid-1" },
    });

    // Set notifications
    setCollectionDocs("notifications/uid-1/items", [
      { id: "n1", ...createMockNotification({ read: false }) },
      { id: "n2", ...createMockNotification({ read: false }) },
      { id: "n3", ...createMockNotification({ read: true }) },
    ]);

    await waitFor(() => {
      expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    });
  });

  it("opens a notification from the mobile sheet and marks it read", async () => {
    mockUpdateDoc.mockClear();
    const user = userEvent.setup();
    renderWithProviders(<Layout />, {
      authenticated: true,
      user: { uid: "uid-1" },
    });

    setCollectionDocs("notifications/uid-1/items", [
      {
        ...createMockNotification({
          activityId: "strava_123",
          read: false,
          createdAt: { seconds: Math.floor((Date.now() - 10 * 60 * 1000) / 1000) } as unknown as number,
          message: "활동 알림",
        }),
        id: "n1",
      },
    ]);

    const notificationButtons = await screen.findAllByRole("button", { name: "알림" });
    await user.click(notificationButtons[0]!);

    expect(await screen.findByText("10분 전")).toBeInTheDocument();
    await user.click(screen.getByText("활동 알림"));

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "notifications/uid-1/items/n1" }),
        { read: true },
      );
    });
  });

  it("marks visible notifications read while retaining the list", async () => {
    mockUpdateDoc.mockClear();
    const user = userEvent.setup();
    renderWithProviders(<Layout />, {
      authenticated: true,
      user: { uid: "uid-1" },
    });

    setCollectionDocs("notifications/uid-1/items", [
      { ...createMockNotification({ read: false, message: "첫 번째 알림" }), id: "n1" },
      { ...createMockNotification({ read: false, message: "두 번째 알림" }), id: "n2" },
      { ...createMockNotification({ read: true, message: "이미 읽은 알림" }), id: "n3" },
    ]);

    const notificationButtons = await screen.findAllByRole("button", { name: "알림" });
    await user.click(notificationButtons[0]!);
    await user.click(await screen.findByRole("button", { name: "모두 읽음" }));

    await waitFor(() => {
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "notifications/uid-1/items/n1" }),
        { read: true },
      );
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "notifications/uid-1/items/n2" }),
        { read: true },
      );
    });
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "notifications/uid-1/items/n3" }),
      { read: true },
    );
    expect(screen.getByText("첫 번째 알림")).toBeInTheDocument();
    expect(screen.getByText("두 번째 알림")).toBeInTheDocument();
    expect(screen.getByText("이미 읽은 알림")).toBeInTheDocument();
    expect(screen.queryByText("알림이 없습니다")).not.toBeInTheDocument();
  });

  it("shows the mobile clear action when all notifications are already read", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Layout />, {
      authenticated: true,
      user: { uid: "uid-1" },
    });

    setCollectionDocs("notifications/uid-1/items", [
      { ...createMockNotification({ read: true, message: "읽은 알림" }), id: "n1" },
    ]);

    const notificationButtons = await screen.findAllByRole("button", { name: "알림" });
    await user.click(notificationButtons[0]!);

    expect(await screen.findByRole("button", { name: "모두 읽음" })).toBeInTheDocument();
  });

  it("opens profile dropdown with profile/settings/logout items", async () => {
    // NOTE: 과거 이 테스트는 드롭다운에서 "Strava 연동됨" 을 확인했으나,
    // 리디자인된 TopNav 의 프로필 드롭다운은 Strava 연동 상태를 더 이상 노출하지 않는다
    // (연동 상태/관리는 설정 > 연결(PaneConnections) 로 이전됨).
    // 따라서 드롭다운이 열리고 현재의 실제 메뉴 항목을 노출하는지로 단언을 갱신한다.
    const user = userEvent.setup();
    renderWithProviders(<Layout />, {
      authenticated: true,
      user: { uid: "uid-1", displayName: "Rider", photoURL: "https://example.com/photo.jpg" },
      profile: { stravaConnected: true },
    });

    // Open profile dropdown
    await user.click(await screen.findByRole("button", { name: "프로필" }));

    await waitFor(() => {
      expect(screen.getByText("내 프로필")).toBeInTheDocument();
    });
    expect(screen.getAllByText("설정").length).toBeGreaterThan(0);
    expect(screen.getByText("로그아웃")).toBeInTheDocument();
  });

  it("shows footer with copyright", async () => {
    renderWithProviders(<Layout />, { route: "/explore/segments" });
    await waitFor(() => {
      expect(screen.getByText(/2026 Orider/)).toBeInTheDocument();
    });
    // 비-대시보드 경로의 푸터는 lg 에서 숨기지 않는다 (md+ 항상 노출)
    expect(screen.getByRole("contentinfo").className).not.toContain("lg:hidden");
  });

  it("uses the shared site shell for home content", () => {
    const { container } = renderWithProviders(<Layout />, { route: "/" });
    const shell = container.querySelector('[data-page-shell="home"]');

    expect(shell).toHaveClass("site-shell");
    expect(container.querySelector('[data-page-shell="content"]')).not.toBeInTheDocument();
  });

  it("uses the shared site shell for non-home content", () => {
    const { container } = renderWithProviders(<Layout />, { route: "/feedback" });
    const shell = container.querySelector('[data-page-shell="content"]');

    expect(shell).toHaveClass("site-shell");
    expect(container.querySelector('[data-page-shell="home"]')).not.toBeInTheDocument();
  });

  it("keeps the main-screen footer available at tablet and large desktop widths", async () => {
    // 홈도 다른 데스크톱 화면처럼 공통 법적 링크를 제공한다.
    // 모바일 링크는 햄버거 메뉴에서 제공하므로 md 이상 표시하고 lg에서도 숨기지 않는다.
    renderWithProviders(<Layout />, { route: "/" });
    await waitFor(() => {
      expect(screen.getByAltText("Orider")).toBeInTheDocument();
    });
    const footer = screen.getByRole("contentinfo");
    expect(footer.className).toContain("md:block");
    expect(footer.className).not.toContain("lg:hidden");
    await userEvent.setup().click(within(footer).getByRole("button", { name: "약관·정책" }));
    const policies = screen.getByRole("region", { name: "약관·정책" });
    expect(policies).toHaveTextContent("이용약관");
    expect(policies).toHaveTextContent("개인정보처리방침");
  });

  it("reserves bottom tab space through tablet widths", async () => {
    renderWithProviders(<Layout />, { route: "/coach/condition" });
    const main = await screen.findByRole("main");
    expect(main.className).toContain("lg:pb-0");
    expect(main.className).not.toContain("md:pb-0");
  });

  it("has five ordered localized mobile tabs including Coach", async () => {
    renderWithProviders(<Layout />);
    // 페이지 내 다른 탐색 영역과 구분하기 위해 접근성 이름으로 모바일 탭바를 스코프.
    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "메인 내비게이션" })).toBeInTheDocument();
    });
    const tabBar = screen.getByRole("navigation", { name: "메인 내비게이션" });
    const tabs = within(tabBar).getAllByRole("link");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["홈", "코치", "클럽", "탐색", "게시판"]);
    expect(within(tabBar).getByRole("link", { name: "코치" })).toHaveAttribute("href", "/ko/coach/condition");
  });

  it("selects Coach routes but no primary tab on settings routes", async () => {
    const coachView = renderWithProviders(<Layout />, { route: "/ko/coach/chat/thread-1" });
    const coachTabBar = await screen.findByRole("navigation", { name: "메인 내비게이션" });
    expect(within(coachTabBar).getByRole("link", { name: "코치" })).toHaveAttribute("aria-current", "page");
    coachView.unmount();

    renderWithProviders(<Layout />, { route: "/ko/settings/account", authenticated: true, user: { uid: "viewer" } });
    const settingsTabBar = await screen.findByRole("navigation", { name: "메인 내비게이션" });
    expect(within(settingsTabBar).getAllByRole("link").every((link) => !link.hasAttribute("aria-current"))).toBe(true);
    expect(screen.getByRole("link", { name: "계정" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    expect(screen.getAllByRole("link", { name: "설정" }).every(link => link.getAttribute("href") === "/ko/settings/account")).toBe(true);
    expect(screen.getByRole("button", { name: "프로필" })).toHaveAttribute("aria-current", "page");
  });

  it("closes the mobile slide menu when browser back is pressed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Layout />, { authenticated: false });

    const moreButtons = await screen.findAllByRole("button", { name: "더보기" });
    await user.click(moreButtons[0]!);
    expect(await screen.findByRole("button", { name: "닫기" })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "닫기" })).not.toBeInTheDocument();
    });
  });

  it("marks repeated navigation controls with visible keyboard focus styles", async () => {
    renderWithProviders(<Layout />, { authenticated: false });

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "메인 내비게이션" })).toBeInTheDocument();
    });

    const tabBar = screen.getByRole("navigation", { name: "메인 내비게이션" });
    for (const link of within(tabBar).getAllByRole("link")) {
      expect(link.className).toContain("focus-visible:outline");
    }

    expect(screen.getByRole("button", { name: "KO" }).className).toContain("focus-visible:outline");
    const moreButtons = screen.getAllByRole("button", { name: "더보기" });
    expect(moreButtons.some((button) => button.className.includes("focus-visible:outline"))).toBe(true);
    expect(screen.getAllByRole("link", { name: /^클럽$/ }).some((link) => link.className.includes("focus-visible:outline"))).toBe(true);
  });
});
