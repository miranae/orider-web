import { auth, getAppCheckToken } from "./firebase";
import { getRuntimeConfig } from "./runtimeConfig";
import { COACH_RESPONSE_FORMATS, parseCoachV2Response, type CoachResponseFormat, type CoachV2QuestionRequest, type CoachV2Response } from "./coachV2Contract";
import type { CoachDiscipline } from "./coachClient";

export interface CoachThreadSummary {
  threadId: string;
  title: string;
  discipline: CoachDiscipline;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
  revision: number;
}

export interface CoachThreadTurn {
  turnId: string;
  requestId: string;
  question: string;
  createdAt: string;
  response: CoachV2Response;
  responseFormat: CoachResponseFormat;
  sessionRevision: number;
}

export interface CoachThread extends CoachThreadSummary {
  turns: CoachThreadTurn[];
}

export interface CoachThreadDetailPage {
  thread: CoachThread;
  nextCursor: string | null;
}

export interface CoachThreadPage {
  threads: CoachThreadSummary[];
  nextCursor: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAX_CURSOR_LENGTH = 2_048;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function iso(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_UTC.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const normalized = new Date(value).toISOString();
  return value === normalized || value === normalized.replace(".000Z", "Z");
}

function cursor(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length > 0 && value.length <= MAX_CURSOR_LENGTH);
}

function data(input: unknown): Record<string, unknown> {
  const envelope = record(input);
  const payload = record(envelope?.data);
  if (!payload) throw new Error("INVALID_COACH_HISTORY_RESPONSE");
  return payload;
}

export class CoachHistoryTransportError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("COACH_HISTORY_TRANSPORT_UNKNOWN");
    this.name = "CoachHistoryTransportError";
    this.cause = cause;
  }
}

export function isCoachHistoryTransportError(error: unknown): error is CoachHistoryTransportError {
  return error instanceof CoachHistoryTransportError;
}

function parseSummary(value: unknown): CoachThreadSummary {
  const item = record(value);
  if (!item || typeof item.threadId !== "string" || !UUID.test(item.threadId)
      || typeof item.title !== "string" || item.title.length < 1 || item.title.length > 200
      || !["bike", "run", "swim"].includes(String(item.discipline))
      || !iso(item.createdAt) || !iso(item.updatedAt)
      || !Number.isSafeInteger(item.turnCount) || Number(item.turnCount) < 1
      || !Number.isSafeInteger(item.revision) || Number(item.revision) < 1) {
    throw new Error("INVALID_COACH_HISTORY_RESPONSE");
  }
  return {
    threadId: item.threadId,
    title: item.title,
    discipline: item.discipline as CoachDiscipline,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    turnCount: item.turnCount as number,
    revision: item.revision as number,
  };
}

export function parseCoachThreadPage(input: unknown, expectedLimit = 20): CoachThreadPage {
  const safeLimit = Math.min(50, Math.max(1, Math.trunc(expectedLimit)));
  const payload = data(input);
  if (!Array.isArray(payload.threads)
      || payload.threads.length > safeLimit || !cursor(payload.nextCursor)) {
    throw new Error("INVALID_COACH_HISTORY_RESPONSE");
  }
  const threads = payload.threads.map(parseSummary);
  if (new Set(threads.map((thread) => thread.threadId)).size !== threads.length) {
    throw new Error("INVALID_COACH_HISTORY_RESPONSE");
  }
  return { threads, nextCursor: payload.nextCursor as string | null };
}

export function parseCoachThread(input: unknown, expectedLimit = 20): CoachThreadDetailPage {
  const safeLimit = Math.min(20, Math.max(1, Math.trunc(expectedLimit)));
  const payload = data(input);
  const raw = record(payload.thread);
  if (!raw || !Array.isArray(raw.turns)
      || raw.turns.length > safeLimit || !cursor(payload.nextCursor)) {
    throw new Error("INVALID_COACH_HISTORY_RESPONSE");
  }
  const summary = parseSummary(raw);
  const turns = raw.turns.map((value): CoachThreadTurn => {
    const turn = record(value);
    if (!turn || typeof turn.turnId !== "string" || !UUID.test(turn.turnId)
        || typeof turn.requestId !== "string" || !UUID.test(turn.requestId)
        || typeof turn.question !== "string" || turn.question.length < 2 || turn.question.length > 1000
        || !iso(turn.createdAt) || !Number.isSafeInteger(turn.sessionRevision)
        || Number(turn.sessionRevision) < 0) throw new Error("INVALID_COACH_HISTORY_RESPONSE");
    // Detail DTO stores the response document itself; the live endpoint wraps it in { data }.
    const response = parseCoachV2Response({ data: turn.response });
    if (response.requestId !== turn.requestId) throw new Error("INVALID_COACH_HISTORY_RESPONSE");
    const responseFormat = turn.responseFormat === undefined ? "auto" : turn.responseFormat;
    if (!COACH_RESPONSE_FORMATS.includes(responseFormat as CoachResponseFormat)) throw new Error("INVALID_COACH_HISTORY_RESPONSE");
    return { turnId: turn.turnId, requestId: turn.requestId, question: turn.question, createdAt: turn.createdAt,
      response, responseFormat: responseFormat as CoachResponseFormat, sessionRevision: turn.sessionRevision as number };
  });
  const chronological = turns.every((turn, index) => index === 0
    || Date.parse(turns[index - 1]!.createdAt) <= Date.parse(turn.createdAt));
  if (turns.length > summary.turnCount || new Set(turns.map((turn) => turn.turnId)).size !== turns.length || !chronological) {
    throw new Error("INVALID_COACH_HISTORY_RESPONSE");
  }
  return { thread: { ...summary, turns }, nextCursor: payload.nextCursor as string | null };
}

function endpoint(path: string): string {
  const configured = getRuntimeConfig().aiApiBase;
  if (!configured || !configured.startsWith("https://")) throw new Error("AI_API_BASE_INVALID");
  return `${configured.replace(/\/$/, "")}/v1/coach${path}`;
}

async function request(path: string, init?: RequestInit, acceptTerminalData = false): Promise<unknown> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("SIGN_IN_REQUIRED");
  const appCheckToken = await getAppCheckToken();
  let response: Response;
  try {
    response = await fetch(endpoint(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        ...(appCheckToken ? { "X-Firebase-AppCheck": appCheckToken } : {}),
        ...init?.headers,
      },
    });
  } catch (cause) {
    throw new CoachHistoryTransportError(cause);
  }
  if (response.status === 204) return {};
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    // The server may have committed the request even when its response body was truncated in transit.
    throw new CoachHistoryTransportError(cause);
  }
  if (!response.ok && !(acceptTerminalData && record(payload)?.data)) {
    const error = record(record(payload)?.error);
    throw new Error(typeof error?.code === "string" ? error.code : `HTTP_${response.status}`);
  }
  return payload;
}

export async function getCoachThreads(limit = 20, cursor?: string): Promise<CoachThreadPage> {
  const safeLimit = Math.min(50, Math.max(1, Math.trunc(limit)));
  const params = new URLSearchParams({ limit: String(safeLimit) });
  if (cursor) {
    if (cursor.length > MAX_CURSOR_LENGTH) throw new Error("INVALID_COACH_HISTORY_CURSOR");
    params.set("cursor", cursor);
  }
  return parseCoachThreadPage(await request(`/threads?${params}`), safeLimit);
}

export async function getCoachThread(threadId: string, limit = 20, cursor?: string): Promise<CoachThreadDetailPage> {
  const safeLimit = Math.min(20, Math.max(1, Math.trunc(limit)));
  const params = new URLSearchParams({ limit: String(safeLimit) });
  if (cursor) {
    if (cursor.length > MAX_CURSOR_LENGTH) throw new Error("INVALID_COACH_HISTORY_CURSOR");
    params.set("cursor", cursor);
  }
  return parseCoachThread(await request(`/threads/${encodeURIComponent(threadId)}?${params}`), safeLimit);
}

export async function continueCoachThread(threadId: string, body: CoachV2QuestionRequest): Promise<CoachV2Response> {
  const response = parseCoachV2Response(await request(`/threads/${encodeURIComponent(threadId)}/respond`, {
    method: "POST", body: JSON.stringify(body),
  }, true));
  if (response.requestId !== body.requestId) throw new Error("INVALID_COACH_HISTORY_RESPONSE");
  return response;
}

export async function deleteCoachThread(threadId: string): Promise<void> {
  await request(`/threads/${encodeURIComponent(threadId)}`, { method: "DELETE" });
}

export async function deleteAllCoachThreads(): Promise<void> {
  await request("/threads", { method: "DELETE" });
}
