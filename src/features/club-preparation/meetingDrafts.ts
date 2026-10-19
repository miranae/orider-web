import { parseMeetingDraft, type Meeting } from "./domain";
const PREFIX = "orider.club-preparation.draft.v1.";
const LATEST = `${PREFIX}latest`;
export function draftScope(meeting: Meeting, existing: boolean): string {
  return `${existing ? "edit" : "new"}-${meeting.id}`;
}
export function readDraft(scope: string): {
  meeting?: Meeting;
  baseRevision?: number;
  error?: string;
} {
  try {
    const raw = localStorage.getItem(PREFIX + scope);
    if (!raw) return {};
    const data: unknown = JSON.parse(raw);
    return {
      meeting: parseDraft(data),
      baseRevision:
        typeof data === "object" &&
        data !== null &&
        "draftBaseRevision" in data &&
        typeof data.draftBaseRevision === "number"
          ? data.draftBaseRevision
          : undefined,
    };
  } catch {
    return {
      error:
        "저장된 초안을 복구하지 못했어요. 현재 내용으로 다시 작성하거나 초안을 지워주세요.",
    };
  }
}
export function writeDraft(
  scope: string,
  meeting: Meeting,
  baseRevision?: number,
): void {
  const clean = parseDraft({ ...meeting, registrations: [], notices: [] });
  localStorage.setItem(
    PREFIX + scope,
    JSON.stringify({
      ...clean,
      ...(baseRevision === undefined
        ? {}
        : { draftBaseRevision: baseRevision }),
    }),
  );
  localStorage.setItem(LATEST, scope);
}
export function clearDraft(scope: string): void {
  localStorage.removeItem(PREFIX + scope);
  if (localStorage.getItem(LATEST) === scope) localStorage.removeItem(LATEST);
}
export function latestDraft(): {
  scope?: string;
  meeting?: Meeting;
  baseRevision?: number;
  error?: string;
} {
  try {
    const scope = localStorage.getItem(LATEST);
    if (!scope) return {};
    return { scope, ...readDraft(scope) };
  } catch {
    return {
      error:
        "초안 저장소를 읽지 못했어요. 새로 작성한 내용은 게시 전까지 이 화면에 유지됩니다.",
    };
  }
}

function parseDraft(value: unknown): Meeting {
  if (!value || typeof value !== "object")
    throw new Error("초안 형식이 올바르지 않습니다.");
  const input = value as Record<string, unknown>;
  if (typeof input.capacity !== "number" || typeof input.fee !== "number")
    throw new Error("초안 수치를 확인해주세요.");
  for (const key of ["capacity", "fee", "distanceKm", "elevationGainM"]) {
    if (
      input[key] !== undefined &&
      (typeof input[key] !== "number" || !Number.isFinite(input[key]))
    )
      throw new Error("초안 수치 형식이 올바르지 않습니다.");
  }
  const validated = parseMeetingDraft({
    ...input,
    capacity: 1,
    fee: 0,
    distanceKm: undefined,
    elevationGainM: undefined,
  });
  return {
    ...validated,
    capacity: input.capacity as number,
    fee: input.fee as number,
    distanceKm: input.distanceKm as number | undefined,
    elevationGainM: input.elevationGainM as number | undefined,
  };
}
