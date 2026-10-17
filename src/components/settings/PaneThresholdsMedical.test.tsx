import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaneThresholds } from "./PaneThresholds";
import { PaneMedical } from "./PaneMedical";

const mocks = vi.hoisted(() => ({
  profile: { ftp: 250, maxHr: 190, lthr: 165 } as Record<string, unknown>,
  metricCommand: vi.fn(), syncDevices: vi.fn(), getDoc: vi.fn(), updateDoc: vi.fn(), setDoc: vi.fn(), persist: vi.fn(), toast: vi.fn(),
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, ...parts: string[]) => parts.join("/"),
  getDoc: (...args: unknown[]) => mocks.getDoc(...args), updateDoc: (...args: unknown[]) => mocks.updateDoc(...args),
  setDoc: (...args: unknown[]) => mocks.setDoc(...args) }));
vi.mock("../../services/firebase", () => ({ firestore: {}, functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.metricCommand }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("../../services/syncRiderMetrics", () => ({ persistRiderMetrics: (...args: unknown[]) => mocks.persist(...args), syncRiderWeightToBikeProfiles: vi.fn(), syncRiderMetricsToDevices: (...args: unknown[]) => mocks.syncDevices(...args) }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "u1" }, profile: mocks.profile }) }));
vi.mock("../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: "metric" }) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: vi.fn(async () => true) }) }));
vi.mock("../../hooks/useBikeProfiles", () => ({ useBikeProfiles: () => ({ profiles: [] }) }));
vi.mock("./ThresholdSuggestionBanner", () => ({ ThresholdSuggestionBanner: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile = { ftp: 250, maxHr: 190, lthr: 165 };
  mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ftp: 250, maxHr: 190, lthr: 165, weightKg: 70, bloodType: "A+", medications: "old", emergencyContact: { name: "Incomplete", phone: "" } }) });
  mocks.updateDoc.mockResolvedValue(undefined); mocks.setDoc.mockResolvedValue(undefined);
  mocks.persist.mockResolvedValue({ failures: [] });
  mocks.metricCommand.mockResolvedValue({ data: { revision: "confirmed-r1" } });
  mocks.syncDevices.mockResolvedValue({ failures: [] });
});
afterEach(cleanup);

describe("separate threshold and private medical writes", () => {
  it("LTHR-only save leaves FTP/device/medical untouched and ignores invalid emergency data", async () => {
    render(<PaneThresholds />);
    await waitFor(() => expect(screen.getByLabelText(/LTHR/)).toHaveValue("165"));
    fireEvent.change(screen.getByLabelText(/LTHR/), { target: { value: "170" } });
    fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
    await waitFor(() => expect(mocks.updateDoc).toHaveBeenCalledWith("users/u1", { lthr: 170 }));
    expect(mocks.persist).not.toHaveBeenCalled(); expect(mocks.setDoc).not.toHaveBeenCalled();
  });
  it("FTP edit syncs only FTP once and a subsequent save is a no-op", async () => {
    render(<PaneThresholds />);
    const input = screen.getByLabelText(/FTP.*training.fieldFtpHint/);
    await waitFor(() => expect(input).toHaveValue("250"));
    fireEvent.change(input, { target: { value: "260" } });
    fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("training.saved"));
    expect(mocks.persist).toHaveBeenCalledWith("u1", { ftp: 260, maxHr: undefined, weightKg: undefined }, { ftpHistorySource: "manual" });
    fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
    expect(mocks.persist).toHaveBeenCalledTimes(1); expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
  it("an explicit clear writes only that field and profile snapshots preserve a draft", async () => {
    const { rerender } = render(<PaneThresholds />);
    const input = screen.getByLabelText(/LTHR/);
    await waitFor(() => expect(input).toHaveValue("165"));
    fireEvent.change(input, { target: { value: "" } });
    mocks.profile = { ftp: 300, lthr: 175 }; rerender(<PaneThresholds />);
    expect(input).toHaveValue(""); expect(mocks.getDoc).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
    await waitFor(() => expect(mocks.updateDoc).toHaveBeenCalledWith("users/u1", { lthr: null }));
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it("load failure prevents an empty medical overwrite and allows a fresh read", async () => {
    mocks.getDoc.mockRejectedValueOnce(new Error("offline"));
    render(<PaneMedical />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    screen.getAllByRole("button", { name: "training.btnSave" }).forEach(button => expect(button).toBeDisabled());
    expect(mocks.setDoc).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "common:button.retry" }));
    await waitFor(() => expect(screen.getByLabelText(/training.fieldMedications/)).toHaveValue("old"));
  });
  it("blocks both medical saves until private data is loaded, preserving existing fields", async () => {
    let resolve!: (value: unknown) => void;
    mocks.getDoc.mockReturnValue(new Promise(value => { resolve = value; }));
    render(<PaneMedical />);
    screen.getAllByRole("button", { name: "training.btnSave" }).forEach(button => expect(button).toBeDisabled());
    resolve({ exists: () => true, data: () => ({ bloodType: "B+", medications: "preserved" }) });
    await waitFor(() => expect(screen.getByLabelText(/training.fieldMedications/)).toHaveValue("preserved"));
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
  it("medical saves don't validate or write emergency; profile snapshot doesn't replace drafts", async () => {
    const { rerender } = render(<PaneMedical />);
    const medication = screen.getByLabelText(/training.fieldMedications/);
    await waitFor(() => expect(medication).toHaveValue("old"));
    fireEvent.change(medication, { target: { value: "new" } });
    mocks.profile = { medications: "snapshot" }; rerender(<PaneMedical />);
    expect(medication).toHaveValue("new"); expect(mocks.getDoc).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getAllByRole("button", { name: "training.btnSave" })[0]);
    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledWith("users/u1/private/medical", { bloodType: "A+", medications: "new", allergies: null }, { merge: true }));
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
  it("partial migration reads legacy contact from root while respecting explicit private clears", async () => {
    mocks.profile = {};
    mocks.getDoc.mockImplementation(async (path: string) => ({ exists: () => true, data: () => path.endsWith("private/medical")
      ? { bloodType: null, medications: null, allergies: null }
      : { bloodType: "B+", medications: "legacy", emergencyContact: { name: "Legacy", phone: "123" } } }));
    render(<PaneMedical />);
    await waitFor(() => expect(screen.getByLabelText("training.fieldEmergencyName")).toHaveValue("Legacy"));
    expect(screen.getByLabelText(/training.fieldMedications/)).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "training.fieldBloodType" })).toHaveTextContent("training.bloodTypeNone");
  });
  it("emergency save writes only contact and validates the pair independently", async () => {
    render(<PaneMedical />);
    const phone = screen.getByLabelText("training.fieldEmergencyPhone");
    await waitFor(() => expect(phone).not.toBeDisabled());
    fireEvent.click(screen.getAllByRole("button", { name: "training.btnSave" })[1]);
    expect(mocks.toast).toHaveBeenCalledWith("personal.phoneRequired"); expect(mocks.setDoc).not.toHaveBeenCalled();
    fireEvent.change(phone, { target: { value: "01012345678" } });
    fireEvent.click(screen.getAllByRole("button", { name: "training.btnSave" })[1]);
    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalledWith("users/u1/private/medical", { emergencyContact: { name: "Incomplete", phone: "01012345678" } }, { merge: true }));
  });
});

 it("confirms the unchanged 70kg through the revision command without an automatic write on open", async () => {
   render(<PaneThresholds />);
   await waitFor(() => expect(screen.getByRole("button", { name: "training.confirmWeight" })).toBeEnabled());
   expect(mocks.metricCommand).not.toHaveBeenCalled();
   fireEvent.click(screen.getByRole("button", { name: "training.confirmWeight" }));
   await waitFor(() => expect(mocks.metricCommand).toHaveBeenCalledWith({ mutationId: expect.any(String), patch: { weightKg: 70 },
     expectedRevisions: { weightKg: null, thresholdPace: null, css: null } }));
   await waitFor(() => expect(screen.queryByRole("button", { name: "training.confirmWeight" })).not.toBeInTheDocument());
   expect(mocks.updateDoc).not.toHaveBeenCalled();
 });

it.each([
  { field: "ftp", value: 200, label: /FTP.*training.fieldFtpHint/ },
  { field: "thresholdPace", value: 275, label: /training.fieldThresholdPace/ },
  { field: "css", value: 108, label: /^CSS/ },
])("명시 확인은 같은 $field 기본값도 저장하며 폼을 열기만 해서는 확인하지 않는다", async ({ field, value, label }) => {
  mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => ({
    ftp: 250, maxHr: 190, lthr: 165, weightKg: 68, thresholdPace: 260, css: 100, [field]: value,
  }) });
  render(<PaneThresholds />);
  await waitFor(() => expect(screen.getByRole("button", { name: "training.confirmThreshold" })).toBeEnabled());
  expect(screen.getByLabelText(label)).toBeInTheDocument();
  expect(mocks.persist).not.toHaveBeenCalled();
  expect(mocks.metricCommand).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "training.confirmThreshold" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "training.confirmThreshold" })).toBeNull());
  if (field === "ftp") {
    expect(mocks.persist).toHaveBeenCalledWith("u1", { ftp: 200, maxHr: undefined, weightKg: undefined }, expect.any(Object));
    expect(mocks.metricCommand).not.toHaveBeenCalled();
  } else {
    expect(mocks.metricCommand).toHaveBeenCalledWith({ mutationId: expect.any(String), patch: { [field]: value },
      expectedRevisions: { weightKg: null, thresholdPace: null, css: null } });
    expect(mocks.persist).not.toHaveBeenCalled();
  }
  fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
  expect(field === "ftp" ? mocks.persist : mocks.metricCommand).toHaveBeenCalledTimes(1);
  expect(mocks.updateDoc).not.toHaveBeenCalled();
});
