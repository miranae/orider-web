import { describe, expect, it } from "vitest";
import { formatClimbDuration, predictClimb } from "./climbPrediction";

const climb = { gain: 400, dist: 5000, cat: 3 };

describe("predictClimb", () => {
  it("FTP만 있으면 FTP 지속주 기준 시간과 W/kg을 계산한다", () => {
    const result = predictClimb(climb, { riderWeightKg: 60, ftpW: 240 });

    expect(result?.source).toBe("ftp");
    expect(result?.wattsPerKg).toBe(4);
    expect(result?.totalSec).toBeGreaterThan(0);
  });

  it("CP/W′가 있으면 짧은 등반의 지속 가능 파워를 반영한다", () => {
    const result = predictClimb(climb, {
      riderWeightKg: 70,
      ftpW: 240,
      cpW: 250,
      wPrimeJ: 20_000,
    });

    expect(result?.source).toBe("pdc");
    expect(result?.sustainablePowerW).toBeGreaterThan(250);
    expect(result?.wattsPerKg).toBeGreaterThan(250 / 70);
  });

  it("능력치나 유효한 거리·체중이 없으면 예측하지 않는다", () => {
    expect(predictClimb(climb, { riderWeightKg: 70 })).toBeNull();
    expect(predictClimb({ ...climb, dist: 0 }, { riderWeightKg: 70, ftpW: 240 })).toBeNull();
    expect(predictClimb(climb, { riderWeightKg: 0, ftpW: 240 })).toBeNull();
  });
});

describe("formatClimbDuration", () => {
  it("1시간 미만과 이상을 읽기 쉬운 시간으로 표시한다", () => {
    expect(formatClimbDuration(744)).toBe("12:24");
    expect(formatClimbDuration(3723)).toBe("1:02:03");
  });
});
