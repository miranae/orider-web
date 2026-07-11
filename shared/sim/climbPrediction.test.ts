import { describe, expect, it } from "vitest";
import { formatClimbDuration, predictClimb } from "./climbPrediction";

const climb = { gain: 400, dist: 5000, cat: 3 };

describe("predictClimb", () => {
  it("FTP만 있으면 FTP 지속주 기준 시간과 W/kg을 계산한다", () => {
    const result = predictClimb(climb, { riderWeightKg: 60, ftpW: 240 });

    expect(result?.source).toBe("ftp");
    expect(result?.wattsPerKg).toBe(4);
    expect(result?.totalSec).toBeGreaterThan(0);
    expect(result?.totalSec).toBeCloseTo(1278.35, 1);
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

  it("유효하지 않은 CP는 무시하고 FTP로 폴백한다", () => {
    const result = predictClimb(climb, {
      riderWeightKg: 70,
      cpW: Number.NaN,
      wPrimeJ: Number.POSITIVE_INFINITY,
      ftpW: 250,
    });
    expect(result?.source).toBe("ftp");
    expect(result?.sustainablePowerW).toBe(250);
  });

  it("비정상 장비 물리값은 안전한 기본값으로 대체한다", () => {
    const defaults = predictClimb(climb, { riderWeightKg: 70, ftpW: 250 });
    const invalid = predictClimb(climb, {
      riderWeightKg: 70,
      ftpW: 250,
      bikeWeightKg: -20,
      cda: -1,
      crr: Number.NaN,
      drivetrainEfficiency: 2,
    });
    expect(invalid).toEqual(defaults);
  });

  it("CP 경계값이 유효하면 PDC 경로를 선택한다", () => {
    expect(predictClimb(climb, { riderWeightKg: 70, ftpW: 250, cpW: 1 })?.source).toBe("pdc");
    expect(predictClimb(climb, { riderWeightKg: 70, ftpW: 250, cpW: 2_001 })?.source).toBe("ftp");
  });
});

describe("formatClimbDuration", () => {
  it("1시간 미만과 이상을 읽기 쉬운 시간으로 표시한다", () => {
    expect(formatClimbDuration(744)).toBe("12:24");
    expect(formatClimbDuration(3723)).toBe("1:02:03");
  });
});
