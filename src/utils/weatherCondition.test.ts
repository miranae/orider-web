import { describe, expect, it } from "vitest";

import ko from "../i18n/resources/ko/activity.json";
import {
  WEATHER_CONDITIONS,
  conditionFromMetricsValue,
  conditionFromWmoCode,
} from "./weatherCondition";

describe("weatherCondition", () => {
  it.each([
    [0, "CLEAR"], [1, "PARTLY_CLOUDY"], [2, "PARTLY_CLOUDY"], [3, "CLOUDY"],
    [45, "FOG"], [48, "FOG"], [51, "DRIZZLE"], [57, "DRIZZLE"],
    [61, "RAIN"], [66, "RAIN"], [81, "RAIN"], [65, "HEAVY_RAIN"], [82, "HEAVY_RAIN"],
    [71, "SNOW"], [86, "SNOW"], [95, "THUNDERSTORM"], [99, "THUNDERSTORM"],
  ])("WMO %i 는 %s", (code, expected) => {
    expect(conditionFromWmoCode(code)).toBe(expected);
  });

  it("모르는 코드는 맑음이 아니라 UNKNOWN", () => {
    expect(conditionFromWmoCode(7)).toBe("UNKNOWN");
    expect(conditionFromWmoCode(-1)).toBe("UNKNOWN");
  });

  it("메트릭 문자열 `wmo_<code>` 를 옮긴다", () => {
    expect(conditionFromMetricsValue("wmo_61")).toBe("RAIN");
    expect(conditionFromMetricsValue(" wmo_0 ")).toBe("CLEAR");
  });

  it("형식이 아니면 UNKNOWN — 없는 값을 맑음으로 채우지 않는다", () => {
    for (const value of [null, undefined, "", "unknown", "61", "wmo_", "wmo_abc"]) {
      expect(conditionFromMetricsValue(value)).toBe("UNKNOWN");
    }
  });

  it("조건 10종 모두 i18n 라벨이 있다", () => {
    for (const condition of WEATHER_CONDITIONS) {
      expect(ko.runCards.weatherCondition[condition]).toBeTruthy();
    }
  });
});
