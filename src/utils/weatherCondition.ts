/**
 * WMO 날씨 코드 → 조건 어휘 (#887, 에픽 app#2237 의 P).
 *
 * 서버 정본은 `orider-g1-web/shared/types/weather-canonical.ts` 의 `conditionFromWmoCode`,
 * 앱 정본은 `WeatherCondition.fromWmoCode` 다. 웹에는 이 표가 아예 없어서 활동 메트릭의
 * `weather.condition`(`wmo_<code>`)을 읽고도 쓰지 못했다. **표는 이 파일 하나에만 둔다** —
 * 두 벌이 되는 순간 같은 코드가 화면마다 다른 날씨로 읽힌다.
 *
 * 모르는 코드는 `UNKNOWN` 이다. 맑음으로 낙관하지 않는다.
 */

export const WEATHER_CONDITIONS = [
  "CLEAR", "PARTLY_CLOUDY", "CLOUDY", "FOG", "DRIZZLE", "RAIN", "HEAVY_RAIN", "SNOW", "THUNDERSTORM", "UNKNOWN",
] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

/** 서버 `conditionFromWmoCode` 와 같은 표. 한쪽만 고치면 앱·웹이 갈린다. */
export function conditionFromWmoCode(code: number): WeatherCondition {
  switch (code) {
    case 0: return "CLEAR";
    case 1: case 2: return "PARTLY_CLOUDY";
    case 3: return "CLOUDY";
    case 45: case 48: return "FOG";
    case 51: case 53: case 55: case 56: case 57: return "DRIZZLE";
    case 61: case 63: case 80: case 81: case 66: case 67: return "RAIN";
    case 65: case 82: return "HEAVY_RAIN";
    case 71: case 73: case 75: case 77: case 85: case 86: return "SNOW";
    case 95: case 96: case 99: return "THUNDERSTORM";
    default: return "UNKNOWN";
  }
}

/**
 * 활동 메트릭의 `weather.condition` 문자열을 조건으로 옮긴다.
 * 서버 v22 형식은 `wmo_<code>` 이고, 그 외(빈 값·`unknown`·미래 형식)는 모두 `UNKNOWN` 이다.
 */
export function conditionFromMetricsValue(value: string | null | undefined): WeatherCondition {
  if (typeof value !== "string") return "UNKNOWN";
  const match = /^wmo_(\d{1,3})$/u.exec(value.trim());
  if (!match) return "UNKNOWN";
  return conditionFromWmoCode(Number(match[1]));
}

/** i18n 키. `activity:runCards.weatherCondition.*` 와 1:1. */
export function weatherConditionLabelKey(condition: WeatherCondition): string {
  return `runCards.weatherCondition.${condition}`;
}
