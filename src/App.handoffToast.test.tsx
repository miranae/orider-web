import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), showToast: vi.fn() }));
vi.mock("./components/Layout", () => ({ default: () => <div><Outlet /></div> }));
vi.mock("./services/appHandoff", async importOriginal => ({ ...await importOriginal<typeof import("./services/appHandoff")>(), didHandoffFail: () => true }));
vi.mock("./contexts/AuthContext", async importOriginal => ({
  ...await importOriginal<typeof import("./contexts/AuthContext")>(),
  useAuth: () => ({ user: null, profile: null, loading: false, signIn: mocks.signIn }),
}));
vi.mock("./contexts/ToastContext", async importOriginal => ({
  ...await importOriginal<typeof import("./contexts/ToastContext")>(),
  useToast: () => ({ showToast: mocks.showToast, toasts: [], dismissToast: vi.fn() }),
}));

import App from "./App";

describe("app handoff failure toast", () => {
  it("앱 로그인 인계 실패 토스트의 로그인 행동이 로그인 창을 연다", async () => {
    render(<MemoryRouter initialEntries={["/ko/about"]}><App /></MemoryRouter>);
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith(expect.any(String), "error", expect.objectContaining({ action: expect.any(Object) })));
    const call = mocks.showToast.mock.calls.find(([, type, options]) => type === "error" && options?.action)!;
    expect(call[2].action.label).toBe("로그인");
    call[2].action.onClick();
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
  });
});
