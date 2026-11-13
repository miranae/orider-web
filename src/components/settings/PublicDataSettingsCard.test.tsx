import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18n from "i18next";
import enSettings from "../../i18n/resources/en/settings.json";
import { beforeEach, expect, it, vi } from "vitest";
import { PublicDataSettingsCard } from "./PublicDataSettingsCard";
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), user: { uid: "owner", isAnonymous: false } }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("../../services/firebase", () => ({ firestore: {} }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, ...parts: string[]) => parts.join("/"), getDocFromServer: mocks.read, setDoc: mocks.write }));
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue({ data: () => ({}) }); mocks.write.mockResolvedValue(undefined); });
it("설정 읽기 전에는 조작을 막고 기준값은 기본 비공개이며 항목별로 저장한다", async () => {
  let finish!: (value: unknown) => void;
  mocks.read.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<PublicDataSettingsCard />);
  expect(screen.getByRole("switch", { name: "심박" })).toBeDisabled();
  await act(async () => finish({ data: () => ({ power: false }) }));
  expect(screen.getByRole("switch", { name: "파워" })).not.toBeChecked();
  expect(screen.getByRole("switch", { name: /내 기준값/ })).not.toBeChecked();
  fireEvent.click(screen.getByRole("switch", { name: "심박" }));
  await waitFor(() => expect(mocks.write).toHaveBeenCalledWith("users/owner/private/public_data_settings", { heartRate: false }, { merge: true }));
});
it("저장이 실패하면 공개 범위가 바뀐 것처럼 표시하지 않는다", async () => {
  mocks.write.mockRejectedValue(Error("offline"));
  render(<PublicDataSettingsCard />);
  await waitFor(() => expect(screen.getByRole("switch", { name: "심박" })).toBeEnabled());
  fireEvent.click(screen.getByRole("switch", { name: "심박" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("저장하지 못했습니다");
  expect(screen.getByRole("switch", { name: "심박" })).toBeChecked();
});


it("영어 화면에서 공개 항목과 오류와 재시도를 번역한다", async () => {
  i18n.addResourceBundle("en", "settings", enSettings, true, true);
  await i18n.changeLanguage("en");
  try {
    mocks.read.mockRejectedValue(Error("offline"));
    render(<PublicDataSettingsCard />);
    expect(screen.getByRole("switch", { name: "Heart rate" })).toBeDisabled();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load public data settings.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  } finally { await i18n.changeLanguage("ko"); }
});
