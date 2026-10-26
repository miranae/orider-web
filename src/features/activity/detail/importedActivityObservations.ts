import type { ActivityStreams } from "@shared/types";
import { validateImportedSensorObservations, selectImportedSensorObservationSeries, type ImportedSensorChannel } from "@shared/analysis/importedSensorObservations";

export function hasImportedObservations(streams: ActivityStreams | null): boolean {
  return streams != null && Object.prototype.hasOwnProperty.call(streams, "importedSensorObservationsV1");
}
export function importedObservations(streams: ActivityStreams, startTime?: number, durationSec?: number) {
  const raw = (streams as unknown as Record<string, unknown>).importedSensorObservationsV1;
  const block = validateImportedSensorObservations(raw, streams.distance?.length);
  if (!block || block.state !== "available" || startTime != null && (!Number.isSafeInteger(startTime) || block.originEpochMs < startTime)) return null;
  if (startTime != null && durationSec != null && (!Number.isFinite(durationSec) || durationSec <= 0
    || block.originEpochMs + block.timeMs[block.timeMs.length - 1]! > startTime + durationSec * 1000)) return null;
  return block;
}
/** Preserve exact imported point time; rounded legacy time is not an alternative sensor axis. */
export function withImportedObservationTime(streams: ActivityStreams | null, startTime?: number, durationSec?: number): ActivityStreams | null {
  if (!streams || !hasImportedObservations(streams)) return streams;
  const block = importedObservations(streams, startTime, durationSec);
  return block ? { ...streams, time: block.timeMs.map(ms => (ms + block.originEpochMs - (startTime ?? block.originEpochMs)) / 1000) } : streams;
}
export function importedSeries(streams: ActivityStreams, channel: ImportedSensorChannel, startTime?: number, durationSec?: number) {
  const block = importedObservations(streams, startTime, durationSec);
  const series = selectImportedSensorObservationSeries(block, channel);
  return block && series ? { ...series, timeOriginEpochMs: block.originEpochMs,
    fullSessionDurationSec: block.timeMs[block.timeMs.length - 1]! / 1000,
    complete: block[channel].every(value => value != null) && series.segmentStarts.every((start, i) => i === 0 || !start), wholeSessionCoverageAccepted: false } : undefined;
}
export function importedChannelStats(streams: ActivityStreams, channel: ImportedSensorChannel, startTime?: number, durationSec?: number) {
  const series = importedSeries(streams, channel, startTime, durationSec);
  if (!series) return null;
  const duration = series.durationsSec.reduce((sum, value, i) => sum + (channel === "cadence" && series.values[i] === 0 ? 0 : value), 0);
  const sum = series.values.reduce((total, value, i) => total + value * series.durationsSec[i]!, 0);
  const average = duration > 0 ? sum / duration : null;
  return { average: average != null && Number.isFinite(average) ? average : null,
    maximum: series.values.reduce((max, value) => Math.max(max, value), -Infinity) };
}

export function withoutImportedObservations(streams: ActivityStreams): ActivityStreams {
  const copy = { ...streams } as ActivityStreams & { importedSensorObservationsV1?: unknown };
  delete copy.importedSensorObservationsV1;
  return copy;
}
