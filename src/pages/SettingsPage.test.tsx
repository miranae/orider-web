import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
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

// SettingsPage 탭은 하위 경로(/settings/<tab>)다. 라우트가 tab prop 으로 넘기므로
// 테스트는 해당 탭을 직접 렌더한다. Strava 연동은 connections, 내보내기는 data 탭.

describe("SettingsPage", () => {
  it("shows login required when not authenticated", () => {
    renderWithProviders(<SettingsPage tab="account" />, { authenticated: false });
    expect(screen.getByText("로그인이 필요합니다.")).toBeInTheDocument();
  });

  it("renders settings heading when authenticated", async () => {
    renderWithProviders(<SettingsPage tab="account" />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText("설정")).toBeInTheDocument();
    });
  });

  it("shows profile section with user info", async () => {
    renderWithProviders(<SettingsPage tab="account" />, {
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
    renderWithProviders(<SettingsPage tab="connections" />, {
      authenticated: true,
      profile: { stravaConnected: false },
    });
    // Strava 연동 카드는 "연결된 앱"(connections) 탭에 있다.
    await waitFor(() => {
      // 미연결 시 서비스 카드의 액션 버튼 라벨은 "연결" (pane.connections.btnConnect).
      // nav 그룹 제목 "연결" 과 구분하기 위해 button role 로 조회한다.
      expect(screen.getByRole("button", { name: "연결" })).toBeInTheDocument();
    });
  });

  it("shows Strava 연결됨 status when connected", async () => {
    renderWithProviders(<SettingsPage tab="account" />, {
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
    renderWithProviders(<SettingsPage tab="connections" />, {
      authenticated: true,
      profile: { stravaConnected: true, stravaNickname: "StravaUser" },
    });
    await waitFor(() => {
      // 연결 시 액션 버튼 라벨은 "연결 해제" (pane.connections.btnDisconnect).
      expect(screen.getByRole("button", { name: "연결 해제" })).toBeInTheDocument();
    });
  });

  it("shows data management section", async () => {
    // PaneApp 등이 useOriderTheme() 를 쓰므로 OriderThemeProvider 필요 —
    // 이제 renderWithProviders 가 전역으로 감싸므로 로컬 wrap 불필요.
    renderWithProviders(<SettingsPage tab="data" />, { authenticated: true });
    await waitFor(() => {
      // 데이터 내보내기 카드 (pane.app.cardExport / exportAllLabel).
      expect(screen.getByText("데이터 내보내기")).toBeInTheDocument();
      expect(screen.getByText("전체 활동 다운로드")).toBeInTheDocument();
    });
  });

  it("opens Developer API on its own tab path", async () => {
    renderWithProviders(<SettingsPage tab="developer" />, { authenticated: true, route: "/settings/developer" });
    await waitFor(() => {
      expect(screen.getByText("개인 데이터 API 키 만들기")).toBeInTheDocument();
      expect(screen.getByText("내 API 키")).toBeInTheDocument();
    });
  });

  it("opens the account deletion request page from the danger zone", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/:lang/settings/account" element={<SettingsPage tab="account" />} />
        <Route path="/:lang/account-deletion" element={<h1>계정 삭제 요청 페이지</h1>} />
      </Routes>,
      { authenticated: true, route: "/ko/settings/account" },
    );
    expect(await screen.findByText("위험 영역")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "계정 삭제 안내 및 요청" }));
    expect(await screen.findByRole("heading", { name: "계정 삭제 요청 페이지" })).toBeInTheDocument();
  });

  it("shows visibility options", async () => {
    renderWithProviders(<SettingsPage tab="account" />, { authenticated: true });
    // 공개 범위 카드(pane.account.cardVisibility)는 기본(계정) 탭에 있다.
    await waitFor(() => {
      expect(screen.getByText("공개 범위")).toBeInTheDocument();
      expect(screen.getByText("모두에게 공개")).toBeInTheDocument();
      expect(screen.getByText("비공개")).toBeInTheDocument();
    });
  });

  it("shows friend code when available", async () => {
    renderWithProviders(<SettingsPage tab="account" />, {
      authenticated: true,
      profile: { nickname: "테스트", friendCode: "XYZ789" },
    });
    await waitFor(() => {
      expect(screen.getByText("XYZ789")).toBeInTheDocument();
    });
  });

  it("redirects the legacy section query to the tab path", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/:lang/settings" element={<SettingsPage />} />
        <Route path="/:lang/settings/developer" element={<SettingsPage tab="developer" />} />
      </Routes>,
      { authenticated: true, route: "/ko/settings?section=developer" },
    );
    await waitFor(() => expect(screen.getByText("개인 데이터 API 키 만들기")).toBeInTheDocument());
  });

  it("navigates between tabs by path instead of the section query", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/:lang/settings/account" element={<SettingsPage tab="account" />} />
        <Route path="/:lang/settings/connections" element={<SettingsPage tab="connections" />} />
      </Routes>,
      { authenticated: true, route: "/ko/settings/account", profile: { stravaConnected: false } },
    );
    await waitFor(() => expect(screen.getByText("설정")).toBeInTheDocument());
    await user.click(screen.getByText("연결 앱"));
    await waitFor(() => expect(screen.getByRole("button", { name: "연결" })).toBeInTheDocument());
  });

  it("uses a category hub and dedicated mobile subpages for every desktop setting tab", () => {
    const settingsPage = readFileSync(join(process.cwd(), "src/pages/SettingsPage.tsx"), "utf8");
    const mobileSettings = readFileSync(join(process.cwd(), "src/components/mobile/MobileSettingsPage.tsx"), "utf8");

    expect(settingsPage).toContain("if (isMobile)");
    expect(settingsPage).toContain("if (!tab) return <MobileSettingsPage />;");
    for (const [section, panes] of [
      ["account", "<PaneAccount /><PaneAiCoach />"],
      ["gear", "<PaneEquipment />"],
      ["device", "<PaneDevice /><PaneEquipment part=\"device\" />"],
      ["connections", "<PaneConnections /><PaneHealthSources />"],
      ["developer", "<PaneDeveloper />"],
      ["display", '<PaneApp part="display" />'],
      ["data", '<PaneApp part="data" />'],
    ]) {
      expect(settingsPage).toContain(`section === "${section}" && `);
      expect(settingsPage).toContain(panes);
    }
    expect(settingsPage).toContain('aria-label={t(section === "gear" ? "nav.backToProfile" : "nav.backToSettings")}');
    expect(mobileSettings).toContain("NAV_GROUPS.map");
    expect(mobileSettings).toContain("to={settingsTabPath(item.id)}");
    expect(mobileSettings).toContain('aria-label={t("nav.backToProfile")}');
    expect(mobileSettings).not.toContain("useStrava");
  });
});
