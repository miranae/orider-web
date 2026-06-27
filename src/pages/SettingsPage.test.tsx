import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPage from "./SettingsPage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";
import { createMockProfile, createMockStravaProfile } from "../__tests__/fixtures/mockData";

// Mock useExport (heavy, not needed for these tests)
vi.mock("../hooks/useExport", () => ({
  useExport: () => ({
    exportData: vi.fn(),
    loading: false,
    error: null,
    progress: null,
  }),
}));

vi.mock("../services/personalDataApi", () => ({
  listPersonalApiKeys: vi.fn().mockResolvedValue([]),
  createPersonalApiKey: vi.fn(),
  revokePersonalApiKey: vi.fn(),
}));

// SettingsPage 가 좌측 nav + 우측 pane 의 탭 레이아웃으로 재설계되었다(PR i18n/리디자인).
// 기본 탭은 "계정 & 프로필"(account)이고, Strava 연동/데이터 내보내기 등은
// 별도 탭(connections / 앱 & 데이터)에서 렌더되므로 해당 탭으로 먼저 이동해야 한다.
//
// nav 항목은 라벨/힌트 span 으로 구성되며, 라벨 텍스트를 클릭하면 버튼으로 이벤트가 전파된다.
async function gotoTab(user: ReturnType<typeof userEvent.setup>, label: string) {
  await waitFor(() => expect(screen.getByText("설정")).toBeInTheDocument());
  await user.click(screen.getByText(label));
}

describe("SettingsPage", () => {
  it("shows login required when not authenticated", () => {
    renderWithProviders(<SettingsPage />, { authenticated: false });
    expect(screen.getByText("로그인이 필요합니다.")).toBeInTheDocument();
  });

  it("renders settings heading when authenticated", async () => {
    renderWithProviders(<SettingsPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText("설정")).toBeInTheDocument();
    });
  });

  it("shows profile section with user info", async () => {
    renderWithProviders(<SettingsPage />, {
      authenticated: true,
      user: { displayName: "라이더", email: "rider@test.com" },
      profile: { nickname: "라이더" },
    });
    await waitFor(() => {
      expect(screen.getByText("프로필")).toBeInTheDocument();
      expect(screen.getByText("라이더")).toBeInTheDocument();
    });
  });

  it("shows Strava 연결하기 button when not connected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />, {
      authenticated: true,
      profile: { stravaConnected: false },
    });
    // Strava 연동 카드는 "연결된 앱"(connections) 탭에 있다.
    await gotoTab(user, "연결된 앱");
    await waitFor(() => {
      // 미연결 시 서비스 카드의 액션 버튼 라벨은 "연결" (pane.connections.btnConnect).
      // nav 그룹 제목 "연결" 과 구분하기 위해 button role 로 조회한다.
      expect(screen.getByRole("button", { name: "연결" })).toBeInTheDocument();
    });
  });

  it("shows Strava 연결됨 status when connected", async () => {
    renderWithProviders(<SettingsPage />, {
      authenticated: true,
      profile: { stravaConnected: true, stravaNickname: "StravaUser" },
    });
    // 연결 상태는 기본(계정) 탭의 ProfileHero 에 "Strava 연결됨" 배지로 표시된다.
    // (구버전의 "연결됨 (닉네임)" 텍스트는 리디자인으로 제거됨 — 닉네임은 더 이상 표시 안 함.)
    await waitFor(() => {
      expect(screen.getByText("Strava 연결됨")).toBeInTheDocument();
    });
  });

  it("shows 해제 button when Strava is connected", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />, {
      authenticated: true,
      profile: { stravaConnected: true, stravaNickname: "StravaUser" },
    });
    await gotoTab(user, "연결된 앱");
    await waitFor(() => {
      // 연결 시 액션 버튼 라벨은 "연결 해제" (pane.connections.btnDisconnect).
      expect(screen.getByRole("button", { name: "연결 해제" })).toBeInTheDocument();
    });
  });

  it("shows data management section", async () => {
    const user = userEvent.setup();
    // PaneApp 등이 useOriderTheme() 를 쓰므로 OriderThemeProvider 필요 —
    // 이제 renderWithProviders 가 전역으로 감싸므로 로컬 wrap 불필요.
    renderWithProviders(<SettingsPage />, { authenticated: true });
    await gotoTab(user, "앱 & 데이터");
    await waitFor(() => {
      // 데이터 내보내기 카드 (pane.app.cardExport / exportAllLabel).
      expect(screen.getByText("데이터 내보내기")).toBeInTheDocument();
      expect(screen.getByText("전체 활동 다운로드")).toBeInTheDocument();
    });
  });

  it("opens Developer API from section query", async () => {
    renderWithProviders(<SettingsPage />, { authenticated: true, route: "/settings?section=developer" });
    await waitFor(() => {
      expect(screen.getByText("Personal Data API key 만들기")).toBeInTheDocument();
      expect(screen.getByText("내 API keys")).toBeInTheDocument();
    });
  });

  it("shows danger zone", async () => {
    renderWithProviders(<SettingsPage />, { authenticated: true });
    // 위험 영역(pane.account.cardDanger)은 기본(계정) 탭에 있다.
    await waitFor(() => {
      expect(screen.getByText("위험 영역")).toBeInTheDocument();
      expect(screen.getAllByText("데이터 삭제").length).toBeGreaterThan(0);
    });
  });

  it("shows visibility options", async () => {
    renderWithProviders(<SettingsPage />, { authenticated: true });
    // 공개 범위 카드(pane.account.cardVisibility)는 기본(계정) 탭에 있다.
    await waitFor(() => {
      expect(screen.getByText("공개 범위")).toBeInTheDocument();
      expect(screen.getByText("모두에게 공개")).toBeInTheDocument();
      expect(screen.getByText("비공개")).toBeInTheDocument();
    });
  });

  it("shows friend code when available", async () => {
    renderWithProviders(<SettingsPage />, {
      authenticated: true,
      profile: { nickname: "테스트", friendCode: "XYZ789" },
    });
    await waitFor(() => {
      expect(screen.getByText("XYZ789")).toBeInTheDocument();
    });
  });
});
