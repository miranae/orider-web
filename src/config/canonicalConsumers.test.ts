import { afterEach, describe, expect, it } from "vitest";

import { resetRuntimeConfigForTests } from "../services/runtimeConfig";
import {
  CANONICAL_CONSUMER_DEFAULTS,
  CANONICAL_SURFACES,
  canonicalConsumerEnabled,
  canonicalConsumerFlags,
} from "./canonicalConsumers";

describe("canonicalConsumers", () => {
  afterEach(() => resetRuntimeConfigForTests());

  it("기본은 세 면 모두 꺼짐", () => {
    resetRuntimeConfigForTests({});
    expect(canonicalConsumerFlags()).toEqual(CANONICAL_CONSUMER_DEFAULTS);
    for (const surface of CANONICAL_SURFACES) expect(canonicalConsumerEnabled(surface)).toBe(false);
  });

  it("면마다 독립적으로 켜진다", () => {
    resetRuntimeConfigForTests({ canonicalWeatherEnabled: true });
    expect(canonicalConsumerFlags()).toEqual({ weather: true, course: false, maintenance: false });
  });

  it("true 가 아닌 값은 켜짐으로 보지 않는다", () => {
    resetRuntimeConfigForTests({ canonicalCourseEnabled: undefined });
    expect(canonicalConsumerEnabled("course")).toBe(false);
  });
});
