import { logClientError } from "../../../services/errorLogger";
import type { SensorRejectionDiagnostic } from "./activityDetailDerived";

const MAX_REJECTIONS_PER_ACTIVITY = 32;
const MAX_ACTIVITY_ID_LENGTH = 128;
const MAX_REPORTED_LENGTH = 10_000_000;

export interface SensorRejectionLogState {
  activityId: string | null;
  keys: Set<string>;
}

type SensorRejectionLogger = (
  source: string,
  error: Error,
  context: Record<string, unknown>,
) => void;

export function createSensorRejectionLogState(): SensorRejectionLogState {
  return { activityId: null, keys: new Set() };
}

function boundedLength(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.min(Math.max(Math.trunc(value), 0), MAX_REPORTED_LENGTH);
}

export function reportSensorRejectionsOnce(
  activityId: string,
  rejections: readonly SensorRejectionDiagnostic[],
  state: SensorRejectionLogState,
  logger: SensorRejectionLogger = logClientError,
): void {
  const boundedActivityId = activityId.slice(0, MAX_ACTIVITY_ID_LENGTH);
  if (state.activityId !== activityId) {
    state.activityId = activityId;
    state.keys.clear();
  }

  for (const rejection of rejections) {
    const key = `${rejection.channel}:${rejection.source}:${rejection.reason}`;
    if (state.keys.has(key) || state.keys.size >= MAX_REJECTIONS_PER_ACTIVITY) continue;
    state.keys.add(key);
    logger(
      `ActivityPage.sensorStreamRejected.${rejection.channel}.${rejection.reason}`,
      new Error("Rejected activity sensor stream"),
      {
        activityId: boundedActivityId,
        channel: rejection.channel,
        sensorSource: rejection.source,
        reason: rejection.reason,
        axisLength: boundedLength(rejection.axisLength),
        channelLength: boundedLength(rejection.channelLength),
      },
    );
  }
}
