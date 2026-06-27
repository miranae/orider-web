import { describe, it, expect } from "vitest";
import {
  parseZwo,
  parseErgMrc,
  parseWorkoutFile,
  toIntervalBlocks,
  estimateWorkoutLoad,
} from "./workoutImport";

const ZWO = `<workout_file>
  <name>Sweet Spot 2x20</name>
  <description>SS intervals</description>
  <workout>
    <Warmup Duration="600" PowerLow="0.5" PowerHigh="0.75"/>
    <SteadyState Duration="1200" Power="0.9"/>
    <IntervalsT Repeat="2" OnDuration="60" OffDuration="120" OnPower="1.2" OffPower="0.5"/>
    <FreeRide Duration="300"/>
    <Cooldown Duration="600" PowerLow="0.75" PowerHigh="0.4"/>
  </workout>
</workout_file>`;

describe("parseZwo", () => {
  it("name/description/steps 파싱 + IntervalsT 반복 전개", () => {
    const w = parseZwo(ZWO);
    expect(w.name).toBe("Sweet Spot 2x20");
    expect(w.description).toBe("SS intervals");
    // warmup + steady + (2× on/off = 4) + freeride + cooldown = 8
    expect(w.steps).toHaveLength(8);
    expect(w.steps[0]).toMatchObject({ durationSec: 600, powerLow: 0.5, powerHigh: 0.75, kind: "warmup" });
    expect(w.steps[1]).toMatchObject({ durationSec: 1200, powerLow: 0.9, powerHigh: 0.9 });
    expect(w.steps[2]).toMatchObject({ durationSec: 60, powerLow: 1.2 }); // on
    expect(w.steps[3]).toMatchObject({ durationSec: 120, powerLow: 0.5, powerHigh: 0.5 }); // off (회복 파워 보존, free 아님)
    expect(w.steps[3]!.kind).toBeUndefined();
    expect(w.steps[6]).toMatchObject({ durationSec: 300, powerLow: null, kind: "free" }); // freeride
    expect(w.steps[7]!.kind).toBe("cooldown");
  });
});

describe("parseErgMrc", () => {
  it(".erg watts → FTP 분율 환산(헤더 FTP)", () => {
    const erg = `[COURSE HEADER]
FTP = 200
DESCRIPTION = Test
[END COURSE HEADER]
[COURSE DATA]
0.00	100
10.00	100
10.00	300
20.00	300
[END COURSE DATA]`;
    const w = parseErgMrc(erg, "erg");
    expect(w.name).toBe("Test");
    // (10,100)-(10,300) 은 0 분 전환(즉시 점프) → 스킵. 유효 스텝 2개.
    expect(w.steps).toHaveLength(2);
    expect(w.steps[0]).toMatchObject({ durationSec: 600, powerLow: 0.5, powerHigh: 0.5 }); // 100/200
    expect(w.steps[1]).toMatchObject({ durationSec: 600, powerLow: 1.5, powerHigh: 1.5 }); // 300/200
  });

  it(".mrc 값은 이미 %FTP", () => {
    const mrc = `[COURSE DATA]
0	50
5	50
5	100
10	100
[END COURSE DATA]`;
    const w = parseErgMrc(mrc, "mrc");
    expect(w.steps).toHaveLength(2);
    expect(w.steps[0]!.powerLow).toBeCloseTo(0.5);
    expect(w.steps[1]!.powerLow).toBeCloseTo(1.0);
    expect(w.steps[0]!.durationSec).toBe(300);
  });
});

describe("parseWorkoutFile dispatch", () => {
  it("확장자/내용으로 분기, 인식불가/빈 워크아웃은 null", () => {
    expect(parseWorkoutFile("a.zwo", ZWO)?.source).toBe("zwo");
    expect(parseWorkoutFile("x.txt", ZWO)?.source).toBe("zwo"); // 내용 휴리스틱
    expect(parseWorkoutFile("a.gpx", "<gpx></gpx>")).toBeNull();
    expect(parseWorkoutFile("empty.zwo", "<workout_file><workout></workout></workout_file>")).toBeNull();
  });
});

describe("toIntervalBlocks", () => {
  it("FTP 로 watts 환산 + 존 라벨", () => {
    const w = parseZwo(ZWO);
    const blocks = toIntervalBlocks(w, 250);
    expect(blocks[0]).toMatchObject({ label: "WU", durationMin: 10, targetPowerW: [125, 188] }); // 0.5~0.75×250
    expect(blocks[1]).toMatchObject({ label: "Z4", durationMin: 20, targetPowerW: [225, 225] }); // 0.9×250
    expect(blocks[2]!.label).toBe("Z5"); // 1.2 on
    expect(blocks[6]!.label).toBe("R"); // freeride
    expect(blocks[6]!.targetPowerW).toBeUndefined(); // free 는 watts 없음
    expect(blocks[7]!.label).toBe("CD");
  });
});

describe("estimateWorkoutLoad", () => {
  it("totalSec/duration/IF/TSS 추정", () => {
    const w = parseZwo(ZWO);
    const load = estimateWorkoutLoad(w);
    expect(load.totalSec).toBe(600 + 1200 + (60 + 120) * 2 + 300 + 600); // 3060
    expect(load.durationMin).toBe(51);
    expect(load.intensityFactor).toBeGreaterThan(0);
    expect(load.intensityFactor).toBeLessThan(1.3);
    expect(load.tss).toBeGreaterThan(0);
  });
});
