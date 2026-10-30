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
