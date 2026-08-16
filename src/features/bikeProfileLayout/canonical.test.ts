import { describe, expect, it } from "vitest";

import {
  encodeCanonicalLayout,
  parseCanonicalLayout,
  payloadHash,
  type CanonicalLayout,
} from "./canonical";

/**
 * canonical schema v1 웹 구현 계약 (#1943 §8.2).
 *
 * GOLDEN 문자열/해시는 Shared(Kotlin) `BikeDataPageLayoutCodecTest` · Functions
 * `canonical.test.ts` 와 **같은 값**이다. 셋 중 하나만 어긋나면 서버가 payloadHash 불일치로
 * 정상 저장을 거부하므로, 드리프트를 여기서 먼저 잡는다.
 */
const GOLDEN_JSON =
  '{"schemaVersion":1,"profileId":"profile-1","sport":"CYCLING","pages":[{"columns":4,"rows":8,' +
  '"fields":[{"type":"SPEED","col":0,"row":0,"colSpan":4,"rowSpan":2},' +
  '{"type":"POWER","col":0,"row":2,"colSpan":2,"rowSpan":1}]}]}';

const GOLDEN_PAYLOAD_HASH = "7459704d01e809c6339d8be70cdf4d02218d6cbc9ae5914a1470889721c153f3";

const golden: CanonicalLayout = {
  schemaVersion: 1,
  profileId: "profile-1",
  sport: "CYCLING",
  pages: [
    {
      columns: 4,
      rows: 8,
      fields: [
        { type: "SPEED", col: 0, row: 0, colSpan: 4, rowSpan: 2 },
        { type: "POWER", col: 0, row: 2, colSpan: 2, rowSpan: 1 },
      ],
    },
  ],
  unknownKeys: {},
};

function issuesOf(raw: string, expectedSport?: string) {
  const result = parseCanonicalLayout(raw, expectedSport);
  if (result.ok) throw new Error("격리돼야 하는 payload 가 통과함");
  return result.issues.map((i) => i.error);
}

function layoutOf(raw: string, expectedSport?: string) {
  const result = parseCanonicalLayout(raw, expectedSport);
  if (!result.ok) throw new Error(`격리되면 안 되는 payload: ${JSON.stringify(result.issues)}`);
  return result.layout;
}

describe("canonical layout encoding", () => {
  it("matches the cross-platform golden string byte for byte", () => {
    expect(encodeCanonicalLayout(golden)).toBe(GOLDEN_JSON);
  });

  it("matches the cross-platform golden sha256", async () => {
    await expect(payloadHash(GOLDEN_JSON)).resolves.toBe(GOLDEN_PAYLOAD_HASH);
    await expect(payloadHash(encodeCanonicalLayout(golden))).resolves.toBe(GOLDEN_PAYLOAD_HASH);
  });

  it("normalizes placement order but preserves page order", () => {
    const reversed: CanonicalLayout = {
      ...golden,
      pages: [{ ...golden.pages[0], fields: [...golden.pages[0].fields].reverse() }],
    };
    expect(encodeCanonicalLayout(reversed)).toBe(GOLDEN_JSON);

    const pageA = { columns: 4, rows: 2, fields: [{ type: "SPEED", col: 0, row: 0, colSpan: 1, rowSpan: 1 }] };
    const pageB = { columns: 4, rows: 2, fields: [{ type: "POWER", col: 1, row: 0, colSpan: 1, rowSpan: 1 }] };
    expect(encodeCanonicalLayout({ ...golden, pages: [pageA, pageB] })).not.toBe(
      encodeCanonicalLayout({ ...golden, pages: [pageB, pageA] }),
    );
  });

  it("round-trips unknown top-level keys deterministically", () => {
    const raw =
      '{"schemaVersion":1,"profileId":"p","sport":"CYCLING","pages":[{"columns":4,"rows":1,' +
      '"fields":[]}],"zNote":"keep","v2Theme":{"b":2,"a":1}}';
    expect(encodeCanonicalLayout(layoutOf(raw))).toBe(
      '{"schemaVersion":1,"profileId":"p","sport":"CYCLING","pages":[{"columns":4,"rows":1,' +
        '"fields":[]}],"v2Theme":{"a":1,"b":2},"zNote":"keep"}',
    );
  });

  it("preserves a literal __proto__ top-level key", () => {
    // 일반 객체에 대입하면 prototype setter 로 먹혀 own property 가 되지 않고, 인코딩에서 사라져
    // 원문 보존과 payloadHash 계약이 함께 깨진다.
    const raw =
      '{"schemaVersion":1,"profileId":"p","sport":"CYCLING","pages":[{"columns":4,"rows":1,' +
      '"fields":[]}],"__proto__":{"a":1}}';
    const decoded = layoutOf(raw);
    expect(Object.keys(decoded.unknownKeys)).toContain("__proto__");
    expect(encodeCanonicalLayout(decoded)).toContain('"__proto__":{"a":1}');
  });

  it("round-trips unknown field types as opaque placements", () => {
    const raw =
      '{"schemaVersion":1,"profileId":"p","sport":"CYCLING","pages":[{"columns":4,"rows":2,' +
      '"fields":[{"type":"FUTURE_METRIC_FROM_V2","col":0,"row":0,"colSpan":4,"rowSpan":2}]}]}';
    expect(layoutOf(raw).pages[0].fields[0].type).toBe("FUTURE_METRIC_FROM_V2");
    expect(encodeCanonicalLayout(layoutOf(raw))).toBe(raw);
  });

  it("defaults omitted spans to one", () => {
    const raw =
      '{"schemaVersion":1,"profileId":"p","sport":"CYCLING","pages":[{"columns":4,"rows":1,' +
      '"fields":[{"type":"SPEED","col":0,"row":0}]}]}';
    expect(layoutOf(raw).pages[0].fields[0]).toEqual({ type: "SPEED", col: 0, row: 0, colSpan: 1, rowSpan: 1 });
  });
});

describe("canonical layout validation", () => {
  it("quarantines malformed json instead of throwing", () => {
    expect(issuesOf("{not json")).toEqual(["MALFORMED_JSON"]);
    expect(issuesOf("[]")).toEqual(["NOT_AN_OBJECT"]);
  });

  it("rejects overlapping placements but allows adjacent ones", () => {
    const overlap =
      '{"schemaVersion":1,"profileId":"p","sport":"CYCLING","pages":[{"columns":4,"rows":4,' +
      '"fields":[{"type":"SPEED","col":0,"row":0,"colSpan":2,"rowSpan":2},' +
      '{"type":"POWER","col":1,"row":1,"colSpan":1,"rowSpan":1}]}]}';
    expect(issuesOf(overlap)).toContain("PLACEMENT_OVERLAP");

    const adjacent =
      '{"schemaVersion":1,"profileId":"p","sport":"CYCLING","pages":[{"columns":4,"rows":4,' +
      '"fields":[{"type":"SPEED","col":0,"row":0,"colSpan":2,"rowSpan":2},' +
      '{"type":"POWER","col":2,"row":0,"colSpan":2,"rowSpan":2}]}]}';
    expect(layoutOf(adjacent).pages[0].fields).toHaveLength(2);
  });

  it("rejects placements outside the grid", () => {
    const raw =
      '{"schemaVersion":1,"profileId":"p","sport":"CYCLING","pages":[{"columns":4,"rows":2,' +
      '"fields":[{"type":"SPEED","col":3,"row":0,"colSpan":2,"rowSpan":1}]}]}';
    expect(issuesOf(raw)).toContain("PLACEMENT_OUT_OF_BOUNDS");
  });

  it("quarantines a present but wrongly typed span instead of normalizing it to one", () => {
    // 손상값을 1로 정상화하면 깨진 payload 가 조용히 "유효한 1칸" 으로 바뀌어 구성이 사라진다.
    const raw =
      '{"schemaVersion":1,"profileId":"p","sport":"CYCLING","pages":[{"columns":4,"rows":2,' +
      '"fields":[{"type":"SPEED","col":0,"row":0,"colSpan":"4","rowSpan":1}]}]}';
    expect(issuesOf(raw)).toContain("WRONG_VALUE_TYPE");
  });

  it("enforces four columns, the row range and the page count", () => {
    expect(
      issuesOf('{"schemaVersion":1,"profileId":"p","sport":"CYCLING","pages":[{"columns":3,"rows":2,"fields":[]}]}'),
    ).toContain("INVALID_COLUMNS");
    for (const rows of [0, 13]) {
      expect(
        issuesOf(
          `{"schemaVersion":1,"profileId":"p","sport":"CYCLING","pages":[{"columns":4,"rows":${rows},"fields":[]}]}`,
        ),
      ).toContain("INVALID_ROWS");
    }
    expect(issuesOf('{"schemaVersion":1,"profileId":"p","sport":"CYCLING","pages":[]}')).toContain(
      "PAGE_COUNT_OUT_OF_RANGE",
    );
    const page = '{"columns":4,"rows":1,"fields":[]}';
    expect(
      issuesOf(
        `{"schemaVersion":1,"profileId":"p","sport":"CYCLING","pages":[${Array(6).fill(page).join(",")}]}`,
      ),
    ).toContain("PAGE_COUNT_OUT_OF_RANGE");
  });

  it("requires bike profile layout documents to be cycling", () => {
    const running =
      '{"schemaVersion":1,"profileId":"p","sport":"RUNNING","pages":[{"columns":4,"rows":1,"fields":[]}]}';
    expect(issuesOf(running, "CYCLING")).toContain("UNKNOWN_SPORT");
    expect(layoutOf(running, "RUNNING").sport).toBe("RUNNING");
  });

  it("rejects oversized payloads before parsing", () => {
    expect(issuesOf(" ".repeat(64 * 1024 + 1))).toEqual(["PAYLOAD_TOO_LARGE"]);
  });
});
