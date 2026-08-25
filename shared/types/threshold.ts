/**
 * 임계값(FTP/LTHR/maxHR) 자동 제안 데이터 모델 — 웹/서버 공용.
 *
 * 레거시 Firestore 경로: users/{uid}/threshold_suggestions/{activityId}
 * - 서버(Cloud Functions)가 활동 스트림 도착 시 작성
 * - 웹이 onSnapshot으로 읽어 배너 노출
 * - 사용자 수락은 acceptThresholdSuggestion onCall 경유 (rules: client write 차단)
 */

export interface ThresholdSuggestionField {
  /** 제안값 — round to int */
  proposed: number;
  /** 현재 프로필 값. 미설정이면 null. */
  current: number | null;
  /** 변화 정보 — FTP는 deltaPct, 심박은 delta */
  deltaPct?: number;
  delta?: number;
  /** UI에 노출할 짧은 사유 문자열 (한국어) */
  reason: string;
}

export interface ThresholdSuggestionDoc {
  activityId: string;
  ftp?: ThresholdSuggestionField;
  lthr?: ThresholdSuggestionField;
  maxHr?: ThresholdSuggestionField;
  createdAt: number;
  accepted?: boolean;
  acceptedAt?: number;
  acceptedFields?: Record<"ftp" | "lthr" | "maxHr", number>;
  dismissed?: boolean;
  dismissedAt?: number;
}

/**
 * FTP 결정 v2. Firestore 경로: users/{uid}/bike_threshold_decisions/{decisionId}
 * 레거시 threshold_suggestions와 collection을 공유하지 않으며 클라이언트는 직접 쓰지 않는다.
 */

export const BIKE_THRESHOLD_DECISION_STATUSES = [
  "actionable",
  "blocked",
  "accepted",
  "expired",
] as const;

export type BikeThresholdDecisionStatus = typeof BIKE_THRESHOLD_DECISION_STATUSES[number];

export interface BikeThresholdDecisionV2 {
  schemaVersion: 2;
  decisionId: string;
  status: BikeThresholdDecisionStatus;
  createdAt: number;
  expiresAt: number;
  candidate: {
    ftp: number;
    currentFtp: number;
    method: "pdc_cp_097" | "activity_20m_095";
    deltaW: number;
    deltaPct: number;
  };
  evidence: {
    powerSource: "measured";
    activityId: string;
    activityRevision: string;
    pdcRevision: string | null;
  };
  expectedRevisions: {
    ftp: string | null;
    pdc: string | null;
    impactPreview: string;
  };
  confidence: {
    level: "medium" | "high";
    score: number;
    reasons: string[];
  };
  impactPreview: {
    revision: string;
    effectiveFrom: "next_ride";
    workoutScalePct: number;
  };
  blockReason?: "increase_over_15_percent" | "activity_pdc_disagreement";
  acceptedAt?: number;
  ftpMutationId?: string;
  ftpGeneration?: number;
}

export const FTP_DEVICE_RECEIPT_STATES = [
  "received",
  "deferred_in_ride",
  "applied_for_next_ride",
  "failed",
  "superseded",
] as const;

export type FtpDeviceReceiptState = typeof FTP_DEVICE_RECEIPT_STATES[number];

export interface FtpDeviceReceipt {
  deviceId: string;
  state: FtpDeviceReceiptState;
  ftpRevision: string;
  ftpGeneration: number;
  acknowledgedAt: number;
  failureCode: string | null;
}

export interface FtpMutationReceipt {
  schemaVersion: 1;
  mutationId: string;
  ftpRevision: string;
  ftpGeneration: number;
  targetedDeviceCount: number;
  pendingCount: number;
  receivedCount: number;
  deferredCount: number;
  appliedCount: number;
  failedCount: number;
  supersededCount: number;
  status: "no_devices" | "pending" | "complete" | "partial" | "failed";
  createdAt: number;
  updatedAt: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmpty);
}

/**
 * 레거시 v1 데이터를 건너뛸 수 있도록 schemaVersion=2가 아니면 조용히 null을 반환한다.
 * v2는 producer의 additive 필드를 허용하되 승인에 쓰는 core revision/evidence만 엄격히 검증한다.
 */
export function parseBikeThresholdDecisionV2(value: unknown): BikeThresholdDecisionV2 | null {
  const raw = record(value);
  if (!raw || raw.schemaVersion !== 2) return null;
  const candidate = record(raw.candidate);
  const evidence = record(raw.evidence);
  const expectedRevisions = record(raw.expectedRevisions);
  const confidence = record(raw.confidence);
  const impactPreview = record(raw.impactPreview);
  if (
    !nonEmpty(raw.decisionId) || !/^bike-ftp-[a-f0-9]{32}$/.test(raw.decisionId) ||
    !BIKE_THRESHOLD_DECISION_STATUSES.includes(raw.status as BikeThresholdDecisionStatus) ||
    !finite(raw.createdAt) || !finite(raw.expiresAt) || raw.expiresAt <= raw.createdAt ||
    !candidate || !finite(candidate.ftp) || candidate.ftp <= 0 ||
    !finite(candidate.currentFtp) || candidate.currentFtp <= 0 ||
    !["pdc_cp_097", "activity_20m_095"].includes(String(candidate.method)) ||
    !finite(candidate.deltaW) || !finite(candidate.deltaPct) ||
    !evidence || evidence.powerSource !== "measured" || !nonEmpty(evidence.activityId) ||
    !nonEmpty(evidence.activityRevision) ||
    !(evidence.pdcRevision === null || nonEmpty(evidence.pdcRevision)) ||
    !expectedRevisions || !(expectedRevisions.ftp === null || nonEmpty(expectedRevisions.ftp)) ||
    !(expectedRevisions.pdc === null || nonEmpty(expectedRevisions.pdc)) ||
    !nonEmpty(expectedRevisions.impactPreview) ||
    !confidence || !["medium", "high"].includes(String(confidence.level)) ||
    !finite(confidence.score) || confidence.score < 0 || confidence.score > 1 ||
    !stringList(confidence.reasons) ||
    !impactPreview || !nonEmpty(impactPreview.revision) || impactPreview.effectiveFrom !== "next_ride" ||
    !finite(impactPreview.workoutScalePct) ||
    impactPreview.revision !== expectedRevisions.impactPreview ||
    !(raw.blockReason === undefined
      || raw.blockReason === "increase_over_15_percent"
      || raw.blockReason === "activity_pdc_disagreement") ||
    !(raw.acceptedAt === undefined || finite(raw.acceptedAt)) ||
    !(raw.ftpMutationId === undefined || nonEmpty(raw.ftpMutationId)) ||
    !(raw.ftpGeneration === undefined || (Number.isInteger(raw.ftpGeneration) && (raw.ftpGeneration as number) >= 1))
  ) return null;
  return raw as unknown as BikeThresholdDecisionV2;
}

export function parseFtpMutationReceipt(value: unknown): FtpMutationReceipt | null {
  const raw = record(value);
  const countKeys = [
    "targetedDeviceCount", "pendingCount", "receivedCount", "deferredCount", "appliedCount", "failedCount", "supersededCount",
  ] as const;
  if (!raw || raw.schemaVersion !== 1 || !nonEmpty(raw.mutationId) || !nonEmpty(raw.ftpRevision) ||
      !["no_devices", "pending", "complete", "partial", "failed"].includes(String(raw.status)) ||
      !countKeys.every((key) => finite(raw[key]) && raw[key] >= 0) ||
      !finite(raw.createdAt) || !finite(raw.updatedAt) ||
      !Number.isInteger(raw.ftpGeneration) || (raw.ftpGeneration as number) < 1) return null;
  return raw as unknown as FtpMutationReceipt;
}

export function parseFtpDeviceReceipt(value: unknown): FtpDeviceReceipt | null {
  const raw = record(value);
  if (!raw || raw.schemaVersion !== 1 || !nonEmpty(raw.deviceId) || !nonEmpty(raw.ftpRevision) ||
      !FTP_DEVICE_RECEIPT_STATES.includes(raw.state as FtpDeviceReceiptState) ||
      !Number.isInteger(raw.ftpGeneration) || (raw.ftpGeneration as number) < 1 ||
      !finite(raw.acknowledgedAt) || !(raw.failureCode === null || typeof raw.failureCode === "string")) return null;
  return {
    deviceId: raw.deviceId,
    state: raw.state as FtpDeviceReceiptState,
    ftpRevision: raw.ftpRevision,
    ftpGeneration: raw.ftpGeneration as number,
    acknowledgedAt: raw.acknowledgedAt,
    failureCode: raw.failureCode as string | null,
  };
}
