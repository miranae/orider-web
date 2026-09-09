import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import StravaSummarySettings from "./StravaSummarySettings";

const mocks = vi.hoisted(() => ({ settings: vi.fn(), ready: vi.fn(), functions: {} }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.settings }));
vi.mock("../../contexts/FirebaseServicesContext", () => ({ useFirebaseServices: () => ({ functions: mocks.functions, ensureAppCheckReady: mocks.ready }) }));
beforeEach(() => {
  mocks.settings.mockReset().mockResolvedValue({ data: { enabled: true, lang: "en", enabledAt: 123 } });
  mocks.ready.mockReset().mockResolvedValue(undefined);
});

it("reads the existing setting on mount and saves only an explicit toggle, preserving its language", async () => {
  render(<StravaSummarySettings />);
  await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
  expect(mocks.settings.mock.calls).toEqual([[{}]]);
  mocks.settings.mockResolvedValue({ data: { enabled: false, lang: "en", enabledAt: 123 } });
  fireEvent.click(screen.getByRole("switch"));
  await waitFor(() => expect(screen.getByRole("switch")).not.toBeChecked());
  expect(mocks.settings.mock.calls).toEqual([[{}], [{ enabled: false, lang: "en" }]]);
});

it("retries a failed read without resetting the existing opt-in and preserves it after save failure", async () => {
  mocks.settings.mockRejectedValueOnce(new Error("offline"));
  render(<StravaSummarySettings />);
  await screen.findByText("stravaSummary.settingsError");
  expect(screen.getByRole("switch")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "stravaSummary.loadSettings" }));
  await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
  expect(mocks.settings.mock.calls).toEqual([[{}], [{}]]);
  mocks.settings.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(screen.getByRole("switch"));
  await screen.findByText("stravaSummary.settingsError");
  expect(screen.getByRole("switch")).toBeChecked();
  expect(screen.getByRole("switch")).toBeEnabled();
});

it("discards a late save response after the connected account changes", async () => {
  const { rerender } = render(<StravaSummarySettings key="owner" />);
  await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
  let finish!: (value: unknown) => void;
  mocks.settings.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  fireEvent.click(screen.getByRole("switch"));
  await waitFor(() => expect(mocks.settings).toHaveBeenCalledWith({ enabled: false, lang: "en" }));
  rerender(<StravaSummarySettings key="other" />);
  await waitFor(() => expect(screen.getByRole("switch")).toBeChecked());
  await act(async () => { finish({ data: { enabled: false, lang: "en" } }); });
  expect(screen.getByRole("switch")).toBeChecked();
  expect(screen.queryByText("stravaSummary.autoDisabled")).not.toBeInTheDocument();
});
