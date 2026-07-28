import type { ActivityStreams } from "@shared/types";
import { calcVirtualPowerStream, type VirtualPowerParams } from "../../../utils/virtualPower";

import type { ActivityPowerOverride } from "./activityDetailDerived";

const sourceGenerations = new WeakMap<ActivityStreams, number>();
let nextSourceGeneration = 1;

/** Exact immutable provenance for the streams used by virtual-power preview. */
export function buildActivityPowerSourceFingerprint(streams: ActivityStreams | null): string | null {
  if (!streams?.time || !streams.velocity_smooth) return null;
  let generation = sourceGenerations.get(streams);
  if (generation == null) {
    generation = nextSourceGeneration++;
    sourceGenerations.set(streams, generation);
  }
  return `activity-streams:${generation}`;
}

export function resolveActiveActivityPowerOverride(
  routeActivityId: string | undefined,
  loadedActivityId: string | undefined,
  streams: ActivityStreams | null,
  override: ActivityPowerOverride | null | undefined,
  currentParams?: VirtualPowerParams | null,
): ActivityPowerOverride | null {
  if (!routeActivityId || loadedActivityId !== routeActivityId
    || !override || override.activityId !== routeActivityId) return null;
  const sourceFingerprint = buildActivityPowerSourceFingerprint(streams);
  if (sourceFingerprint == null || override.sourceFingerprint !== sourceFingerprint) return null;
  if (currentParams !== undefined) {
    if (currentParams == null || (
      override.params.riderWeightKg !== currentParams.riderWeightKg
      || override.params.bikeWeightKg !== currentParams.bikeWeightKg
      || override.params.rollingResistance !== currentParams.rollingResistance
      || override.params.cdA !== currentParams.cdA
    )) return null;
  }
  return override;
}

export function createActivityPowerOverride(
  activityId: string,
  streams: ActivityStreams,
  params: VirtualPowerParams,
): ActivityPowerOverride | null {
  const sourceFingerprint = buildActivityPowerSourceFingerprint(streams);
  if (!sourceFingerprint || !streams.time || !streams.velocity_smooth) return null;
  return {
    source: "virtualPowerOverride",
    activityId,
    sourceFingerprint,
    params: { ...params },
    values: calcVirtualPowerStream({
      time: streams.time,
      velocity_smooth: streams.velocity_smooth,
      altitude: streams.altitude ?? new Array(streams.time.length).fill(0),
    }, params),
    time: [...streams.time],
  };
}
