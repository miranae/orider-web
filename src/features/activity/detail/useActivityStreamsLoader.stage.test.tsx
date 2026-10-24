import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Activity } from "@shared/types";
import { getDoc } from "firebase/firestore";
import { getActivityStreamsWithAuth } from "../../../services/personalDataApi";
import { resetRuntimeConfigForTests } from "../../../services/runtimeConfig";
import { useActivityStreamsLoader } from "./useActivityStreamsLoader";
vi.mock("../../../services/personalDataApi", () => ({ getActivityStreams: vi.fn(), getActivityStreamsWithAuth: vi.fn() }));
beforeEach(() => { resetRuntimeConfigForTests({ appEnvironment: "stage" }); vi.mocked(getActivityStreamsWithAuth).mockReset(); });
afterEach(() => resetRuntimeConfigForTests());
it.each(["orider", "strava"])("routes %s raw activity data to the fenced stage reader with its service context", async source => {
  const activity = { id: source === "strava" ? "strava_123" : "orider_abc", userId: "owner", source, stravaActivityId: 123 } as Activity;
  const streams = { userId: "owner", time: [0, 1], watts: [100, 120] };
  vi.mocked(getActivityStreamsWithAuth).mockResolvedValue(streams);
  const providerGetStreams = vi.fn();
  const firestoreCalls = vi.mocked(getDoc).mock.calls.length;
  const { result, unmount } = renderHook(() => useActivityStreamsLoader({ activityId: activity.id, activity, userId: "owner", getStreams: providerGetStreams, t: key => key }));
  await waitFor(() => expect(result.current.streams).toEqual(streams));
  expect(getActivityStreamsWithAuth).toHaveBeenCalledWith(expect.anything(), activity.id, expect.objectContaining({ functions: expect.anything(), ensureAppCheckReady: expect.any(Function) }), { includeRunEffortFacts: false });
  expect(providerGetStreams).not.toHaveBeenCalled();
  expect(vi.mocked(getDoc).mock.calls.length).toBe(firestoreCalls);
  unmount();
});
it.each([true, false])("opts into running effort facts only for the actual owner (%s)", async owner => {
  const activity = { id: "orider_run", userId: "owner", source: "orider", type: "Run" } as Activity;
  vi.mocked(getActivityStreamsWithAuth).mockResolvedValue({ userId: "owner", time: [0, 1] });
  const getStreams = vi.fn();
  const t = (key: string) => key;
  const { result } = renderHook(() => useActivityStreamsLoader({ activityId: activity.id, activity, userId: owner ? "owner" : "other", getStreams, t }));
  await waitFor(() => expect(result.current.streams).not.toBeNull());
  expect(getActivityStreamsWithAuth).toHaveBeenCalledExactlyOnceWith(expect.anything(), activity.id, expect.anything(), { includeRunEffortFacts: owner });
});

it("keeps stage sign-in-required distinct from missing data, skips anonymous reads, and clears it on account changes", async () => {
  const activity = { id: "strava_public", userId: "owner", source: "strava" } as Activity;
  const getStreams = vi.fn();
  const t = (key: string) => key;
  const beforeReads = vi.mocked(getDoc).mock.calls.length;
  const { result, rerender } = renderHook(({ userId }: { userId?: string }) => useActivityStreamsLoader({ activityId: activity.id, activity, userId, getStreams, t }), { initialProps: { userId: undefined as string | undefined } });
  expect(result.current.streamsSignInRequired).toBe(true);
  expect(result.current.streamsError).toBeNull();
  expect(result.current.loadingStreams).toBe(false);
  expect(getActivityStreamsWithAuth).not.toHaveBeenCalled();
  expect(vi.mocked(getDoc).mock.calls.length).toBe(beforeReads);
  const ownedStreams = { userId: "owner", time: [0, 1] };
  vi.mocked(getActivityStreamsWithAuth).mockResolvedValueOnce(ownedStreams);
  rerender({ userId: "owner" });
  await waitFor(() => expect(result.current.streams).toEqual(ownedStreams));
  expect(result.current.streamsSignInRequired).toBe(false);
  rerender({ userId: undefined });
  expect(result.current.streams).toBeNull();
  expect(result.current.streamsSignInRequired).toBe(true);
  expect(getActivityStreamsWithAuth).toHaveBeenCalledTimes(1);
  vi.mocked(getActivityStreamsWithAuth).mockRejectedValueOnce(new Error("STREAMS_MISSING"));
  rerender({ userId: "other" });
  await waitFor(() => expect(result.current.streamsError).toBe("page.streamsMissing"));
  expect(result.current.streamsSignInRequired).toBe(false);
  expect(result.current.streams).toBeNull();
  expect(getStreams).not.toHaveBeenCalled();
});

it.each(["stage", "production"])("keeps export identity and attachments while requesting canonical sensors in %s", async appEnvironment => {
  resetRuntimeConfigForTests({ appEnvironment });
  const activity = { id: "strava_123", source: "strava", userId: "owner", type: "Ride",
    activityPresentationV1: { version: 1, activityRevision: null, contentSelectedRevision: null,
      sensorOriginActivityId: "orider_original" } } as Activity;
  const streams = { time: [0, 1], watts: [100, 120], segment_efforts: [{ id: "export-effort" }] };
  vi.mocked(getActivityStreamsWithAuth).mockResolvedValue(streams as never);
  const beforeReads = vi.mocked(getDoc).mock.calls.length;
  const getStreams = vi.fn();
  const { result } = renderHook(() => useActivityStreamsLoader({ activityId: activity.id, activity, userId: "owner", getStreams, t: key => key }));
  await waitFor(() => expect(result.current.streams).toEqual(streams));
  expect(vi.mocked(getActivityStreamsWithAuth).mock.calls[0]?.[1]).toBe(activity.id);
  expect(vi.mocked(getDoc).mock.calls.length).toBe(beforeReads);
  expect(getStreams).not.toHaveBeenCalled();
});
