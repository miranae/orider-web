import { act, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { getDoc, getDocs } from "firebase/firestore";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { setDocData, setCollectionDocs } from "../../__tests__/mocks/firebase";
import EventRegisterPage from "./EventRegisterPage";
import EventEditPage from "./EventEditPage";

const originalDocumentRead = vi.mocked(getDoc).getMockImplementation()!;
const originalCollectionRead = vi.mocked(getDocs).getMockImplementation()!;

const info = { name: "Capacity fixture", status: "OPEN", type: "TOUR", creatorId: "test-uid",
  startTime: Date.now() + 86_400_000, closeAt: new Date(Date.now() + 43_200_000).toISOString(), feeType: "FREE",
  categories: [{ id: "road", name: "시민", capacity: 100 }] };
const counters = { capacitySchemaVersion: 1, totalRegistered: 2, byCategory: { road: 1, _oriderUnknownCapacityCategory: 1 },
  byRsvp: { going: 0, maybe: 0, declined: 0, unresponded: 2 } };
function page(edit = false) {
  return renderWithProviders(<Routes><Route path="/ko/event/:eventId/register" element={<EventRegisterPage />} />
    <Route path="/ko/event/:eventId/edit" element={<EventEditPage />} /></Routes>,
  { route: `/ko/event/ev/${edit ? "edit" : "register"}`, authenticated: true });
}

describe("registration and editor capacity read paths", () => {
  beforeEach(() => {
    vi.mocked(getDocs).mockClear();
    vi.mocked(getDoc).mockImplementation(async (...args) => ({ ...(await originalDocumentRead(...args)), metadata: { fromCache: false, hasPendingWrites: false } }) as never);
    vi.mocked(getDocs).mockImplementation(async (ref) => originalCollectionRead({ ...ref, _collectionPath: (ref as unknown as { path: string }).path } as never));
    setDocData("events/ev", { info, counters });
    setCollectionDocs("events/ev/participants", []);
  });
  it("registers category display from public canonical counters without listing private participants", async () => {
    page();
    expect(await screen.findByText("1/100")).toBeInTheDocument();
    expect(getDocs).not.toHaveBeenCalled();
  });
  it("renders global RIDER total including unknown categories without a private list", async () => {
    page(true);
    expect(await screen.findByText(/RIDER 정원 2\/100명/)).toBeInTheDocument();
    expect(screen.getByText("1/100 (1%)")).toBeInTheDocument();
    expect(getDocs).not.toHaveBeenCalled();
  });
  it("uses already-authorized host participant data for legacy global RIDER count", async () => {
    setDocData("events/ev", { info, counters: { totalRegistered: 2, byCategory: {} } });
    setCollectionDocs("events/ev/participants", [{ id: "leader", role: "LEADER", status: "REGISTERED" },
      { id: "rider", role: "RIDER", status: "REGISTERED" }]);
    page(true);
    expect(await screen.findByText(/RIDER 정원 1\/100명/)).toBeInTheDocument();
    expect(screen.getByText("0/100 (0%)")).toBeInTheDocument();
  });
  it("does not treat an unversioned public headcount or unproven projection as category zero", async () => {
    setDocData("events/ev", { info, counters: { totalRegistered: 2, byCategory: {} } });
    page();
    expect(await screen.findByText("—/100")).toBeInTheDocument();
    expect(screen.getByText("참가자 정보를 제공할 수 없습니다.")).toBeInTheDocument();
    expect(getDocs).not.toHaveBeenCalled();
  });
  it("shows unknown and protects category deletion on a failed fallback read", async () => {
    setDocData("events/ev", { info });
    vi.mocked(getDocs).mockRejectedValueOnce(new Error("permission-denied"));
    page(true);
    expect(await screen.findByText(/RIDER 정원 —\/100명/)).toBeInTheDocument();
    expect(screen.getByText("—/100 (—)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "카테고리 삭제" })).toBeDisabled();
  });
  it("does not trust cache/pending-write snapshots as confirmed capacity", async () => {
    vi.mocked(getDoc).mockImplementation(async (...args) => (args[0] as unknown as { path: string }).path === "events/ev"
      ? { exists: () => true, id: "ev", data: () => ({ info, counters }), metadata: { fromCache: true, hasPendingWrites: true } } as never
      : originalDocumentRead(...args));
    page();
    expect(await screen.findByText("—/100")).toBeInTheDocument();
    expect(getDocs).not.toHaveBeenCalled();
  });
  it("does not apply a pending old event read after unmount", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise(resolveFn => { resolve = resolveFn; });
    vi.mocked(getDoc).mockImplementation((...args) => (args[0] as unknown as { path: string }).path === "events/ev"
      ? pending as never : originalDocumentRead(...args));
    const view = page();
    view.unmount();
    await act(async () => { resolve({ exists: () => true, id: "ev", data: () => ({ info, counters }),
      metadata: { fromCache: false, hasPendingWrites: false } }); });
    expect(getDocs).not.toHaveBeenCalled();
    expect(screen.queryByText("1/100")).not.toBeInTheDocument();
  });
});
