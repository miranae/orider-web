import { describe, it, expect } from "vitest";
import { buildRecordShareText, formatRecordDuration } from "./recordShare";

// 실제 i18n 대신 키·값을 그대로 돌려주는 t 스텁으로 분기·보간을 검증한다.
const t = (key: string, opts?: Record<string, unknown>) =>
  `${key}|${JSON.stringify(opts ?? {})}`;

describe("formatRecordDuration", () => {
  it("1시간 미만은 M'SS\"", () => {
    expect(formatRecordDuration(1600)).toBe(`26'40"`);
    expect(formatRecordDuration(281)).toBe(`4'41"`);
  });

  it("1시간 이상은 h:mm'ss\" (하프·풀)", () => {
    expect(formatRecordDuration(7735)).toBe(`2:08'55"`);
    expect(formatRecordDuration(3661)).toBe(`1:01'01"`);
  });
});

describe("buildRecordShareText", () => {
  it("기록 갱신이면 improved 문구 + 단축 초", () => {
    const out = buildRecordShareText({ distanceLabel: "5km", timeSec: 1600, improvedBySec: 41, t });
    expect(out).toContain("runRecord.share.improved");
    expect(out).toContain('"dist":"5km"');
    expect(out).toContain('"time":"26\'40\\""');
    expect(out).toContain('"sec":41');
  });

  it("첫 기록이면 first 문구 (단축 초 없음)", () => {
    const out = buildRecordShareText({ distanceLabel: "하프", timeSec: 7735, improvedBySec: null, t });
    expect(out).toContain("runRecord.share.first");
    expect(out).not.toContain("improved");
    expect(out).toContain('"time":"2:08\'55\\""');
  });
});
