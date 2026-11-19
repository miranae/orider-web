import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { getDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import type { Activity } from "@shared/types";
import { FirebaseServicesProvider, useFirebaseServices } from "../../../contexts/FirebaseServicesContext";
import type { ReactNode } from "react";
import { useActivityStreamsLoader } from "./useActivityStreamsLoader";
const mocks = vi.hoisted(() => ({ streams: vi.fn() }));
vi.mock("../../../services/publicActivityDetail", () => ({ createPublicActivityClient: () => mocks, isPublicActivityAccessError: (error: {code?: string}) => ["functions/permission-denied", "functions/not-found", "functions/failed-precondition"].includes(error.code ?? "") }));
const t = (key: string) => key;
const getStreams = vi.fn();
const activity = { id: "a", userId: "owner", source: "orider", type: "VirtualRide" } as Activity;
beforeEach(() => { mocks.streams.mockReset(); getStreams.mockClear(); });
it("discards a legacy Strava stream from a replaced SDK session", async () => {
  let resolve!: (value: unknown) => void;
  getStreams.mockReturnValueOnce(new Promise(yes => { resolve = yes; }));
  const serviceTemplate = renderHook(() => useFirebaseServices());
  const auth = { currentUser: { uid: "owner" } as User };
  const services = { ...serviceTemplate.result.current, auth: auth as ReturnType<typeof useFirebaseServices>["auth"] };
  serviceTemplate.unmount();
  const run = { ...activity, id: "strava_123", source: "strava", type: "Run", stravaActivityId: 123 } as Activity;
  const { result } = renderHook(() => useActivityStreamsLoader({
    activityId: run.id, activity: run, userId: "owner", getStreams, t,
  }), { wrapper: ({ children }: { children: ReactNode }) => <FirebaseServicesProvider services={services}>{children}</FirebaseServicesProvider> });
  expect(getStreams).toHaveBeenCalledExactlyOnceWith(123, { includeCadenceUnit: true });
  expect(result.current.loadingStreams).toBe(true);
  auth.currentUser = { uid: "different" } as User;
  await act(async () => resolve({ cadence: [85] }));
  expect(result.current.streams).toBeNull();
  expect(result.current.loadingStreams).toBe(false);
  expect(result.current.showStreamSpinner).toBe(false);
});


it("uses the authorized full-resolution reader without raw Firestore or provider reads, retaining streams on social refresh", async () => {
  const streams = { time: [0, .5, 1], watts: [200, 0, 150] };
  mocks.streams.mockResolvedValue({ state: "available", activityId: "a", streams });
  const before = vi.mocked(getDoc).mock.calls.length;
  const { result, rerender } = renderHook(({ value }) => useActivityStreamsLoader({ activityId: "a", activity: value, userId: "viewer", getStreams, t, publicAccess: true, accessRevision: "same-source" }), { initialProps: { value: activity } });
  await waitFor(() => expect(result.current.streams).toEqual(streams));
  rerender({ value: { ...activity, kudosCount: 2 } });
  expect(mocks.streams).toHaveBeenCalledTimes(1);
  expect(getStreams).not.toHaveBeenCalled(); expect(vi.mocked(getDoc).mock.calls.length).toBe(before);
});
it("discards a late previous revision and revokes access on the current denied read", async () => {
  let resolve!: (value: unknown) => void;
  mocks.streams.mockReturnValueOnce(new Promise(yes => { resolve = yes; })).mockRejectedValueOnce({ code: "functions/permission-denied" });
  const revoke = vi.fn();
  const { result, rerender } = renderHook(({ revision }) => useActivityStreamsLoader({ activityId: "a", activity, userId: "viewer", getStreams, t, publicAccess: true, accessRevision: revision, onAccessRevoked: revoke }), { initialProps: { revision: "a" } });
  rerender({ revision: "b" });
  await waitFor(() => expect(revoke).toHaveBeenCalledOnce());
  await act(async () => resolve({ activityId: "a", state: "available", streams: { watts: [999] } }));
  expect(result.current.streams).toBeNull();
});
it("bounds explicit overview lookup and retry, then clears loaded geometry when access is denied", async () => {
  const revoke = vi.fn();
  let resolve!: (value: unknown) => void;
  mocks.streams.mockReturnValueOnce(new Promise(yes => { resolve = yes; }));
  const { result } = renderHook(() => useActivityStreamsLoader({ activityId: "a", activity, userId: "viewer", getStreams, t,
    enabled: false, publicAccess: true, accessRevision: "saved-summary", onAccessRevoked: revoke }));
  expect(mocks.streams).not.toHaveBeenCalled();
  act(() => { result.current.requestStreams(); result.current.requestStreams(); });
  expect(result.current.loadingStreams).toBe(true);
  expect(mocks.streams).toHaveBeenCalledOnce();
  await act(async () => resolve({ activityId: "a", state: "unavailable", streams: null }));
  expect(result.current.loadingStreams).toBe(false);
  expect(result.current.streamsError).toBeTruthy();
  const loaded = { time: [0, 1], activityRouteGeometryV1: { version: 1, latlng: [[37, 127], [37.1, 127.1]], time: [0, 10] } };
  mocks.streams.mockResolvedValueOnce({ activityId: "a", state: "available", streams: loaded });
  await act(async () => { await result.current.retryStreams(); });
  await waitFor(() => expect(result.current.streams).toEqual(loaded));
  mocks.streams.mockRejectedValueOnce({ code: "functions/permission-denied" });
  await act(async () => { await result.current.retryStreams(); });
  expect(revoke).toHaveBeenCalledOnce();
  expect(result.current.streams).toBeNull();
});
