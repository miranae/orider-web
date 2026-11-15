import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_SETTINGS } from "@shared/types/deviceSettings";
import { Resolvable, type Resolve } from "../redesign/states/Resolvable";

const mocks = vi.hoisted(() => ({
  user: { uid: "uid-a" } as { uid: string } | null,
  signIn: vi.fn(),
  toastCalls: [] as Array<[string, string | undefined, { resolve?: Resolve } | undefined]>,
  update: vi.fn(),
  broadcast: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user, signIn: mocks.signIn }) }));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ showToast: (message: string, type?: string, options?: { resolve?: Resolve }) => { mocks.toastCalls.push([message, type, options]); } }),
}));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: vi.fn(), alert: vi.fn() }) }));
vi.mock("../../hooks/useLayoutAuthority", () => ({ useLayoutAuthority: () => ({ migrated: true, loading: false }) }));
vi.mock("../../hooks/useDeviceSettings", () => ({
  useAllDeviceSettings: () => ({
    records: [
      { deviceId: "d1", deviceName: "폰 A", settings: DEFAULT_APP_SETTINGS, version: 1, updatedAt: 0 },
      { deviceId: "d2", deviceName: "폰 B", settings: DEFAULT_APP_SETTINGS, version: 1, updatedAt: 0 },
    ],
    loading: false,
    error: null,
    reload: mocks.reload,
    update: mocks.update,
    broadcastUserScoped: mocks.broadcast,
  }),
}));

import { PaneDevice } from "./PaneDevice";

function SearchProbe() {
  return <span data-testid="search">{useLocation().search}</span>;
}

/** 다른 화면에 떠 있는 알림 — 누르면 기기 설정이 새로 열린다. */
function Elsewhere({ to }: { to: string }) {
  const { pathname } = useLocation();
  if (pathname.endsWith("/settings/device")) return <><PaneDevice /><SearchProbe /></>;
  return <Resolvable resolve={{ to }}>반영 실패</Resolvable>;
}

function renderPane() {
  return render(<MemoryRouter><PaneDevice /></MemoryRouter>);
}

describe("PaneDevice 경고·알림 → 해결", () => {
  beforeEach(() => {
    mocks.user = { uid: "uid-a" };
    mocks.signIn.mockReset();
    mocks.toastCalls.length = 0;
    mocks.update.mockReset().mockResolvedValue(undefined);
    mocks.broadcast.mockReset().mockResolvedValue({
      updated: 0,
      failures: [{ deviceId: "d2", deviceName: "폰 B", kind: "network", error: "offline" }],
    });
  });

  async function failedToastTarget() {
    const view = renderPane();
    const rider = screen.getByTestId("S6-2-1");
    fireEvent.click(within(rider).getByRole("button", { name: /편집|edit/i }));
    fireEvent.click(within(rider).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.toastCalls.some(([, type]) => type === "error")).toBe(true));
    const [, , options] = mocks.toastCalls.find(([, type]) => type === "error")!;
    view.unmount();
    return options!.resolve!;
  }

  it("반영 실패 알림은 실패한 기기를 주소로 가리킨다", async () => {
    const resolve = await failedToastTarget();
    expect(resolve).toEqual({ to: "/settings/device?device=d2" });
  });

  it("다른 화면에서 알림을 누르면 새로 열린 기기 설정이 실패한 기기를 고르고 주소에서 지운다", async () => {
    const { to } = await failedToastTarget();
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Routes><Route path="*" element={<Elsewhere to={to!} />} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("link", { name: "반영 실패" }));
    await waitFor(() => expect(within(screen.getByTestId("S6-0-1")).getByText("폰 B")).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("search").textContent).toBe(""));
  });

  it("같은 화면에서 A 편집 중 알림을 누르면 B 로 바뀌고 편집이 풀린다 — A 초안이 B 에 저장되지 않는다", async () => {
    const { to } = await failedToastTarget();
    render(
      <MemoryRouter initialEntries={["/settings/device"]}>
        <Routes><Route path="*" element={<><PaneDevice /><Resolvable resolve={{ to }}>반영 실패</Resolvable><SearchProbe /></>} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.click(within(screen.getByTestId("S6-2-1")).getByRole("button", { name: /편집|edit/i }));
    expect(within(screen.getByTestId("S6-2-1")).getByRole("button", { name: "저장" })).toBeTruthy();
    expect(within(screen.getByTestId("S6-0-1")).getByText("폰 A")).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "반영 실패" }));
    await waitFor(() => expect(within(screen.getByTestId("S6-0-1")).getByText("폰 B")).toBeTruthy());
    const riderAfter = screen.getByTestId("S6-2-1");
    expect(within(riderAfter).queryByRole("button", { name: "저장" })).toBeNull();
    expect(within(riderAfter).getByRole("button", { name: /편집|edit/i })).toBeTruthy();
  });

  it("현재 계정 목록에 없는 기기 ID 는 무시하고 주소에서 지운다", async () => {
    render(
      <MemoryRouter initialEntries={["/settings/device?device=other-account-device"]}>
        <Routes><Route path="*" element={<><PaneDevice /><SearchProbe /></>} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId("search").textContent).toBe(""));
    expect(within(screen.getByTestId("S6-0-1")).getByText("폰 A")).toBeTruthy();
  });

  it("로그인 필요 문구를 누르면 로그인 창을 연다(새 버튼 없음)", () => {
    mocks.user = null;
    renderPane();
    const card = screen.getByTestId("S6.guest");
    const message = within(card).getByRole("button");
    expect(within(card).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(message);
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
  });

  it("기기 머리의 이름 변경·삭제·새로고침은 글자 없는 아이콘 버튼이고 이름 변경은 기기 이름 옆에 있다", () => {
    renderPane();
    const header = screen.getByTestId("S6-0-1");
    for (const name of ["디바이스 이름 변경", "디바이스 삭제", "새로고침"]) {
      const button = within(header).getByRole("button", { name });
      expect(button).toHaveClass("ds-btn--icon-only");
      expect(button).toHaveAttribute("title", name);
      expect(button.textContent).toBe("");
    }
    expect(header.querySelector(".settings-device-header__selector")).toContainElement(
      within(header).getByRole("button", { name: "디바이스 이름 변경" }),
    );
    fireEvent.click(within(header).getByRole("button", { name: "새로고침" }));
    expect(mocks.reload).toHaveBeenCalled();
  });

  it("설정 카드의 편집은 글자 없는 연필 아이콘 버튼이다", () => {
    renderPane();
    const edit = within(screen.getByTestId("S6-2-1")).getByRole("button", { name: "편집" });
    expect(edit).toHaveClass("ds-btn--icon-only");
    expect(edit).toHaveAttribute("title", "편집");
    expect(edit.textContent).toBe("");
  });

  it("옛 구성 카드의 자전거별 데이터 페이지 열기는 화살표 아이콘 링크이고 가져오기는 글자 버튼 그대로다", () => {
    renderPane();
    const link = screen.getByRole("link", { name: "자전거별 데이터 페이지 열기" });
    expect(link).toHaveAttribute("href", "/ko/settings/device?panel=data-pages");
    expect(link).toHaveAttribute("title", "자전거별 데이터 페이지 열기");
    expect(link).toHaveClass("ds-btn--icon-only");
    expect(link).not.toHaveClass("ds-btn--secondary");
    expect(link.textContent).toBe("");
    expect(screen.getByTestId("legacy-layout-import-open")).toHaveTextContent("이 구성을 자전거로 가져오기");
  });
});
