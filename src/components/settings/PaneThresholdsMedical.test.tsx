import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaneThresholds } from "./PaneThresholds";
import { ProfileBodyEditor } from "./ProfileBodyEditor";
import { PaneMedical } from "./PaneMedical";

const mocks = vi.hoisted(() => ({
  units: "metric",
  bikes: [] as { id: string }[], confirm: vi.fn(), syncBikes: vi.fn(),
  profile: { ftp: 250, maxHr: 190, lthr: 165 } as Record<string, unknown>,
  metricCommand: vi.fn(), syncDevices: vi.fn(), getDoc: vi.fn(), updateDoc: vi.fn(), setDoc: vi.fn(), persist: vi.fn(), toast: vi.fn(),
}));
vi.mock("../LocalizedLink", () => ({ LocalizedLink: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <a href={to} {...props}>{children}</a> }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, values?: Record<string, string>) => key === "training.bodyReference" ? `${values?.height} ${values?.heightUnit} · ${values?.weight} ${values?.weightUnit}` : key }) }));
vi.mock("firebase/firestore", () => ({ doc: (_db: unknown, ...parts: string[]) => parts.join("/"),
  getDoc: (...args: unknown[]) => mocks.getDoc(...args), updateDoc: (...args: unknown[]) => mocks.updateDoc(...args),
  setDoc: (...args: unknown[]) => mocks.setDoc(...args) }));
vi.mock("../../services/firebase", () => ({ firestore: {}, functions: {} }));
vi.mock("firebase/functions", () => ({ httpsCallable: () => mocks.metricCommand }));
vi.mock("../../services/errorLogger", () => ({ logClientError: vi.fn() }));
vi.mock("../../services/syncRiderMetrics", () => ({ persistRiderMetrics: (...args: unknown[]) => mocks.persist(...args), syncRiderWeightToBikeProfiles: (...args: unknown[]) => mocks.syncBikes(...args), syncRiderMetricsToDevices: (...args: unknown[]) => mocks.syncDevices(...args) }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "u1" }, profile: mocks.profile }) }));
vi.mock("../../contexts/LocaleContext", () => ({ useLocale: () => ({ units: mocks.units }) }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock("../../contexts/DialogContext", () => ({ useDialog: () => ({ confirm: mocks.confirm }) }));
vi.mock("../../hooks/useBikeProfiles", () => ({ useBikeProfiles: () => ({ profiles: mocks.bikes }) }));
vi.mock("./ThresholdSuggestionBanner", () => ({ ThresholdSuggestionBanner: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.units = "metric";
  mocks.bikes = [];
  mocks.confirm.mockResolvedValue(true);
  mocks.syncBikes.mockResolvedValue(undefined);
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
   render(<ProfileBodyEditor />);
   await waitFor(() => expect(screen.getByRole("button", { name: "training.confirmWeight" })).toBeEnabled());
   expect(mocks.metricCommand).not.toHaveBeenCalled();
   fireEvent.click(screen.getByRole("button", { name: "training.confirmWeight" }));
   await waitFor(() => expect(mocks.metricCommand).toHaveBeenCalledWith({ mutationId: expect.any(String), patch: { weightKg: 70 },
     expectedRevisions: { weightKg: null } }));
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
      expectedRevisions: { thresholdPace: null, css: null } });
    expect(mocks.persist).not.toHaveBeenCalled();
  }
  fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
  expect(field === "ftp" ? mocks.persist : mocks.metricCommand).toHaveBeenCalledTimes(1);
  expect(mocks.updateDoc).not.toHaveBeenCalled();
});


describe("compact body reference beside FTP settings", () => {
  it.each([
    { units: "metric", weightKg: 76, heightCm: 181, summary: "181 cm · 76 kg" },
    { units: "imperial", weightKg: 76, heightCm: 181, summary: "71.3 in · 167.6 lb" },
    { units: "metric", weightKg: undefined, heightCm: undefined, summary: "— cm · — kg" },
  ])("keeps $units body reference compact and editing explicit ($summary)", async ({ units, weightKg, heightCm, summary }) => {
    mocks.units = units;
    mocks.getDoc.mockResolvedValue({ data: () => ({ ftp: 250, weightKg, heightCm }) });
    render(<PaneThresholds />);
    await waitFor(() => expect(screen.getByText(summary)).toBeInTheDocument());
    const reference = screen.getByTestId("K1-5-6");
    expect(screen.getByTestId("K1-5-3")).toContainElement(reference);
    expect(reference.querySelector("input")).toBeNull();
    expect(screen.getByRole("link", { name: "training.editBody" })).toHaveAttribute("href", "/settings/account#body-info");
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.metricCommand).not.toHaveBeenCalled();
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});


it("profile body editing saves only body fields and preserves revision after partial height failure", async () => {
  mocks.getDoc.mockResolvedValue({ data: () => ({ weightKg: 68, heightCm: 172, weightRevision: "r0" }) });
  render(<ProfileBodyEditor />);
  await waitFor(() => expect(screen.getByLabelText("training.fieldWeight")).toHaveValue("68"));
  fireEvent.change(screen.getByLabelText("training.fieldWeight"), { target: { value: "69" } });
  fireEvent.change(screen.getByLabelText("training.fieldHeight"), { target: { value: "173" } });
  mocks.updateDoc.mockRejectedValueOnce(new Error("height offline"));
  fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining("training.saveFailed")));
  expect(mocks.metricCommand).toHaveBeenCalledWith({ mutationId: expect.any(String), patch: { weightKg: 69 }, expectedRevisions: { weightKg: "r0" } });
  expect(mocks.persist).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("training.saved"));
  expect(mocks.metricCommand).toHaveBeenCalledTimes(1);
  expect(mocks.updateDoc).toHaveBeenLastCalledWith("users/u1", { heightCm: 173 });
});

it("live body profile refresh updates FTP reference without discarding FTP draft", async () => {
  const { rerender } = render(<PaneThresholds />);
  await waitFor(() => expect(screen.getByLabelText(/FTP.*training.fieldFtpHint/)).toHaveValue("250"));
  fireEvent.change(screen.getByLabelText(/FTP.*training.fieldFtpHint/), { target: { value: "260" } });
  mocks.profile = { ...mocks.profile, weightKg: 65, heightCm: 175 };
  rerender(<PaneThresholds />);
  expect(screen.getByText("175 cm · 65 kg")).toBeInTheDocument();
  expect(screen.getByLabelText(/FTP.*training.fieldFtpHint/)).toHaveValue("260");
  fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
  await waitFor(() => expect(mocks.persist).toHaveBeenCalled());
  expect(mocks.metricCommand).not.toHaveBeenCalled();
  expect(mocks.updateDoc).not.toHaveBeenCalled();
});


it("profile imperial editor labels and converts only the edited measurement", async () => {
  mocks.units = "imperial";
  mocks.getDoc.mockResolvedValue({ data: () => ({ weightKg: 76, heightCm: 181, weightRevision: "r0" }) });
  render(<ProfileBodyEditor />);
  await waitFor(() => expect(screen.getByLabelText("training.fieldWeightLb")).toHaveValue("167.6"));
  expect(screen.getByLabelText("training.fieldHeightIn")).toHaveValue("71.3");
  fireEvent.change(screen.getByLabelText("training.fieldWeightLb"), { target: { value: "150" } });
  fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
  await waitFor(() => expect(mocks.metricCommand).toHaveBeenCalledWith({ mutationId: expect.any(String), patch: { weightKg: 68 }, expectedRevisions: { weightKg: "r0" } }));
  expect(mocks.updateDoc).not.toHaveBeenCalled();
});


it("a weight revision conflict prevents height writes and downstream sync", async () => {
  mocks.metricCommand.mockRejectedValueOnce(new Error("revision conflict"));
  render(<ProfileBodyEditor />);
  await waitFor(() => expect(screen.getByLabelText("training.fieldWeight")).toHaveValue("70"));
  fireEvent.change(screen.getByLabelText("training.fieldWeight"), { target: { value: "72" } });
  fireEvent.change(screen.getByLabelText("training.fieldHeight"), { target: { value: "175" } });
  fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining("revision conflict")));
  expect(mocks.updateDoc).not.toHaveBeenCalled();
  expect(mocks.syncDevices).not.toHaveBeenCalled();
  expect(mocks.syncBikes).not.toHaveBeenCalled();
});

it("reports a device sync partial failure after body profile commit", async () => {
  mocks.syncDevices.mockResolvedValueOnce({ failures: [{ deviceId: "d1", deviceName: "Bike computer" }] });
  render(<ProfileBodyEditor />);
  await waitFor(() => expect(screen.getByLabelText("training.fieldWeight")).toHaveValue("70"));
  fireEvent.change(screen.getByLabelText("training.fieldWeight"), { target: { value: "72" } });
  fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("training.syncPartialFail"));
  expect(mocks.metricCommand).toHaveBeenCalledTimes(1);
  expect(mocks.syncDevices).toHaveBeenCalledWith("u1", { weightKg: 72 });
  expect(mocks.toast).not.toHaveBeenCalledWith("training.saved");
});

it("declining multi-bike weight sync preserves bikes after profile and device updates", async () => {
  mocks.bikes = [{ id: "b1" }, { id: "b2" }];
  mocks.confirm.mockResolvedValueOnce(false);
  render(<ProfileBodyEditor />);
  await waitFor(() => expect(screen.getByLabelText("training.fieldWeight")).toHaveValue("70"));
  fireEvent.change(screen.getByLabelText("training.fieldWeight"), { target: { value: "72" } });
  fireEvent.click(screen.getByRole("button", { name: "training.btnSave" }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("training.saved"));
  expect(mocks.confirm).toHaveBeenCalledWith("training.syncBikeConfirm");
  expect(mocks.syncDevices).toHaveBeenCalledWith("u1", { weightKg: 72 });
  expect(mocks.syncBikes).not.toHaveBeenCalled();
});


it("running thresholds appear before cycling while retaining all fields and run HR preview", async () => {
  render(<PaneThresholds discipline="run" />);
  await waitFor(() => expect(screen.getByLabelText(/FTP.*training.fieldFtpHint/)).toHaveValue("250"));
  const pace = screen.getByLabelText(/training.fieldThresholdPace/);
  const ftp = screen.getByLabelText(/FTP.*training.fieldFtpHint/);
  expect(pace.compareDocumentPosition(ftp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByLabelText(/^CSS/)).toBeInTheDocument();
  expect(screen.getByText("training.cardHrZones · training.settingsSport.run")).toBeInTheDocument();
});
