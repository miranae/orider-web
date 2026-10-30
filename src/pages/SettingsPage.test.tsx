import { getDoc } from "firebase/firestore";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { getCurrentUser } from "../__tests__/mocks/firebase";
import SettingsPage from "./SettingsPage";
import { renderWithProviders } from "../__tests__/utils/renderWithProviders";

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

  it("shows the authenticated profile, visibility choices and account actions", async () => {
    const originalGetDoc = vi.mocked(getDoc).getMockImplementation()!;
    let releaseProfileRead!: () => void;
    const profileReadReady = new Promise<void>(resolve => { releaseProfileRead = resolve; });
    vi.mocked(getDoc).mockImplementation(async ref => {
      if ((ref as unknown as { path: string }).path === "users/test-uid") await profileReadReady;
      return originalGetDoc(ref);
    });
    try {
      renderWithProviders(<SettingsPage tab="account" />, {
        authenticated: true,
        user: { displayName: "라이더", email: "rider@test.com" },
        profile: { nickname: "라이더", friendCode: "XYZ789" },
      });
      // Auth displayName is ready before the independent friend-code document read.
      await screen.findByText("라이더");
      expect(screen.queryByText("XYZ789")).not.toBeInTheDocument();
      await act(async () => { releaseProfileRead(); });
      await screen.findByText("XYZ789");
      for (const label of ["설정", "프로필", "계정 관리", "공개 범위", "모두에게 공개", "비공개", "XYZ789"]) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
      expect(screen.getByRole("link", { name: "데이터 관리" })).toHaveAttribute("href", "/ko/settings/data");
      expect(screen.queryByRole("button", { name: "모든 활동 데이터 삭제" })).not.toBeInTheDocument();
    } finally {
      releaseProfileRead();
      vi.mocked(getDoc).mockImplementation(originalGetDoc);
    }
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

  it("opens Developer API on its own tab path", async () => {
    renderWithProviders(<SettingsPage tab="developer" />, { authenticated: true, route: "/settings/developer" });
    await waitFor(() => {
      expect(screen.getByText("개인 데이터 API 키 만들기")).toBeInTheDocument();
      expect(screen.getByText("내 API 키")).toBeInTheDocument();
    });
  });

  it("opens the account deletion request page from account management", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/:lang/settings/account" element={<SettingsPage tab="account" />} />
        <Route path="/:lang/account-deletion" element={<h1>계정 삭제 요청 페이지</h1>} />
      </Routes>,
      { authenticated: true, route: "/ko/settings/account" },
    );
    expect(await screen.findByText("계정 관리")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "계정 삭제 안내 및 요청" }));
    expect(await screen.findByRole("heading", { name: "계정 삭제 요청 페이지" })).toBeInTheDocument();
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
});


it("offers the existing training fields at their settings destination and keeps anonymous editing unavailable", async () => {
  const view = renderWithProviders(<SettingsPage tab="training" />, { authenticated: true, route: "/ko/settings/training?sport=run#thresholds" });
  expect(await screen.findByLabelText("FTP")).toBeVisible();
  expect(document.getElementById("thresholds")).toBeVisible();
  expect(screen.getByRole("link", { name: "기기 반영 상태 보기 →" })).toHaveAttribute("href", "/ko/settings/device");
  Object.assign(getCurrentUser()!, { isAnonymous: true });
  view.rerender(<SettingsPage tab="training" />);
  expect(screen.getByText("로그인이 필요합니다.")).toBeInTheDocument();
  expect(screen.queryByLabelText("FTP")).not.toBeInTheDocument();
});
