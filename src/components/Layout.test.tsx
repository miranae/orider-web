import { useLocation } from "react-router-dom";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Layout, { notificationTarget, buildOnboardingRedirectTarget, shouldBypassOnboardingRedirect } from "./Layout";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { setCollectionDocs, mockSignInWithPopup, mockCollectionData, getCurrentUser } from "../__tests__/mocks/firebase";
import { createMockNotification } from "../__tests__/fixtures/mockData";

const notificationApi = vi.hoisted(() => ({ mark: vi.fn() }));
vi.mock("../services/webNotifications", () => ({ createWebNotificationClient: () => ({
  list: async () => { await Promise.resolve(); return { items: mockCollectionData.get(`notifications/${getCurrentUser()?.uid}/items`) ?? [], nextCursor: null }; },
  markRead: async (ids: string[]) => { await notificationApi.mark(ids); return { ids }; },
}) }));
function LocationProbe() { const location = useLocation(); return <output data-testid="destination">{location.pathname}{location.search}</output>; }

// Mock icon.svg import
vi.mock("../assets/icon.svg", () => ({ default: "/icon.svg" }));

describe("Layout", () => {
  it.each([true, false])("only real accounts with incomplete profiles enter onboarding (anonymous=%s)", async (isAnonymous) => {
    renderWithProviders(<><Layout /><LocationProbe /></>, {
      route: "/ko/club/public-club?tab=rides", authenticated: true,
      user: { uid: "onboarding-user", isAnonymous }, profile: { onboardingStep: "sport" },
    });
    await waitFor(() => expect(screen.getByTestId("destination")).toHaveTextContent(isAnonymous
      ? "/ko/club/public-club?tab=rides"
      : "/ko/onboarding?returnTo=%2Fclub%2Fpublic-club%3Ftab%3Drides"));
    if (isAnonymous) {
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByTestId("destination")).not.toHaveTextContent("/onboarding");
    }
  });
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
    [{ type: "comment", activityId: "a1", commentId: "c-1" }, "/activity/a1?comment=c-1"],
    [{ type: "unavailable", access: "unavailable" }, null],
    [{ type: "pr", segmentId: "s1" }, "/segment/s1"],
    [{ type: "comment", deepLink: "https://example.com" }, "/"],
  ] as const)("routes supported notification payload %j to its real destination", (payload, target) => {
    expect(notificationTarget(createMockNotification({ activityId: undefined, ...payload }))).toBe(target);
  });
  it("provides utility footer links and app installation destinations", async () => {
    renderWithProviders(<Layout />);
    const footer = await screen.findByTestId("H-F");
    expect(footer).toHaveRole("contentinfo");
    expect(footer).toBeVisible();
    expect(footer).toHaveAttribute("data-testid", "H-F");
    const user = userEvent.setup();
    const navigation = within(footer).getByRole("navigation", { name: "사이트 안내" });
    expect(within(navigation).getAllByRole("button")).toHaveLength(4);
    expect(within(navigation).queryByRole("link", { name: "오라이더 소개" })).not.toBeInTheDocument();
    const together = within(navigation).getByRole("button", { name: "함께하기" });
    await user.click(together);
    const partnership = screen.getByLabelText("함께하기", { selector: '[role="region"]' });
    const partnershipLinks = within(partnership).getAllByRole("link");
    expect(partnershipLinks.map(link => link.getAttribute("href"))).toEqual([
      "/ko/about", "/ko/partnership/build", "/ko/partnership/collaborate", "/ko/partnership/investment",
    ]);
    expect(partnershipLinks.map(link => link.textContent)).toEqual(["오라이더 소개", "함께 만들기", "제휴 · 광고 문의", "투자 문의"]);
    expect(partnershipLinks[0]).toHaveFocus();
    expect(partnershipLinks[0]).toHaveAttribute("data-testid", "X2-1");
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("함께하기", { selector: '[role="region"]' })).not.toBeInTheDocument();
    expect(together).toHaveFocus();
    await user.click(together);
    expect(screen.queryByText("orider.app@gmail.com")).not.toBeInTheDocument();
    await user.click(within(navigation).getByRole("button", { name: "도움말" }));
    expect(screen.queryByLabelText("함께하기", { selector: '[role="region"]' })).not.toBeInTheDocument();
    const help = screen.getByLabelText("도움말", { selector: '[role="region"]' });
    expect(within(help).getByRole("link", { name: "앱 설명서" })).toHaveAttribute("href", "/manual/");
    expect(within(help).getByRole("link", { name: "웹 설명서" })).toHaveAttribute("href", "/web-manual/");
    expect(within(help).getByRole("link", { name: "공개 계산기" })).toHaveAttribute("href", "/ko/tools/virtual-power");
    await user.click(within(navigation).getByRole("button", { name: "앱 설치" }));
    expect(screen.queryByLabelText("도움말", { selector: '[role="region"]' })).not.toBeInTheDocument();
    const install = screen.getByLabelText("앱 설치", { selector: '[role="region"]' });
    expect(within(install).getByRole("link", { name: "App Store" })).toHaveAttribute("target", "_blank");
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("앱 설치", { selector: '[role="region"]' })).not.toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: "앱 설치" })).toHaveFocus();
    await user.click(within(navigation).getByRole("button", { name: "도움말" }));
    await user.pointer({ target: document.body, keys: "[MouseLeft]" });
    expect(screen.queryByLabelText("도움말", { selector: '[role="region"]' })).not.toBeInTheDocument();
    await user.click(within(navigation).getByRole("button", { name: "도움말" }));
    const reopenedHelp = screen.getByLabelText("도움말", { selector: '[role="region"]' });
    expect(within(reopenedHelp).getByRole("link", { name: "앱 설명서" })).toHaveFocus();
    await user.tab();
    expect(within(reopenedHelp).getByRole("link", { name: "웹 설명서" })).toHaveFocus();
    // 설명서는 정적 페이지로 전체 이동하므로 SPA 이동으로 닫히는지는 SPA 링크로 확인한다.
    await user.click(within(reopenedHelp).getByRole("link", { name: "공개 계산기" }));
    expect(screen.queryByLabelText("도움말", { selector: '[role="region"]' })).not.toBeInTheDocument();
    const helpTrigger = within(navigation).getByRole("button", { name: "도움말" });
    const bounds = vi.spyOn(helpTrigger, "getBoundingClientRect").mockReturnValue(new DOMRect(0, -10, 80, 44));
    await user.click(helpTrigger);
    expect(screen.queryByLabelText("도움말", { selector: '[role="region"]' })).not.toBeInTheDocument();
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
    expect(shouldBypassOnboardingRedirect("/partnership/build")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/partnership/collaborate")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/partnership/investment")).toBe(true);
    expect(shouldBypassOnboardingRedirect("/partnership-private")).toBe(false);
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

  it("calls signIn when login button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Layout />, { authenticated: false });

    await waitFor(() => {
      expect(screen.getByText("기록을 저장하려면 로그인")).toBeInTheDocument();
    });

    await user.click(screen.getByText("기록을 저장하려면 로그인"));
    // 로그인 방식 선택 창 → Google
    await user.click(await screen.findByTestId("A1-1-1"));
    expect(mockSignInWithPopup).toHaveBeenCalled();
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
    notificationApi.mark.mockClear();
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
      expect(notificationApi.mark).toHaveBeenCalledWith(["n1"]);
    });
  });

  it("marks visible notifications read while retaining the list", async () => {
    notificationApi.mark.mockClear();
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

    await waitFor(() => expect(notificationApi.mark).toHaveBeenCalledWith(["n1", "n2"]));
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

  it("keeps legal policy destinations in the main-screen footer", async () => {
    renderWithProviders(<Layout />, { route: "/" });
    await waitFor(() => {
      expect(screen.getByAltText("Orider")).toBeInTheDocument();
    });
    const footer = screen.getByRole("contentinfo");
    await userEvent.setup().click(within(footer).getByRole("button", { name: "약관·정책" }));
    const policies = screen.getByRole("region", { name: "약관·정책" });
    expect(policies).toHaveTextContent("이용약관");
    expect(policies).toHaveTextContent("개인정보처리방침");
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
    await userEvent.click(screen.getByRole("button", { name: "프로필" }));
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
});

it("opens the exact comment destination without waiting for a read receipt", async () => {
  notificationApi.mark.mockReturnValueOnce(new Promise(() => {}));
  const user = userEvent.setup();
  renderWithProviders(<><Layout /><LocationProbe /></>, { authenticated: true, user: { uid: "uid-1" } });
  setCollectionDocs("notifications/uid-1/items", [{ ...createMockNotification({ type: "comment", activityId: "ride", commentId: "target-comment", message: "댓글로 이동", read: false }), id: "target" }]);
  await user.click((await screen.findAllByRole("button", { name: "알림" }))[0]!);
  await user.click(await screen.findByText("댓글로 이동"));
  await waitFor(() => expect(screen.getByTestId("destination")).toHaveTextContent("/ko/activity/ride?comment=target-comment"));
  expect(notificationApi.mark).toHaveBeenCalledWith(["target"]);
});
