import { createHash } from "node:crypto";
import contractCases from "./samePhysicalRide.contract.fixture.json";
import rankSplitCases from "./__fixtures__/same-physical-ride-cases.json";
import { describe, expect, it } from "vitest";
import { disciplineOfType } from "@shared/sport/discipline";
import {
  dedupeSamePhysicalRides,
  groupSamePhysicalRides,
  isSamePhysicalRide,
  physicalRideIdentityKeys,
  physicalRideSourceRank,
  pickPhysicalRideRepresentative,
  type PhysicalRideActivity,
} from "./samePhysicalRide";

/**
 * 이 파일은 서버 정본(orider-g1-web `functions/src/training/same-physical-ride.ts`)의 미러다.
 * 테스트가 없으면 규칙이 한쪽에서만 바뀌어도 아무도 모르고, 같은 계정이 플랫폼마다 다른 활동 수를 본다.
 */
const T0 = Date.parse("2026-06-24T10:29:00Z");
const ride = (
  id: string,
  link: { session?: string | null; strava?: number | null } = {},
  extra: Partial<PhysicalRideActivity> = {},
): PhysicalRideActivity => ({
  id,
  localSessionId: link.session ?? null,
  stravaActivityId: link.strava ?? null,
  startTime: null,
  distanceKm: 30,
  movingSec: 3600,
  endTime: null,
  sportFamily: "bike",
  ...extra,
});

describe("식별 키", () => {
  it("접두사를 단다 — 세션 id 와 문서 id 가 우연히 같아도 섞이지 않는다", () => {
    expect(physicalRideIdentityKeys(ride("orider_x", { session: "x", strava: 9 })))
      .toEqual(["doc:orider_x", "session:x", "strava:9"]);
    expect(isSamePhysicalRide(ride("x"), ride("other", { session: "x" }))).toBe(false);
  });

  it("빈 문자열·NaN 은 키가 되지 않는다", () => {
    expect(physicalRideIdentityKeys(ride("a", { session: "", strava: Number.NaN }))).toEqual(["doc:a"]);
  });

  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])("잘못된 제공자 ID %s는 다른 활동을 연결하지 않는다", (providerId) => {
    const first = ride("a", { strava: providerId });
    const second = ride("b", {}, { stravaTwinActivityId: providerId });
    expect(physicalRideIdentityKeys(first)).toEqual(["doc:a"]);
    expect(physicalRideIdentityKeys(second)).toEqual(["doc:b"]);
    expect(dedupeSamePhysicalRides([first, second])).toHaveLength(2);
  });
});

describe("판정", () => {
  it("링크된 orider·strava 쌍은 같은 주행 — 시각 차는 무관", () => {
    const orider = ride("orider_s1", { session: "s1", strava: 777 }, { source: "orider" });
    const strava = ride("strava_777", { strava: 777 }, { source: "strava", startTime: T0 + 61 * 60_000, distanceKm: 27 });
    expect(isSamePhysicalRide(orider, strava)).toBe(true);
    expect(dedupeSamePhysicalRides([orider, strava]).map((r) => r.id)).toEqual(["strava_777"]);
  });

  it("링크가 없어도 시간 구간이 실질적으로 겹치면 같은 주행", () => {
    const orider = ride("orider_s1", { session: "s1" }, { source: "orider", startTime: T0, endTime: T0 + 3600_000 });
    const strava = ride("strava_777", { strava: 777 }, { source: "strava", startTime: T0 + 138_000, endTime: T0 + 3635_000 });
    expect(isSamePhysicalRide(orider, strava)).toBe(true);
    expect(dedupeSamePhysicalRides([orider, strava]).map((r) => r.id)).toEqual(["strava_777"]);
  });

  it("연속된 별개 주행과 2분 미만 경계 겹침은 합치지 않는다", () => {
    const first = ride("orider_1", {}, { source: "orider", startTime: T0, endTime: T0 + 3600_000 });
    const second = ride("strava_2", { strava: 2 }, { source: "strava", startTime: T0 + 3590_000, endTime: T0 + 7200_000 });
    expect(dedupeSamePhysicalRides([first, second])).toHaveLength(2);
  });

  it("시간이 겹쳐도 종목 축이 다르거나 미상이면 합치지 않는다", () => {
    const cycling = ride("ride", {}, { startTime: T0, endTime: T0 + 3600_000, sportFamily: "bike" });
    const running = ride("run", {}, { startTime: T0 + 60_000, endTime: T0 + 3500_000, sportFamily: "run" });
    const unknown = ride("unknown", {}, { startTime: T0 + 60_000, endTime: T0 + 3500_000, sportFamily: null });
    expect(dedupeSamePhysicalRides([cycling, running, unknown])).toHaveLength(3);
  });

  it("Strava 전체 기록과 여러 ORider 분할 기록을 전이적으로 한 건으로 묶는다", () => {
    const strava = ride("strava_full", { strava: 9 }, { source: "strava", startTime: T0, endTime: T0 + 8160_000, movingSec: 4107 });
    const parts = [
      ride("orider_1", {}, { source: "orider", startTime: T0 + 42_000, endTime: T0 + 392_000, movingSec: 350 }),
      ride("orider_2", {}, { source: "orider", startTime: T0 + 407_000, endTime: T0 + 3972_000, movingSec: 1664 }),
      ride("orider_3", {}, { source: "orider", startTime: T0 + 6021_000, endTime: T0 + 8173_000, movingSec: 2138 }),
    ];
    expect(groupSamePhysicalRides([strava, ...parts])).toHaveLength(1);
    expect(dedupeSamePhysicalRides([strava, ...parts]).map((row) => row.id)).toEqual(["strava_full"]);
  });

  it("세 벌(로컬~orider~strava)은 전이적으로 한 건", () => {
    const local = ride("s1", { session: "s1" }, { source: "orider" });
    const orider = ride("orider_s1", { session: "s1", strava: 777 }, { source: "orider" });
    const strava = ride("strava_777", { strava: 777 }, { source: "strava" });
    expect(groupSamePhysicalRides([local, orider, strava])).toHaveLength(1);
  });

  it("같은 세션의 이중 업로드는 한 건", () => {
    expect(dedupeSamePhysicalRides([
      ride("orider_a", { session: "s1" }, { source: "orider" }),
      ride("orider_b", { session: "s1" }, { source: "orider" }),
    ])).toHaveLength(1);
  });
});

describe("대표 선택", () => {
  it("Strava > ORider > 헬스", () => {
    expect(physicalRideSourceRank(ride("a", {}, { source: "strava" }))).toBe(0);
    expect(physicalRideSourceRank(ride("a", {}, { source: "orider" }))).toBe(1);
    expect(physicalRideSourceRank(ride("a", {}, { source: "health_connect" }))).toBe(2);
    expect(physicalRideSourceRank(ride("strava_9"))).toBe(0);
  });

  it("같은 랭크면 부하 → 이동시간 → id, 순서에 의존하지 않는다", () => {
    const a = ride("orider_b", { session: "s" }, { source: "orider" });
    const b = ride("orider_a", { session: "s" }, { source: "orider", hasLoad: true });
    expect(pickPhysicalRideRepresentative([a, b]).id).toBe("orider_a");
    expect(pickPhysicalRideRepresentative([b, a]).id).toBe("orider_a");
    const x = ride("orider_x", { session: "s" }, { source: "orider" });
    const y = ride("orider_y", { session: "s" }, { source: "orider" });
    expect(pickPhysicalRideRepresentative([y, x]).id).toBe("orider_x");
  });

  it("입력 순서를 보존한다", () => {
    const rows = [
      ride("strava_9", { strava: 9 }, { source: "strava" }),
      ride("orider_s1", { session: "s1", strava: 7 }, { source: "orider" }),
      ride("strava_7", { strava: 7 }, { source: "strava" }),
    ];
    expect(dedupeSamePhysicalRides(rows).map((r) => r.id)).toEqual(["strava_9", "strava_7"]);
  });
});

describe("WEB/BE 공용 실주행 계약 fixture", () => {
  it.each(contractCases)("$name", ({ rows, expected }) => {
    expect(dedupeSamePhysicalRides(rows).map((row) => row.id)).toEqual(expected);
  });
});

/**
 * 시간대별 출처 우선순위 1단계 — 순위별 덩어리 분할 (같은주행_분할조각_사양 SPC-7-1~7-11b, SPC-7-17).
 * 표 `__fixtures__/same-physical-ride-cases.json` 은 서버 표와 동일해야 한다
 * (원본: orider-g1-web `functions/src/training/fixtures/same-physical-ride-cases.json`, 실제 활동 id 만 가짜로 교체).
 * The fixture must match the server table; update both together.
 */
describe("최상위 출처 덩어리별 하위 묶음 — 서버 표 미러", () => {
  type FixtureRow = Omit<PhysicalRideActivity, "startTime" | "endTime" | "sportFamily"> & {
    startTime?: string | null; endTime?: string | null; type?: string | null; discipline?: string | null;
  };
  type FixtureCase = { id: string; title: string; rows: FixtureRow[]; expectedGroups: string[][]; expectedRepresentatives?: string[] };
  const cases = (rankSplitCases as { cases: FixtureCase[] }).cases;
  // 서버는 discipline 우선, 없으면 type 으로 종목을 판정한다. 웹 호출부와 같은 정본으로 sportFamily 를 채운다.
  const toRows = (rows: FixtureRow[]): PhysicalRideActivity[] => rows.map(({ type, discipline, ...row }) => ({
    ...row,
    startTime: row.startTime == null ? null : Date.parse(row.startTime),
    endTime: row.endTime == null ? null : Date.parse(row.endTime),
    sportFamily: discipline === "bike" || discipline === "run" || discipline === "swim" ? discipline : disciplineOfType(type),
  }));
  const composition = (groups: PhysicalRideActivity[][]) =>
    groups.map((group) => group.map((row) => row.id).sort()).sort((a, b) => a[0]!.localeCompare(b[0]!));
  const expected = (testCase: FixtureCase) =>
    testCase.expectedGroups.map((group) => [...group].sort()).sort((a, b) => a[0]!.localeCompare(b[0]!));
  /** 결정형 섞기 — 서버 테스트와 같은 시드 고정 선형 합동 생성기. */
  const shuffled = <T>(rows: T[], seed: number): T[] => {
    const out = [...rows]; let state = seed;
    for (let index = out.length - 1; index > 0; index--) {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      const swap = state % (index + 1);
      [out[index], out[swap]] = [out[swap]!, out[index]!];
    }
    return out;
  };

  it("표 내용이 고정값과 같다 — 서버 표가 바뀌면 이 표와 해시를 같이 갱신한다", () => {
    // Pinned hash of the mirrored cases. If the server table changes, copy it here and update this hash.
    const digest = createHash("sha256").update(JSON.stringify(cases)).digest("hex");
    expect(digest).toBe("b13a79bc91a85ee2a9f4436ff71ba99dbfc0f93bcd04abeb22602353683a5773");
  });

  it("표의 모든 케이스를 싣는다", () => {
    expect(cases.map((testCase) => testCase.id)).toEqual(expect.arrayContaining([
      "SPC-7-1", "SPC-7-2", "SPC-7-3", "SPC-7-4", "SPC-7-5", "SPC-7-6", "SPC-7-7", "SPC-7-8", "SPC-7-9",
      "SPC-7-10", "SPC-7-11a", "SPC-7-11b",
    ]));
  });

  it.each(cases.map((testCase) => [testCase.id, testCase] as const))("%s: 기대 하위 묶음과 대표", (_, testCase) => {
    const groups = groupSamePhysicalRides(toRows(testCase.rows));
    expect(composition(groups)).toEqual(expected(testCase));
    if (testCase.expectedRepresentatives) {
      expect(groups.map((group) => pickPhysicalRideRepresentative(group).id).sort())
        .toEqual([...testCase.expectedRepresentatives].sort());
      expect(dedupeSamePhysicalRides(toRows(testCase.rows)).map((row) => row.id).sort())
        .toEqual([...testCase.expectedRepresentatives].sort());
    }
  });

  it.each(cases.map((testCase) => [testCase.id, testCase] as const))(
    "SPC-7-11 %s: 입력 순서를 섞거나 hasLoad 를 뒤집어도 하위 묶음 구성이 같다", (_, testCase) => {
      const rows = toRows(testCase.rows);
      const want = expected(testCase);
      expect(composition(groupSamePhysicalRides([...rows].reverse()))).toEqual(want);
      for (const seed of [1, 7, 42, 2026, 3223]) {
        expect(composition(groupSamePhysicalRides(shuffled(rows, seed)))).toEqual(want);
      }
      const flipped = rows.map((row) => ({ ...row, hasLoad: row.hasLoad !== true }));
      expect(composition(groupSamePhysicalRides(shuffled(flipped, 11)))).toEqual(want);
    });
});
