import type { ActivityMetrics } from "@shared/types/activity-metrics";
import type { ExportSport } from "./exportSport";

export type ExportCadenceUnit = ActivityMetrics["cadenceUnit"];

/**
 * Cadence as written to an export file.
 *
 * FIT `record.cadence` and TCX `RunCadence` count **one foot** (strides/min) for running and
 * hiking; Garmin Connect and Strava double it for display. Orider-recorded runs store two-foot
 * spm, so writing the stream value as-is showed a 168 spm run as ~336 (same defect the app fixed
 * in g1-app #2805). The stored unit comes from server metrics (`cadenceUnit`): `spm` is halved,
 * `strides_per_minute` is kept, and an unknown unit drops the value — the server rule is that a
 * wrong 2x is worse than no cadence.
 *
 * Cycling (and any non-foot sport) keeps the stream value unchanged.
 */
export interface CadenceWriter {
  /** True when the file should carry one-foot cadence (running, walking, hiking). */
  footCadence: boolean;
  /** Integer cadence for the file, or `null` to write nothing. */
  whole(value: number | null | undefined): number | null;
  /** FIT `fractional_cadence` in 1/128 units for foot sports; `null` when absent. */
  fraction(value: number | null | undefined): number | null;
}

export function cadenceWriter(sport: Pick<ExportSport, "footCadence">, unit: ExportCadenceUnit | undefined): CadenceWriter {
  const toFileUnit = (value: number | null | undefined): number | null => {
    if (value == null || !Number.isFinite(value) || value < 0) return null;
    const sample = !sport.footCadence || unit === "strides_per_minute" ? value : unit === "spm" ? value / 2 : null;
    // FIT reserves 255 for an invalid cadence; TCX accepts an integer byte.
    return sample != null && sample < 255 ? sample : null;
  };
  return {
    footCadence: sport.footCadence,
    whole: value => {
      const v = toFileUnit(value);
      return v == null ? null : Math.floor(v);
    },
    fraction: value => {
      const v = toFileUnit(value);
      return v == null || !sport.footCadence ? null : Math.min(127, Math.round((v - Math.floor(v)) * 128));
    },
  };
}
