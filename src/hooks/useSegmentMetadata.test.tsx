import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { FirebaseServicesProvider, type FirebaseServices } from "../contexts/FirebaseServicesContext";
import { useSegmentMetadata } from "./useSegmentMetadata";
import { loadSegmentMetadata } from "../services/segmentMetadata";
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "viewer" } }) }));
vi.mock("../services/segmentMetadata", () => ({ loadSegmentMetadata: vi.fn() }));
const services = () => ({ auth: { currentUser: { uid: "viewer" } }, firestore: {}, functions: {}, ensureAppCheckReady: vi.fn(), getAppCheckToken: vi.fn() }) as unknown as FirebaseServices;

it("hides prior-app metadata immediately and rejects late responses across same-uid app replacement", async () => {
  const first = services(), next = services();
  let current = first;
  const wrapper = ({ children }: { children: ReactNode }) => <FirebaseServicesProvider services={current}>{children}</FirebaseServicesProvider>;
  let finishOld!: (rows: { name: string }[]) => void, finishNext!: (rows: { name: string }[]) => void;
  vi.mocked(loadSegmentMetadata).mockResolvedValueOnce([{ id: "segment", name: "First app" }])
    .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { finishNext = resolve; }));
  const view = renderHook(({ id }) => useSegmentMetadata<{ name: string }>(id), { wrapper, initialProps: { id: "segment" } });
  await waitFor(() => expect(view.result.current.data?.name).toBe("First app"));
  view.rerender({ id: "pending-old" });
  await waitFor(() => expect(loadSegmentMetadata).toHaveBeenCalledTimes(2));
  current = next;
  view.rerender({ id: "segment" });
  expect(view.result.current).toMatchObject({ data: null, loading: true });
  await waitFor(() => expect(loadSegmentMetadata).toHaveBeenLastCalledWith(["segment"], next));
  await act(async () => finishOld([{ name: "Late old app" }]));
  expect(view.result.current.data).toBeNull();
  await act(async () => finishNext([{ name: "Next app" }]));
  expect(view.result.current.data?.name).toBe("Next app");
});

it("invalidates already loaded metadata when the app changes without changing id or uid", async () => {
  let current = services();
  const wrapper = ({ children }: { children: ReactNode }) => <FirebaseServicesProvider services={current}>{children}</FirebaseServicesProvider>;
  vi.mocked(loadSegmentMetadata).mockReset().mockResolvedValueOnce([{ id: "segment", name: "Old app" }]).mockImplementation(() => new Promise(() => {}));
  const view = renderHook(() => useSegmentMetadata("segment"), { wrapper });
  await waitFor(() => expect(view.result.current.data).toMatchObject({ name: "Old app" }));
  current = services(); view.rerender();
  expect(view.result.current).toMatchObject({ data: null, loading: true });
});
