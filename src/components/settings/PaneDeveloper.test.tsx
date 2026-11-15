import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PaneDeveloper } from "./PaneDeveloper";
import i18n from "i18next";
import enSettings from "../../i18n/resources/en/settings.json";

vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: vi.fn() }) }));
const listKeys = vi.hoisted(() => vi.fn());
vi.mock("../../services/personalDataApi", () => ({
  listPersonalApiKeys: listKeys,
  createPersonalApiKey: vi.fn(),
  revokePersonalApiKey: vi.fn(),
}));

beforeEach(async () => {
  listKeys.mockReset().mockResolvedValue([]);
  i18n.addResourceBundle("en", "settings", enSettings, true, true);
  await i18n.changeLanguage("ko");
});
afterEach(async () => { await i18n.changeLanguage("ko"); });

describe("PaneDeveloper locale", () => {
  it("localizes Korean labels and default name while keeping wire scopes intact", async () => {
    render(<MemoryRouter><PaneDeveloper /></MemoryRouter>);
    expect(await screen.findByText("개인 데이터 API 키 만들기")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /키 이름/ })).toHaveValue("개인 대시보드");
    expect(screen.getByRole("link", { name: "활용 예시 →" })).toHaveAttribute("href", "/ko/explore/recipes/examples");
    expect(screen.getByRole("link", { name: "API 문서" }).getAttribute("href")).toMatch(/\/api\/v1\/docs$/);
    expect(screen.getByRole("button", { name: "키 생성" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "profile:read" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "activities:read" })).toBeInTheDocument();
    expect(await screen.findByText(/아직 생성된 API 키가 없어요/)).toBeInTheDocument();
  });

  it("uses the English default on mount and preserves edited names on locale changes", async () => {
    await i18n.changeLanguage("en");
    render(<MemoryRouter><PaneDeveloper /></MemoryRouter>);
    const input = screen.getByRole("textbox", { name: /Key name/ });
    expect(input).toHaveValue("Personal dashboard");
    await userEvent.clear(input);
    await userEvent.type(input, "My reporting key");
    await act(async () => { await i18n.changeLanguage("ko"); });
    expect(screen.getByRole("textbox", { name: /키 이름/ })).toHaveValue("My reporting key");
  });
});

describe("PaneDeveloper load failure", () => {
  /** 경고·알림 → 해결: 목록을 못 불러왔을 때 「키 없음」으로 속이지 않고, 실패 문구를 누르면 다시 불러온다. */
  it("shows the failure instead of the empty state and reloads when the message is tapped", async () => {
    listKeys.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([
      { id: "k1", name: "My key", prefix: "orid_ab", scopes: ["profile:read"], createdAt: 1, lastUsedAt: 0 },
    ]);
    render(<MemoryRouter><PaneDeveloper /></MemoryRouter>);
    const message = await screen.findByRole("button", { name: "API 키를 불러오지 못했습니다" });
    expect(screen.queryByText(/아직 생성된 API 키가 없어요/)).toBeNull();
    const buttonsBefore = screen.getAllByRole("button").length;
    await userEvent.click(message);
    expect(await screen.findByText("My key")).toBeInTheDocument();
    expect(listKeys).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "API 키를 불러오지 못했습니다" })).toBeNull();
    // 실패 문구 자리를 빼면 버튼 수는 키 행의 폐기 버튼만큼만 늘었다(새 버튼 없음).
    expect(screen.getAllByRole("button").length).toBe(buttonsBefore);
  });
});

describe("PaneDeveloper key list refresh", () => {
  it("키 목록 새로고침은 카드 머리의 글자 없는 아이콘 버튼이다", async () => {
    render(<MemoryRouter><PaneDeveloper /></MemoryRouter>);
    const refresh = screen.getByRole("button", { name: "새로고침" });
    expect(refresh).toHaveClass("ds-btn--icon-only");
    expect(refresh).toHaveAttribute("title", "새로고침");
    expect(refresh.textContent).toBe("");
    await screen.findByText(/아직 생성된 API 키가 없어요/);
    await userEvent.click(refresh);
    await waitFor(() => expect(listKeys).toHaveBeenCalledTimes(2));
  });
});
