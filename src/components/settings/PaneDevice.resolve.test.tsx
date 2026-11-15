import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_SETTINGS } from "@shared/types/deviceSettings";
import type { Resolve } from "../redesign/states/Resolvable";

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

  it("다른 기기 반영 실패 알림을 누르면 실패한 기기를 골라 기기 설정에 둔다", async () => {
    renderPane();
    const rider = screen.getByTestId("S6-2-1");
    fireEvent.click(within(rider).getByRole("button", { name: /편집|edit/i }));
    fireEvent.click(within(rider).getByRole("button", { name: "저장" }));

    await waitFor(() => expect(mocks.toastCalls.some(([, type]) => type === "error")).toBe(true));
    const [, , options] = mocks.toastCalls.find(([, type]) => type === "error")!;
    expect(options?.resolve?.to).toBe("/settings/device");
    // 처음 기기(폰 A)가 선택돼 있다가, 알림을 누르면 실패한 기기(폰 B)로 바뀐다.
    expect(within(screen.getByTestId("S6-0-1")).getByText("폰 A")).toBeTruthy();
    act(() => options!.resolve!.onClick!());
    await waitFor(() => expect(within(screen.getByTestId("S6-0-1")).getByText("폰 B")).toBeTruthy());
  });

  it("계정이 바뀐 뒤 누른 알림은 선택을 바꾸지 않는다", async () => {
    const view = renderPane();
    const rider = screen.getByTestId("S6-2-1");
    fireEvent.click(within(rider).getByRole("button", { name: /편집|edit/i }));
    fireEvent.click(within(rider).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.toastCalls.some(([, type]) => type === "error")).toBe(true));
    const [, , options] = mocks.toastCalls.find(([, type]) => type === "error")!;

    mocks.user = { uid: "uid-b" };
    view.rerender(<MemoryRouter><PaneDevice /></MemoryRouter>);
    act(() => options!.resolve!.onClick!());
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
});
