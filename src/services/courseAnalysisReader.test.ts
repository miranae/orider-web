import { describe, expect, it, vi } from "vitest";

import { fetchCourseAnalysis } from "./courseAnalysisReader";

const getDoc = vi.hoisted(() => vi.fn());
vi.mock("firebase/firestore", () => ({ doc: vi.fn(() => ({})), getDoc }));
vi.mock("./errorLogger", () => ({ logClientError: vi.fn(), debugLog: vi.fn() }));

function snapshot(data: unknown | null) {
  return { exists: () => data !== null, data: () => data };
}

const analysis = {
  schemaVersion: 1,
  algorithmVersion: "course-analysis@1",
  status: "canonical",
  computedAt: 1_756_000_000_000,
  inputRevision: "r1",
  inputDigest: "d1",
  data: {
    inputs: { routeDigest: "digest-1", pointCount: 900, hasTrackElevation: true, elevationSource: "track", interpolatedRatio: 0 },
    distanceM: 42_000, elevationGainM: 512, elevationLossM: 508,
    difficulty: 3, difficultyBand: "challenging",
  },
  error: null,
};

// mock 초기화는 각 테스트 안에서 한다. `beforeEach(() => getDoc.mockReset())` 처럼 mock 을
// **반환**하면 vitest 가 그 반환값을 teardown 콜백으로 보고 테스트 종료 후 호출해 버린다.
describe("fetchCourseAnalysis", () => {

  it("읽기 실패는 failed 봉투다 — 던지지 않는다", async () => {
    getDoc.mockReset();
    getDoc.mockImplementation(() => { throw new Error("permission-denied"); });
    const envelope = await fetchCourseAnalysis("c1");
    expect(envelope.status).toBe("failed");
    expect(envelope.error?.code).toBe("read_failed");
  });

  it("canonical 문서를 봉투로 옮긴다", async () => {
    getDoc.mockReset();
    getDoc.mockResolvedValue(snapshot(analysis));
    const envelope = await fetchCourseAnalysis("c1");
    expect(envelope.status).toBe("canonical");
    expect(envelope.data).toEqual({
      routeDigest: "digest-1", distanceM: 42_000, elevationGainM: 512,
      elevationLossM: 508, difficulty: 3, difficultyBand: "challenging",
    });
  });

  it("stale 도 값을 그대로 준다", async () => {
    getDoc.mockReset();
    getDoc.mockResolvedValue(snapshot({ ...analysis, status: "stale" }));
    const envelope = await fetchCourseAnalysis("c1");
    expect(envelope.status).toBe("stale");
    expect(envelope.data?.elevationGainM).toBe(512);
  });

  it("문서가 없으면 0 이 아니라 unavailable", async () => {
    getDoc.mockReset();
    getDoc.mockResolvedValue(snapshot(null));
    const envelope = await fetchCourseAnalysis("c1");
    expect(envelope.status).toBe("unavailable");
    expect(envelope.data).toBeNull();
  });

  it("값이 아직 없으면 processing 이고 숫자를 지어내지 않는다", async () => {
    getDoc.mockReset();
    getDoc.mockResolvedValue(snapshot({ ...analysis, status: "processing", data: null }));
    const envelope = await fetchCourseAnalysis("c1");
    expect(envelope.status).toBe("processing");
    expect(envelope.data).toBeNull();
  });

  it("모르는 난이도 밴드는 null 로 두고 값은 살린다", async () => {
    getDoc.mockReset();
    getDoc.mockResolvedValue(snapshot({ ...analysis, data: { ...analysis.data, difficultyBand: "brutal" } }));
    const envelope = await fetchCourseAnalysis("c1");
    expect(envelope.data?.difficultyBand).toBeNull();
    expect(envelope.data?.elevationGainM).toBe(512);
  });

  it("코스 id 가 없으면 읽지 않는다", async () => {
    getDoc.mockReset();
    expect((await fetchCourseAnalysis("")).status).toBe("unavailable");
    expect(getDoc).not.toHaveBeenCalled();
  });
});
