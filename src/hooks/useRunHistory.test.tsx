import { act, renderHook, waitFor } from "@testing-library/react";
import { getDocs } from "firebase/firestore";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../contexts/AuthContext";
import { simulateLogin, setCollectionDocs } from "../__tests__/mocks/firebase";
import { createMockActivity } from "../__tests__/fixtures/mockData";
import { useRunHistory } from "./useRunHistory";

const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter><AuthProvider>{children}</AuthProvider></MemoryRouter>;

it("accepts exact run-axis types and rejects substring false matches", async () => {
  simulateLogin({ uid: "owner" });
  setCollectionDocs("activities", [
    { id: "run", ...createMockActivity({ id: "run", userId: "owner", type: "Run" }) },
    { id: "rowing", ...createMockActivity({ id: "rowing", userId: "owner", type: "VirtualRowing" }) },
  ]);
  const { result } = renderHook(() => useRunHistory(8), { wrapper });
  await waitFor(() => expect(result.current.available).toBe(true));
  expect(result.current.runs.map((run) => run.id)).toEqual(["run"]);
});

it("does not certify cached, pending, or capped running history as an empty first-run record", async () => {
  const mockedGetDocs = vi.mocked(getDocs);
  const original = mockedGetDocs.getMockImplementation();
  for (const metadata of [{ fromCache: true, hasPendingWrites: false }, { fromCache: false, hasPendingWrites: true }]) {
    mockedGetDocs.mockReset();
    mockedGetDocs.mockResolvedValueOnce({ docs: [], size: 0, metadata } as never);
    simulateLogin({ uid: "owner" });
    const { result, unmount } = renderHook(() => useRunHistory(8), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.available).toBe(false);
    unmount();
  }
  mockedGetDocs.mockReset();
  mockedGetDocs.mockResolvedValueOnce({ docs: Array.from({ length: 200 }, (_, index) => ({ id: `run-${index}`, data: () => createMockActivity({ id: `run-${index}`, userId: "owner", type: "Run" }) })), size: 200, metadata: { fromCache: false, hasPendingWrites: false } } as never);
  const { result } = renderHook(() => useRunHistory(8), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.available).toBe(false);
  expect(result.current.runs).toEqual([]);
  mockedGetDocs.mockReset();
  if (original) mockedGetDocs.mockImplementation(original);
});

it("hides the previous owner's runs on the first render after account switch", async () => {
  simulateLogin({ uid: "owner-a" });
  setCollectionDocs("activities", [{ id: "a", ...createMockActivity({ id: "a", userId: "owner-a", type: "Run" }) }]);
  const { result } = renderHook(() => useRunHistory(8), { wrapper });
  await waitFor(() => expect(result.current.runs.map((run) => run.id)).toEqual(["a"]));
  act(() => simulateLogin({ uid: "owner-b" }));
  expect(result.current.runs).toEqual([]);
  expect(result.current.available).toBe(false);
});
