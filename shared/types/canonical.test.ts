import { describe, expect, it } from "vitest";
import {
  CANONICAL_SCHEMA_VERSION,
  CANONICAL_STATUSES,
  canonicalStatusForMissingInput,
  canonicalStatusFromLegacy,
  validateCanonicalEnvelope,
  type CanonicalEnvelope,
  type CanonicalStatus,
} from "./canonical";

function envelope<T>(overrides: Partial<CanonicalEnvelope<T>> = {}): CanonicalEnvelope<T> {
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    algorithmVersion: "fitness@1",
    status: "canonical",
    computedAt: 1000,
    inputRevision: "rev-1",
    inputDigest: "sha-1",
    period: null,
    data: { value: 1 } as unknown as T,
    error: null,
    ...overrides,
  };
}

describe("canonicalStatusFromLegacy", () => {
  it("final + !stale 은 canonical", () => {
    expect(canonicalStatusFromLegacy({ status: "final", stale: false, hasValue: true }))
      .toBe<CanonicalStatus>("canonical");
  });

  it("final + stale 은 stale — 값을 계속 주면서 낡았음을 알린다", () => {
    expect(canonicalStatusFromLegacy({ status: "final", stale: true, hasValue: true }))
      .toBe<CanonicalStatus>("stale");
  });

  it("pending 인데 줄 값이 있으면 stale — last-known-good 을 숨기지 않는다", () => {
    expect(canonicalStatusFromLegacy({ status: "pending", stale: true, hasValue: true }))
      .toBe<CanonicalStatus>("stale");
  });

  it("pending 이고 줄 값이 없으면 processing", () => {
    expect(canonicalStatusFromLegacy({ status: "pending", stale: false, hasValue: false }))
      .toBe<CanonicalStatus>("processing");
  });

  it("invalid 는 failed — stale 여부와 무관하다", () => {
    for (const stale of [true, false]) {
      expect(canonicalStatusFromLegacy({ status: "invalid", stale, hasValue: true }))
        .toBe<CanonicalStatus>("failed");
    }
  });

  it("입력이 없으면 unavailable — 0 이 아니다", () => {
    expect(canonicalStatusForMissingInput()).toBe<CanonicalStatus>("unavailable");
  });

  it("매핑이 5상태를 모두 덮는다", () => {
    const produced = new Set<CanonicalStatus>([
      canonicalStatusFromLegacy({ status: "final", stale: false, hasValue: true }),
      canonicalStatusFromLegacy({ status: "final", stale: true, hasValue: true }),
      canonicalStatusFromLegacy({ status: "pending", stale: false, hasValue: false }),
      canonicalStatusFromLegacy({ status: "invalid", stale: false, hasValue: false }),
      canonicalStatusForMissingInput(),
    ]);
    expect([...produced].sort()).toEqual([...CANONICAL_STATUSES].sort());
  });
});

describe("validateCanonicalEnvelope", () => {
  it("정합한 봉투는 위반이 없다", () => {
    expect(validateCanonicalEnvelope(envelope())).toEqual([]);
  });

  it("processing 에 값을 담으면 위반 — 0 이나 빈 값으로 대체하지 않는다", () => {
    const errors = validateCanonicalEnvelope(envelope({ status: "processing", data: 0 as never }));
    expect(errors.some((e) => e.includes("data 가 null 이어야 한다"))).toBe(true);
  });

  it("unavailable 에 0 을 담으면 위반 — 이 계약의 존재 이유다", () => {
    const errors = validateCanonicalEnvelope(
      envelope({ status: "unavailable", data: 0 as never, computedAt: null }),
    );
    expect(errors.some((e) => e.includes("0 으로 대체하지 않는다"))).toBe(true);
  });

  it("stale 은 값을 줘야 한다 — last-known-good", () => {
    const errors = validateCanonicalEnvelope(envelope({ status: "stale", data: null }));
    expect(errors.some((e) => e.includes("last-known-good"))).toBe(true);
  });

  it("canonical 인데 computedAt 이 없으면 위반", () => {
    const errors = validateCanonicalEnvelope(envelope({ computedAt: null }));
    expect(errors.some((e) => e.includes("computedAt"))).toBe(true);
  });

  it("failed 인데 error 가 없으면 위반 — 실패 이유를 알 수 없다", () => {
    const errors = validateCanonicalEnvelope(envelope({ status: "failed", data: null }));
    expect(errors.some((e) => e.includes("error 가 없다"))).toBe(true);
  });

  it("실패가 아닌 응답에 error 를 담으면 위반", () => {
    const errors = validateCanonicalEnvelope(
      envelope({ error: { code: "X", retryable: false } }),
    );
    expect(errors.some((e) => e.includes("오류를 담지 않는다"))).toBe(true);
  });

  it("algorithmVersion 이 비면 위반 — 값의 출처를 추적할 수 없다", () => {
    const errors = validateCanonicalEnvelope(envelope({ algorithmVersion: "" }));
    expect(errors.some((e) => e.includes("algorithmVersion"))).toBe(true);
  });

  it("schemaVersion 이 다르면 위반", () => {
    const errors = validateCanonicalEnvelope(envelope({ schemaVersion: 99 }));
    expect(errors.some((e) => e.includes("schemaVersion"))).toBe(true);
  });

  describe("period 반개구간", () => {
    const base = { timezone: "Asia/Seoul", asOf: 5000 };

    it("start === end 는 위반 — [start, end) 는 빈 구간을 뜻하지 않는다", () => {
      const errors = validateCanonicalEnvelope(
        envelope({ period: { ...base, start: 1000, end: 1000, rule: "rolling" } }),
      );
      expect(errors.some((e) => e.includes("start < end"))).toBe(true);
    });

    it("start > end 는 위반", () => {
      const errors = validateCanonicalEnvelope(
        envelope({ period: { ...base, start: 2000, end: 1000, rule: "rolling" } }),
      );
      expect(errors.some((e) => e.includes("start < end"))).toBe(true);
    });

    it("rolling 7일은 정합", () => {
      const end = 1_000_000_000;
      const errors = validateCanonicalEnvelope(
        envelope({ period: { ...base, start: end - 7 * 86_400_000, end, rule: "rolling" } }),
      );
      expect(errors).toEqual([]);
    });

    it("calendar 인데 unit 이 없으면 위반", () => {
      const errors = validateCanonicalEnvelope(
        envelope({ period: { ...base, start: 1000, end: 2000, rule: "calendar" } }),
      );
      expect(errors.some((e) => e.includes("unit 이 없다"))).toBe(true);
    });

    it("rolling 에 unit 을 쓰면 위반 — 두 규칙을 섞지 않는다", () => {
      const errors = validateCanonicalEnvelope(
        envelope({ period: { ...base, start: 1000, end: 2000, rule: "rolling", unit: "week" } }),
      );
      expect(errors.some((e) => e.includes("섞지 않는다"))).toBe(true);
    });

    it("timezone 이 비면 위반 — calendar 경계를 정할 수 없다", () => {
      const errors = validateCanonicalEnvelope(
        envelope({ period: { start: 1000, end: 2000, timezone: "", asOf: 5000, rule: "calendar", unit: "week" } }),
      );
      expect(errors.some((e) => e.includes("timezone"))).toBe(true);
    });
  });
});
