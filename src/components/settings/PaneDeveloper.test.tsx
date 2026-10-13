import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaneDeveloper } from "./PaneDeveloper";
import i18n from "i18next";
import enSettings from "../../i18n/resources/en/settings.json";

vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: vi.fn() }) }));
vi.mock("../../services/personalDataApi", () => ({
  listPersonalApiKeys: vi.fn().mockResolvedValue([]),
  createPersonalApiKey: vi.fn(),
  revokePersonalApiKey: vi.fn(),
}));

beforeEach(async () => {
  i18n.addResourceBundle("en", "settings", enSettings, true, true);
  await i18n.changeLanguage("ko");
});
afterEach(async () => { await i18n.changeLanguage("ko"); });

describe("PaneDeveloper locale", () => {
  it("localizes Korean labels and default name while keeping wire scopes intact", async () => {
    render(<PaneDeveloper />);
    expect(await screen.findByText("개인 데이터 API 키 만들기")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /키 이름/ })).toHaveValue("개인 대시보드");
    expect(screen.getByRole("button", { name: "키 생성" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "profile:read" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "activities:read" })).toBeInTheDocument();
    expect(await screen.findByText(/아직 생성된 API 키가 없어요/)).toBeInTheDocument();
  });

  it("uses the English default on mount and preserves edited names on locale changes", async () => {
    await i18n.changeLanguage("en");
    render(<PaneDeveloper />);
    const input = screen.getByRole("textbox", { name: /Key name/ });
    expect(input).toHaveValue("Personal dashboard");
    await userEvent.clear(input);
    await userEvent.type(input, "My reporting key");
    await act(async () => { await i18n.changeLanguage("ko"); });
    expect(screen.getByRole("textbox", { name: /키 이름/ })).toHaveValue("My reporting key");
  });
});
