import type { ActivityMetrics } from "@shared/types/activity-metrics";
import type { ActivityStreams } from "@shared/types";
import { captureError } from "./sentry";

// JSON 필드로 흉내 낼 수 없고, 파워 미리보기 등의 객체 spread에도 유지되는 출처다.
const rawPartRevision = Symbol("rawPartStreamInputRevision");
const rawPartGridOrigin = Symbol("rawPartGridOrigin");
type RawPartStreams = ActivityStreams & { [rawPartRevision]: string; [rawPartGridOrigin]?: number };

export function markRawPartStreams(streams: ActivityStreams, revision: string, gridOrigin?: unknown): ActivityStreams {
  if (!/^[a-f0-9]{64}$/.test(revision)) throw new Error("INVALID_PERSONAL_API_RESPONSE");
  const marked: RawPartStreams = { ...streams, [rawPartRevision]: revision };
  if (typeof gridOrigin === "number" && Number.isFinite(gridOrigin) && gridOrigin > 0) marked[rawPartGridOrigin] = gridOrigin;
  return marked;
}

export function isRawPartStreams(streams: ActivityStreams | null | undefined): boolean {
  return streams != null && typeof (streams as Partial<RawPartStreams>)[rawPartRevision] === "string";
}

export function readRawPartGridOrigin(streams: ActivityStreams): number | undefined {
  return (streams as Partial<RawPartStreams>)[rawPartGridOrigin];
}

const streamCadenceUnit = Symbol("verifiedStreamCadenceUnit");
const verifiedStreamRevision = Symbol("verifiedStreamRevision");
type CadenceUnit = ActivityMetrics["cadenceUnit"];
type StreamsWithCadenceUnit = ActivityStreams & { [streamCadenceUnit]: CadenceUnit };

export function markVerifiedStreamCadence(streams: ActivityStreams, revision: unknown, unit: unknown): ActivityStreams {
  if (typeof revision !== "string" || !/^[a-f0-9]{64}$/u.test(revision)) return streams;
  return markStreamCadenceUnit({ ...streams, [verifiedStreamRevision]: revision } as ActivityStreams, unit);
}

export function readVerifiedStreamRevision(streams: ActivityStreams): string | undefined {
  const verified = streams as ActivityStreams & { [verifiedStreamRevision]?: string; [rawPartRevision]?: string };
  return verified[verifiedStreamRevision] ?? verified[rawPartRevision];
}

export function markStreamCadenceUnit(streams: ActivityStreams, unit: unknown): ActivityStreams {
  if (unit === undefined) return streams;
  const verified = unit === "rpm" || unit === "spm" || unit === "strides_per_minute" ? unit : null;
  if (unit !== null && verified === null) {
    captureError(new Error("INVALID_ACTIVITY_STREAM_CADENCE_UNIT"), {
      tags: { source: "activityStreamSource" },
      extra: { valueType: typeof unit },
    });
  }
  const marked: StreamsWithCadenceUnit = { ...streams, [streamCadenceUnit]: verified };
  return marked;
}

export function readStreamCadenceUnit(streams: ActivityStreams): CadenceUnit {
  return (streams as Partial<StreamsWithCadenceUnit>)[streamCadenceUnit];
}
