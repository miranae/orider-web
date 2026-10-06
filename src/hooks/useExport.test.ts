import { act, renderHook } from "@testing-library/react";
import JSZip from "jszip";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { setCallableResult, setCollectionDocs, setDocData, resetAllMocks } from "../__tests__/mocks/firebase";
import { getActivityStreams } from "../services/personalDataApi";
import { debugLog, logClientError } from "../services/errorLogger";
import { filterExportableActivities, useExport } from "./useExport";

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uid: "test-uid", displayName: "Rider", email: "rider@example.com" }, profile: null }),
}));
vi.mock("../services/personalDataApi", () => ({ getActivityStreams: vi.fn() }));
vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn(), debugLog: vi.fn() }));

const activity = (id: string, source = "orider") => ({
  id,
  userId: "test-uid",
  source,
  stravaActivityId: source === "strava" ? 123 : undefined,
  description: id,
  startTime: 1_700_000_000_000,
  summary: { distance: 1000, ridingTimeMillis: 60_000, elevationGain: 0 },
});

let exportedBlob: Blob | null;

beforeEach(() => {
  resetAllMocks();
  vi.mocked(getActivityStreams).mockReset();
  vi.mocked(logClientError).mockClear();
  vi.mocked(debugLog).mockClear();
  exportedBlob = null;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    exportedBlob = blob as Blob;
    return "blob:export-test";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function runExport() {
  const { result } = renderHook(() => useExport());
  await act(async () => { await result.current.exportData(); });
  expect(result.current.error).toBeNull();
  expect(exportedBlob).not.toBeNull();
  const zip = await JSZip.loadAsync(exportedBlob!);
  return { zip, progress: result.current.progress };
}

describe("filterExportableActivities", () => {
  it("drops partial activity docs without summary so one bad record cannot fail the export", () => {
    const activities = [
      { id: "ok", summary: { distance: 1000 } },
      { id: "partial" },
      { id: "null-summary", summary: null },
    ];

    expect(filterExportableActivities(activities).map((activity) => activity.id)).toEqual(["ok"]);
  });
});

describe("useExport tracks", () => {
  it("includes a GPX for a native GCS stream", async () => {
    setCollectionDocs("activities", [activity("native")]);
    setDocData("activity_streams/native", { storage: "gcs" });
    vi.mocked(getActivityStreams).mockResolvedValue({ userId: "test-uid", latlng: [[37.5, 127.0]], time: [0] });

    const { zip, progress } = await runExport();
    expect(getActivityStreams).toHaveBeenCalledWith("native");
    expect(await zip.file("activities/2023-11-14_native/track.gpx")?.async("string")).toContain("<trkpt");
    expect(JSON.parse(await zip.file("metadata.json")!.async("string"))).toMatchObject({ trackCount: 1, missingTrackCount: 0 });
    expect(progress?.label).not.toContain("트랙 없이");
  });

  it("continues to load Strava GCS streams through the callable", async () => {
    setCollectionDocs("activities", [activity("strava-ride", "strava")]);
    setDocData("activity_streams/strava_123", { storage: "gcs" });
    setCallableResult("stravaGetActivityStreams", { data: { userId: "test-uid", latlng: [[37.5, 127.0]] } });

    const { zip } = await runExport();
    expect(getActivityStreams).not.toHaveBeenCalled();
    expect(zip.file("activities/2023-11-14_strava-ride/track.gpx")).not.toBeNull();
  });

  it("continues to export inline stream tracks", async () => {
    setCollectionDocs("activities", [activity("inline")]);
    setDocData("activity_streams/inline", { json: JSON.stringify({ userId: "test-uid", latlng: [[37.5, 127.0]] }) });

    const { zip } = await runExport();
    expect(getActivityStreams).not.toHaveBeenCalled();
    expect(zip.file("activities/2023-11-14_inline/track.gpx")).not.toBeNull();
  });

  it("keeps the ZIP and reports activities without tracks when GCS loading fails", async () => {
    setCollectionDocs("activities", [activity("native")]);
    setDocData("activity_streams/native", { storage: "gcs" });
    vi.mocked(getActivityStreams).mockRejectedValue(new Error("Stream unavailable"));

    const { zip, progress } = await runExport();
    expect(zip.file("activities/2023-11-14_native/activity.json")).not.toBeNull();
    expect(zip.file("activities/2023-11-14_native/track.gpx")).toBeNull();
    expect(JSON.parse(await zip.file("metadata.json")!.async("string"))).toMatchObject({ trackCount: 0, missingTrackCount: 1 });
    expect(progress?.label).toContain("활동 1개는 트랙 없이 내보냈습니다");
    expect(logClientError).toHaveBeenCalledWith("useExport.loadGcsStream", expect.any(Error), { activityId: "native" });
    expect(debugLog).toHaveBeenCalledWith("useExport.missingTracks", { activityCount: 1, missingTrackCount: 1 });
  });

  it("counts a missing stream document as a trackless activity", async () => {
    setCollectionDocs("activities", [activity("no-stream")]);

    const { zip, progress } = await runExport();
    expect(zip.file("activities/2023-11-14_no-stream/activity.json")).not.toBeNull();
    expect(JSON.parse(await zip.file("metadata.json")!.async("string"))).toMatchObject({ missingTrackCount: 1 });
    expect(progress?.label).toContain("활동 1개는 트랙 없이 내보냈습니다");
  });
});
