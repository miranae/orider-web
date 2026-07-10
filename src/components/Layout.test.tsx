import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Layout, { buildOnboardingRedirectTarget, shouldBypassOnboardingRedirect } from "./Layout";
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
  it("allows Strava connection routes before onboarding is done", () => {
    expect(shouldBypassOnboardingRedirect("/settings")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/strava/callback")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/migrate")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/onboarding")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/terms")).toBe(true);
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

  it("shows 5-hub nav labels", async () => {
    renderWithProviders(<Layout />);
    // 9평면 → 5허브 재편(#385): 데스크톱 nav·모바일 탭바가 동일 5허브(홈/내 운동/탐색/커뮤니티/설정)를
    // 공유한다. 같은 라벨이 데스크톱 nav 와 모바일 탭바 양쪽에 렌더되므로(jsdom 은 CSS hidden 도 DOM 에
    // 둠) getAllByText 로 "최소 1개 존재"를 단언한다. 서브 기능(계획/기록/코스/그룹/이벤트)은 허브
    // 진입 후 서브탭(HubSubNav)·햄버거 메뉴에서 노출되므로 홈 화면 기본 렌더엔 없다.
    await waitFor(() => {
      expect(screen.getAllByText("내 운동").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("탐색").length).toBeGreaterThan(0);
    expect(screen.getAllByText("커뮤니티").length).toBeGreaterThan(0);
    expect(screen.getAllByText("설정").length).toBeGreaterThan(0);
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

  it("clears every visible notification from the mobile sheet", async () => {
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
        expect.objectContaining({ read: true, dismissedAt: expect.any(Number) }),
      );
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: "notifications/uid-1/items/n2" }),
        expect.objectContaining({ read: true, dismissedAt: expect.any(Number) }),
      );
    });
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: "notifications/uid-1/items/n3" }),
      expect.objectContaining({ read: true, dismissedAt: expect.any(Number) }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "모두 읽음" })).not.toBeInTheDocument();
    });
    expect(screen.getByText("알림이 없습니다")).toBeInTheDocument();
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

    await waitFor(() => {
      expect(screen.getByAltText("")).toBeInTheDocument();
    });

    // Open profile dropdown
    await user.click(screen.getByAltText(""));

    await waitFor(() => {
      expect(screen.getByText("프로필")).toBeInTheDocument();
    });
    // "설정" 은 드롭다운 외에 5허브 nav(데스크톱)·모바일 탭바에도 존재하므로 getAllByText 로 단언.
    expect(screen.getAllByText("설정").length).toBeGreaterThan(0);
    expect(screen.getByText("로그아웃")).toBeInTheDocument();
  });

  it("shows footer with copyright", async () => {
    renderWithProviders(<Layout />, { route: "/explore" });
    await waitFor(() => {
      expect(screen.getByText(/2026 Orider/)).toBeInTheDocument();
    });
    // 비-대시보드 경로의 푸터는 lg 에서 숨기지 않는다 (md+ 항상 노출)
    expect(screen.getByRole("contentinfo").className).not.toContain("lg:hidden");
  });

  it("hides main-screen footer at lg+ but keeps it on tablet (md~lg)", async () => {
    // 메인화면(`/`)에서는 푸터 링크를 사이드바(lg:flex) 더보기로 흡수하므로 푸터를 lg+ 에서만
    // 숨긴다. 사이드바가 렌더되지 않는 md~lg(태블릿)에서는 푸터를 유지해 법적 링크 접근성을 보존.
    // jsdom 은 CSS 를 적용하지 않으므로 가시성 대신 반응형 클래스(lg:hidden)로 단언한다.
    renderWithProviders(<Layout />, { route: "/" });
    await waitFor(() => {
      expect(screen.getByAltText("Orider")).toBeInTheDocument();
    });
    const footer = screen.getByRole("contentinfo");
    expect(footer.className).toContain("md:block");
    expect(footer.className).toContain("lg:hidden");
  });

  it("has mobile bottom tab bar with 5 hub tabs", async () => {
    // 9평면 → 5허브 재편(#385): 모바일 탭 바는 홈/내 운동/탐색/커뮤니티/설정 5개 허브 탭.
    // 허브 라벨은 데스크톱 nav 와 공유되므로(getByText 충돌) role 기반으로 탭 5개 존재를 단언한다.
    renderWithProviders(<Layout />);
    // 페이지 내 다른 tablist(예: DisciplineTabs)와 구분하기 위해 접근성 이름으로 모바일 탭바를 스코프.
    await waitFor(() => {
      expect(screen.getByRole("tablist", { name: "메인 내비게이션" })).toBeInTheDocument();
    });
    const tabBar = screen.getByRole("tablist", { name: "메인 내비게이션" });
    expect(within(tabBar).getAllByRole("tab")).toHaveLength(5);
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
      expect(screen.getByRole("tablist", { name: "메인 내비게이션" })).toBeInTheDocument();
    });

    const tabBar = screen.getByRole("tablist", { name: "메인 내비게이션" });
    for (const tab of within(tabBar).getAllByRole("tab")) {
      expect(tab.className).toContain("focus-visible:outline");
    }

    expect(screen.getByRole("button", { name: "KO" }).className).toContain("focus-visible:outline");
    const moreButtons = screen.getAllByRole("button", { name: "더보기" });
    expect(moreButtons.some((button) => button.className.includes("focus-visible:outline"))).toBe(true);
    expect(screen.getByRole("link", { name: /내 운동/ }).className).toContain("focus-visible:outline");
  });
});
