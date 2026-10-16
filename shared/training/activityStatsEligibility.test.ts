import { expect, it } from "vitest";
import { isStatsCountable } from "./activityStatsEligibility";

it.each([
  [undefined, undefined, true], [null, undefined, true], ["orider", false, true], ["strava", false, true],
  ["apple_health", true, true], ["health_connect", true, true], ["samsung_health", true, true],
  ["apple_health", false, false], ["health_connect", undefined, false], ["samsung_health", 1, false], ["unknown", true, false],
])("통계 인입 정책 source=%s flag=%s", (source, statsCountable, expected) => {
  expect(isStatsCountable({source, statsCountable})).toBe(expected);
});
