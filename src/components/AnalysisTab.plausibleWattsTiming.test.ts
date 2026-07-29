import { describe, expect, it } from "vitest";

import { plausibleWatts } from "../utils/plausibleWatts";
import {
  selectWholeSessionSensorSeries,
  wholeSessionSampleTiming,
} from "./AnalysisTab";

describe("AnalysisTab plausible power timing", () => {
  it.each([0.5, 2, 4])("keeps a sub-five-minute spike below the guard at %s Hz", (rateHz) => {
    const durationSec = 1_200;
    const length = durationSec * rateHz;
    const time = Array.from({ length }, (_, index) => index / rateHz);
    const raw = Array(length).fill(100);
    raw.fill(500, 0, 150 * rateHz);
    const selected = selectWholeSessionSensorSeries(
      undefined,
      raw,
      time,
      undefined,
      durationSec,
    );

    expect(plausibleWatts(raw, 200, wholeSessionSampleTiming(selected))).toEqual(raw);
  });

  it.each([0.5, 2, 4])("rejects an actual five-minute effort at %s Hz", (rateHz) => {
    const durationSec = 1_200;
    const length = durationSec * rateHz;
    const time = Array.from({ length }, (_, index) => index / rateHz);
    const raw = Array(length).fill(100);
    raw.fill(500, 0, 300 * rateHz);
    const selected = selectWholeSessionSensorSeries(
      undefined,
      raw,
      time,
      undefined,
      durationSec,
    );

    expect(plausibleWatts(raw, 200, wholeSessionSampleTiming(selected))).toBeUndefined();
  });
});
