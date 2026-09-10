import { describe, expect, it, vi } from "vitest";

import { fetchMaintenanceSnapshot } from "./maintenanceSnapshotReader";

const getDoc = vi.hoisted(() => vi.fn());
vi.mock("firebase/firestore", () => ({ doc: vi.fn(() => ({})), getDoc }));
vi.mock("./errorLogger", () => ({ logClientError: vi.fn(), debugLog: vi.fn() }));

function snapshot(data: unknown | null) {
  return { exists: () => data !== null, data: () => data };
}

const doc1 = {
  schemaVersion: 1,
  algorithmVersion: "maintenance@1",
  status: "canonical",
  computedAt: 1_756_000_000_000,
  inputRevision: "r1",
  inputDigest: "d1",
  data: {
    inputs: { bikeProfileId: "b1", creditedActivitiesDigest: "x", creditedActivityCount: 42,
      pendingActivityCount: 2, unattributedActivityCount: 1, recordsUpdatedAt: null },
    odometerKm: 3_120.4,
    movingTimeSec: 400_000,
    components: [
      { component: "CHAIN", distanceSinceServiceKm: 3_120.4, remainingKm: 0, progress: 1, due: true },
      { component: "TYRE", distanceSinceServiceKm: 1_200, remainingKm: 3_800, progress: 0.24, due: false },
    ],
    dueCount: 1,
  },
  error: null,
};

// mock 초기화는 각 테스트 안에서 한다 — beforeEach 가 mock 을 반환하면 vitest 가 그것을
// teardown 콜백으로 보고 테스트 뒤에 호출한다.
describe("fetchMaintenanceSnapshot", () => {
  it("읽기 실패는 failed 봉투다 — 던지지 않는다", async () => {
    getDoc.mockReset();
    getDoc.mockImplementation(() => { throw new Error("permission-denied"); });
    const envelope = await fetchMaintenanceSnapshot("u1", "b1");
    expect(envelope.status).toBe("failed");
    expect(envelope.data).toBeNull();
  });

  it("canonical 문서를 봉투로 옮긴다", async () => {
    getDoc.mockReset();
    getDoc.mockResolvedValue(snapshot(doc1));
    const envelope = await fetchMaintenanceSnapshot("u1", "b1");
    expect(envelope.status).toBe("canonical");
    expect(envelope.data?.odometerKm).toBe(3_120.4);
    expect(envelope.data?.dueCount).toBe(1);
    expect(envelope.data?.pendingActivityCount).toBe(2);
    expect(envelope.data?.components.map((item) => item.component)).toEqual(["CHAIN", "TYRE"]);
  });

  it("stale 도 값을 그대로 준다", async () => {
    getDoc.mockReset();
    getDoc.mockResolvedValue(snapshot({ ...doc1, status: "stale" }));
    const envelope = await fetchMaintenanceSnapshot("u1", "b1");
    expect(envelope.status).toBe("stale");
    expect(envelope.data?.odometerKm).toBe(3_120.4);
  });

  it("누적 거리가 없으면 0 km 로 채우지 않는다", async () => {
    getDoc.mockReset();
    getDoc.mockResolvedValue(snapshot({ ...doc1, status: "processing", data: null }));
    const envelope = await fetchMaintenanceSnapshot("u1", "b1");
    expect(envelope.status).toBe("processing");
    expect(envelope.data).toBeNull();
  });

  it("문서가 없으면 unavailable", async () => {
    getDoc.mockReset();
    getDoc.mockResolvedValue(snapshot(null));
    expect((await fetchMaintenanceSnapshot("u1", "b1")).status).toBe("unavailable");
  });

  it("모르는 부품은 버린다", async () => {
    getDoc.mockReset();
    getDoc.mockResolvedValue(snapshot({
      ...doc1,
      data: { ...doc1.data, components: [...doc1.data.components,
        { component: "DERAILLEUR", distanceSinceServiceKm: 10, remainingKm: 10, progress: 0.5, due: false }] },
    }));
    const envelope = await fetchMaintenanceSnapshot("u1", "b1");
    expect(envelope.data?.components).toHaveLength(2);
  });

  it("uid 나 자전거 id 가 없으면 읽지 않는다", async () => {
    getDoc.mockReset();
    expect((await fetchMaintenanceSnapshot("", "b1")).status).toBe("unavailable");
    expect((await fetchMaintenanceSnapshot("u1", "")).status).toBe("unavailable");
    expect(getDoc).not.toHaveBeenCalled();
  });
});
