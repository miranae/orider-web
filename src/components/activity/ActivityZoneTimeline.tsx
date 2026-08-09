import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ActivityStreams, ActivitySummary } from "@shared/types";
import { useAuth } from "../../contexts/AuthContext";
import {
  normalizeActivityStartTimeMs,
  resolveMovingTimeSampleTiming,
  resolveProvidedMovingDurationSec,
  selectMovingAnalysisSeries,
  selectWholeSessionSensorSeries,
} from "../AnalysisTab";
import ZoneTimeline from "../ZoneTimeline";
import { plausibleWatts } from "../../utils/plausibleWatts";
import { resolveHrZone, resolvePowerZone } from "../../utils/zoneAnalysis";
import { resolveActivityHrZones } from "../../utils/hrZones";
import {
  buildActivitySensorSelectionContext,
  type ActivitySensorSelectionContext,
  type AnalysisSensorSeries,
} from "../../features/activity/detail/activityDetailDerived";

interface ActivityZoneTimelineProps {
  streams: ActivityStreams;
  sensorHeartRate?: AnalysisSensorSeries;
  sensorPower?: AnalysisSensorSeries;
  sensorSelectionContext?: ActivitySensorSelectionContext;
  summary?: ActivitySummary;
  sport?: "ride" | "run" | "swim" | "other";
  startTime?: number | null;
  isOwner: boolean;
}

/** Overview-only zone sequence, sharing the analysis tab's sensor selection rules. */
export function ActivityZoneTimeline({
  streams, sensorHeartRate, sensorPower, sensorSelectionContext, summary, sport, startTime, isOwner,
}: ActivityZoneTimelineProps) {
  const { t } = useTranslation("activity");
  const { profile } = useAuth();
  const selectionContext = sensorSelectionContext
    ?? buildActivitySensorSelectionContext(summary, startTime ?? undefined);
  const legacyDurationSec = selectionContext.legacyDurationSec;
  const timeOriginEpochMs = normalizeActivityStartTimeMs(startTime);
  const ftp = profile?.ftp || streams.ftp || 200;
  const hrZones = resolveActivityHrZones({
    isOwner,
    sport,
    profileMaxHr: profile?.maxHr,
    profileLthr: profile?.lthr,
    streamMaxHr: streams.maxHr,
    summaryPeakHr: summary?.maxHeartRate,
  }).zones;
  const power = useMemo(() => selectWholeSessionSensorSeries(
    sensorPower,
    streams.watts && streams.watts.length > 0 ? streams.watts : streams.watts_calc,
    streams.time,
    timeOriginEpochMs,
    legacyDurationSec,
  ), [legacyDurationSec, sensorPower, streams.time, streams.watts, streams.watts_calc, timeOriginEpochMs]);
  const heartRate = useMemo(() => selectWholeSessionSensorSeries(
    sensorHeartRate,
    streams.heartrate,
    streams.time,
    timeOriginEpochMs,
    legacyDurationSec,
  ), [legacyDurationSec, sensorHeartRate, streams.heartrate, streams.time, timeOriginEpochMs]);
  const movingPower = useMemo(
    () => selectMovingAnalysisSeries(power, streams.velocity_smooth, streams.distance),
    [power, streams.distance, streams.velocity_smooth],
  );
  const movingHeartRate = useMemo(
    () => selectMovingAnalysisSeries(heartRate, streams.velocity_smooth, streams.distance),
    [heartRate, streams.distance, streams.velocity_smooth],
  );
  const powerTiming = useMemo(() => resolveMovingTimeSampleTiming(power, summary), [power, summary]);
  const movingPowerTiming = useMemo(() => resolveMovingTimeSampleTiming(movingPower, summary), [movingPower, summary]);
  const movingHeartRateTiming = useMemo(() => resolveMovingTimeSampleTiming(movingHeartRate, summary), [movingHeartRate, summary]);
  const hasPower = plausibleWatts(power.values, ftp, powerTiming) != null;
  const series = useMemo(() => [
    ...(heartRate.values.length > 0 && heartRate.time ? [{
      id: "hr" as const, label: t("analysis.zones.hr"), values: movingHeartRate.values,
      time: movingHeartRate.time, timing: movingHeartRateTiming,
      resolveZone: (value: number) => resolveHrZone(value, hrZones), maxZone: hrZones.zones.length,
    }] : []),
    ...(hasPower && power.time ? [{
      id: "power" as const, label: t("analysis.zones.power"), values: movingPower.values,
      time: movingPower.time, timing: movingPowerTiming,
      resolveZone: (value: number) => resolvePowerZone(value, ftp), maxZone: 7,
    }] : []),
  ], [ftp, hasPower, heartRate.time, heartRate.values.length, hrZones, movingHeartRate.time, movingHeartRate.values, movingHeartRateTiming, movingPower.time, movingPower.values, movingPowerTiming, power.time, t]);

  return <ZoneTimeline series={series} movingDurationSec={resolveProvidedMovingDurationSec(summary)} />;
}
