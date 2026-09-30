import type { HostBridgeEnvelope } from "./bridge";

/**
 * 계획 탭에서 오늘 예정된 러닝 회차 시작을 네이티브 호스트에 요청하는 브리지 계약.
 *
 * 협상: 웹은 `bootstrap.ready.capabilities` 에 이 문자열을 넣어 "이 메시지를 이해한다"고
 * 알리고, 호스트는 지원할 때만 `host.sessionAccepted.capabilities` 에 같은 문자열을 넣는다.
 * 호스트가 알리지 않으면(구버전 앱) 웹은 `run.startScheduled` 를 보내지 않는다 — 구버전
 * 호스트 코덱은 모르는 타입을 거절하기 때문이다.
 */
export const RUN_START_SCHEDULED_CAPABILITY = "run-start-scheduled-v1" as const;

export const RUN_START_TIMEOUT_MS = 15_000;

export const RUN_START_REJECT_REASONS = [
  "not-today",
  "hold",
  "changed",
  "busy",
  "ride-active",
  "offline",
  "unsupported",
] as const;

export type RunStartRejectReason = (typeof RUN_START_REJECT_REASONS)[number];

/** 호스트 거절 사유 + 웹 측 실패(시간 초과·전송 불가·알 수 없는 사유). */
export type RunStartFailure = RunStartRejectReason | "timeout" | "unavailable" | "unknown";

export type RunStartOutcome = { accepted: true } | { accepted: false; reason: RunStartFailure };

export interface ScheduledRunStarter {
  start(scheduledSessionId: string): Promise<RunStartOutcome>;
}

const REQUEST_ID_MAX = 128;
const SCHEDULED_SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const REASON_SET = new Set<string>(RUN_START_REJECT_REASONS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidScheduledSessionId(value: unknown): value is string {
  return typeof value === "string" && SCHEDULED_SESSION_ID.test(value);
}

export interface RunStartResultMessage {
  requestId: string;
  outcome: RunStartOutcome;
}

/**
 * `host.runStartResult` 검증. payload 는 `{ accepted, reason? }` 만 허용한다.
 * 이후 버전 호스트가 새 사유를 보내도 응답 자체는 받아들여 "unknown" 으로 다룬다
 * (버리면 사용자가 15초 동안 시간 초과를 기다리게 된다).
 */
export function parseRunStartResult(message: HostBridgeEnvelope): RunStartResultMessage | null {
  if (message.type !== "host.runStartResult") return null;
  const requestId = message.requestId;
  if (requestId === undefined || requestId.trim().length === 0 || requestId.length > REQUEST_ID_MAX) return null;
  const payload = message.payload;
  if (!isRecord(payload)) return null;
  if (!Object.keys(payload).every((key) => key === "accepted" || key === "reason")) return null;
  if (typeof payload.accepted !== "boolean") return null;
  if (payload.accepted) {
    if (payload.reason !== undefined) return null;
    return { requestId, outcome: { accepted: true } };
  }
  if (payload.reason === undefined) return { requestId, outcome: { accepted: false, reason: "unknown" } };
  if (typeof payload.reason !== "string" || payload.reason.length > 64) return null;
  const reason: RunStartFailure = REASON_SET.has(payload.reason)
    ? payload.reason as RunStartRejectReason
    : "unknown";
  return { requestId, outcome: { accepted: false, reason } };
}

export interface RunStartChannelOptions {
  send: (payload: { scheduledSessionId: string }, requestId: string) => void;
  createRequestId?: () => string;
  timeoutMs?: number;
}

export interface RunStartChannel extends ScheduledRunStarter {
  /** 호스트 메시지를 넘긴다. 이 채널의 대기 중 요청에 대한 응답이면 true. */
  deliver(message: HostBridgeEnvelope): boolean;
  /** 대기 중인 요청을 모두 전송 불가로 끝낸다. 채널은 이후에도 다시 쓸 수 있다. */
  dispose(): void;
}

function defaultRequestId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `run-start-${uuid}`;
  return `run-start-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** 요청마다 새 requestId 를 쓰고, 같은 requestId 의 첫 응답만 결과로 인정한다. */
export function createRunStartChannel({
  send,
  createRequestId = defaultRequestId,
  timeoutMs = RUN_START_TIMEOUT_MS,
}: RunStartChannelOptions): RunStartChannel {
  const pending = new Map<string, { resolve: (outcome: RunStartOutcome) => void; timer: ReturnType<typeof setTimeout> }>();

  const settle = (requestId: string, outcome: RunStartOutcome) => {
    const entry = pending.get(requestId);
    if (!entry) return false;
    pending.delete(requestId);
    clearTimeout(entry.timer);
    entry.resolve(outcome);
    return true;
  };

  return {
    start(scheduledSessionId) {
      if (!isValidScheduledSessionId(scheduledSessionId)) {
        return Promise.resolve({ accepted: false, reason: "changed" });
      }
      const requestId = createRequestId();
      return new Promise<RunStartOutcome>((resolve) => {
        const timer = setTimeout(() => settle(requestId, { accepted: false, reason: "timeout" }), timeoutMs);
        pending.set(requestId, { resolve, timer });
        try {
          send({ scheduledSessionId }, requestId);
        } catch {
          settle(requestId, { accepted: false, reason: "unavailable" });
        }
      });
    },
    deliver(message) {
      const result = parseRunStartResult(message);
      if (!result) return false;
      return settle(result.requestId, result.outcome);
    },
    dispose() {
      for (const requestId of [...pending.keys()]) {
        settle(requestId, { accepted: false, reason: "unavailable" });
      }
    },
  };
}
