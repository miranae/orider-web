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

const cadenceUnit = Symbol("streamCadenceUnit");
type FootCadenceUnit = "spm" | "strides_per_minute";
type StreamsWithCadenceUnit = ActivityStreams & { [cadenceUnit]: FootCadenceUnit | null };

export function markStreamCadenceUnit(streams: ActivityStreams, unit: unknown): ActivityStreams {
  if (unit === undefined) return streams;
  const marked: StreamsWithCadenceUnit = {
    ...streams, [cadenceUnit]: unit === "spm" || unit === "strides_per_minute" ? unit : null,
  };
  return marked;
}

export function readStreamCadenceUnit(streams: ActivityStreams): FootCadenceUnit | null | undefined {
  return (streams as Partial<StreamsWithCadenceUnit>)[cadenceUnit];
}
