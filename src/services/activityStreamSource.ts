import type { ActivityMetrics } from "@shared/types/activity-metrics";
import type { ActivityStreams } from "@shared/types";

// JSON 필드로 흉내 낼 수 없고, 파워 미리보기 등의 객체 spread에도 유지되는 출처다.
const rawPartRevision = Symbol("rawPartStreamInputRevision");
type RawPartStreams = ActivityStreams & { [rawPartRevision]: string };

export function markRawPartStreams(streams: ActivityStreams, revision: string): ActivityStreams {
  if (!/^[a-f0-9]{64}$/.test(revision)) throw new Error("INVALID_PERSONAL_API_RESPONSE");
  const marked: RawPartStreams = { ...streams, [rawPartRevision]: revision };
  return marked;
}

export function isRawPartStreams(streams: ActivityStreams | null | undefined): boolean {
  return streams != null && typeof (streams as Partial<RawPartStreams>)[rawPartRevision] === "string";
}

const streamCadenceUnit = Symbol("verifiedStreamCadenceUnit");
type CadenceUnit = ActivityMetrics["cadenceUnit"];
type StreamsWithCadenceUnit = ActivityStreams & { [streamCadenceUnit]: CadenceUnit };

export function markVerifiedStreamCadence(streams: ActivityStreams, revision: unknown, unit: unknown): ActivityStreams {
  if (typeof revision !== "string" || !/^[a-f0-9]{64}$/u.test(revision)) return streams;
  return markStreamCadenceUnit(streams, unit);
}

export function markStreamCadenceUnit(streams: ActivityStreams, unit: unknown): ActivityStreams {
  if (unit === undefined) return streams;
  const verified = unit === "rpm" || unit === "spm" || unit === "strides_per_minute" ? unit : null;
  const marked: StreamsWithCadenceUnit = { ...streams, [streamCadenceUnit]: verified };
  return marked;
}

export function readStreamCadenceUnit(streams: ActivityStreams): CadenceUnit {
  return (streams as Partial<StreamsWithCadenceUnit>)[streamCadenceUnit];
}

const legacyStravaStreams = Symbol("legacyStravaStreamsWithoutCadenceContract");
type LegacyStravaStreams = ActivityStreams & { [legacyStravaStreams]: true };

export function markLegacyStravaStreams(streams: ActivityStreams): ActivityStreams {
  const marked: LegacyStravaStreams = { ...streams, [legacyStravaStreams]: true };
  return marked;
}

export function isLegacyStravaStreams(streams: ActivityStreams): boolean {
  return (streams as Partial<LegacyStravaStreams>)[legacyStravaStreams] === true;
}
