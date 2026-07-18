import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Text } from "../../../theme/components";
import { ensureAppCheckReady, firestore, functions } from "../../../services/firebase";
import { logClientError } from "../../../services/errorLogger";

const ACTION_CODES = [
  "CHECK_TIRE_PRESSURE",
  "CHECK_BRAKE_RUB",
  "CHECK_DRIVETRAIN",
  "CHECK_SENSOR",
] as const;

type EquipmentActionCode = typeof ACTION_CODES[number];

const GUIDANCE_BY_ACTION: Record<EquipmentActionCode, string> = {
  CHECK_TIRE_PRESSURE: "coach.equipment.guidance.check_tire_pressure",
  CHECK_BRAKE_RUB: "coach.equipment.guidance.check_brake_rub",
  CHECK_DRIVETRAIN: "coach.equipment.guidance.check_drivetrain",
  CHECK_SENSOR: "coach.equipment.guidance.check_sensor",
};

const PROJECTION_KEYS = [
  "schemaVersion", "projectionKind", "ownerId", "activityId", "signalId", "status",
  "exposure", "actionCode", "guidanceKey", "evidence",
] as const;

const EVIDENCE_KEYS = [
  "evidenceId", "sourceActivityId", "sourceRevision", "field", "value", "unit",
  "startSec", "endSec", "startKm", "endKm", "detectorVersion", "asOf",
] as const;

const NON_EXPOSABLE_STATES = new Set(["dismissed", "inactive", "suppressed"]);

interface EquipmentEvidence {
  evidenceId: string;
  sourceActivityId: string;
  sourceRevision: string;
  field: string;
  value: string | number | boolean;
  unit: string;
  startSec: number;
  endSec: number;
  startKm: number;
  endKm: number;
  detectorVersion: string;
  asOf: string;
}

export interface EquipmentSignalOwnerProjection {
  schemaVersion: "equipment-signal-owner-projection-v1";
  projectionKind: "owner_equipment_signal";
  ownerId: string;
  activityId: string;
  signalId: string;
  status: "active";
  exposure: "eligible";
  actionCode: EquipmentActionCode;
  guidanceKey: string;
  evidence: EquipmentEvidence[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("\u001f") === [...keys].sort().join("\u001f");
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function finiteNonNegative(value: unknown): value is number {
  return finiteNumber(value) && value >= 0;
}

function parseEvidence(value: unknown, activityId: string): EquipmentEvidence | null {
  if (!isRecord(value)) return null;
  const validValue = typeof value.value === "string" || typeof value.value === "boolean" ||
    (typeof value.value === "number" && Number.isFinite(value.value));
  if (
    !exactKeys(value, EVIDENCE_KEYS) ||
    ![value.evidenceId, value.sourceActivityId, value.sourceRevision, value.field, value.unit,
      value.detectorVersion].every(nonEmptyString) || value.sourceActivityId !== activityId ||
    !validValue || ![value.startSec, value.endSec, value.startKm, value.endKm].every(finiteNonNegative) ||
    Number(value.endSec) < Number(value.startSec) || Number(value.endKm) < Number(value.startKm) ||
    typeof value.asOf !== "string" || !Number.isFinite(Date.parse(value.asOf))
  ) return null;
  return value as unknown as EquipmentEvidence;
}

/** 서버의 owner projection만 수용한다. raw/shadow 문서는 이 경로에 들어올 수 없다. */
export function parseEquipmentSignalProjection(
  value: unknown,
  expected: { activityId: string; ownerId: string },
): EquipmentSignalOwnerProjection | null {
  if (!isRecord(value) || !exactKeys(value, PROJECTION_KEYS) ||
      value.schemaVersion !== "equipment-signal-owner-projection-v1" ||
      value.projectionKind !== "owner_equipment_signal" || value.ownerId !== expected.ownerId ||
      value.activityId !== expected.activityId || value.status !== "active" || value.exposure !== "eligible" ||
      !nonEmptyString(value.ownerId) || !nonEmptyString(value.activityId) || !nonEmptyString(value.signalId) ||
      !ACTION_CODES.includes(value.actionCode as EquipmentActionCode) || !Array.isArray(value.evidence) ||
      value.evidence.length === 0 || value.evidence.length > 8) return null;
  const actionCode = value.actionCode as EquipmentActionCode;
  if (value.guidanceKey !== GUIDANCE_BY_ACTION[actionCode]) return null;
  const evidence = value.evidence.map((item) => parseEvidence(item, expected.activityId));
  if (evidence.some((item) => item === null)) return null;
  if (new Set(evidence.map((item) => item!.evidenceId)).size !== evidence.length) return null;
  return { ...value, actionCode, evidence } as EquipmentSignalOwnerProjection;
}

function classifyProjection(
  value: unknown,
  expected: { activityId: string; ownerId: string },
): { kind: "missing" } | { kind: "error" } | { kind: "ready"; projection: EquipmentSignalOwnerProjection } {
  if (isRecord(value) &&
      (NON_EXPOSABLE_STATES.has(String(value.status)) || NON_EXPOSABLE_STATES.has(String(value.exposure)))) {
    return { kind: "missing" };
  }
  const projection = parseEquipmentSignalProjection(value, expected);
  return projection ? { kind: "ready", projection } : { kind: "error" };
}

type LoadState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; projection: EquipmentSignalOwnerProjection }
  | { kind: "error" };

export function EquipmentSignalCard({
  activityId,
  ownerId,
  viewerId,
}: {
  activityId: string;
  ownerId: string;
  viewerId: string | null;
}) {
  const { t } = useTranslation("activity");
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [dismissing, setDismissing] = useState(false);
  const [dismissError, setDismissError] = useState(false);
  const isOwner = viewerId !== null && viewerId === ownerId;

  useEffect(() => {
    if (!isOwner) {
      setState({ kind: "missing" });
      return;
    }
    setState({ kind: "loading" });
    return onSnapshot(
      doc(firestore, "equipment_signal_exposures", activityId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setState({ kind: "missing" });
          return;
        }
        const classified = classifyProjection(snapshot.data(), { activityId, ownerId });
        if (classified.kind === "missing") {
          setState({ kind: "missing" });
          return;
        }
        if (classified.kind === "error") {
          setState({ kind: "error" });
          logClientError("EquipmentSignalCard.invalidProjection", new Error("invalid owner projection"), { activityId });
          return;
        }
        setDismissError(false);
        setState(classified);
      },
      (error) => {
        setState({ kind: "error" });
        logClientError("EquipmentSignalCard.load", error, { activityId });
      },
    );
  }, [activityId, isOwner, ownerId, reloadKey]);

  if (!isOwner || state.kind === "missing") return null;
  if (state.kind === "loading") {
    return (
      <Card aria-busy="true" aria-label={t("equipment.loading")}>
        <div className="h-5 w-40 animate-pulse rounded-[var(--r-sm)] bg-[var(--bg-3)]" />
        <div className="mt-3 h-4 w-full animate-pulse rounded-[var(--r-sm)] bg-[var(--bg-2)]" />
      </Card>
    );
  }
  if (state.kind === "error") {
    return (
      <Alert variant="warning" title={t("equipment.loadErrorTitle")}>
        <p>{t("equipment.loadErrorBody")}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
          {t("page.retry")}
        </Button>
      </Alert>
    );
  }

  const { projection } = state;
  const guidanceKey = `equipment.guidance.${projection.actionCode}`;
  const dismiss = async () => {
    setDismissing(true);
    setDismissError(false);
    try {
      await ensureAppCheckReady();
      const callable = httpsCallable<{ activityId: string; signalId: string }, { result: string }>(
        functions,
        "dismissEquipmentSignalCallable",
      );
      await callable({ activityId, signalId: projection.signalId });
      setState({ kind: "missing" });
    } catch (error) {
      setDismissError(true);
      logClientError("EquipmentSignalCard.dismiss", error, { activityId, signalId: projection.signalId });
    } finally {
      setDismissing(false);
    }
  };

  return (
    <Card
      role="region"
      aria-labelledby={`equipment-signal-title-${projection.signalId}`}
      style={{ borderColor: "color-mix(in srgb, var(--color-warning) 35%, var(--line-soft))" }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Text as="p" variant="eyebrow" tone="warning">{t("equipment.eyebrow")}</Text>
          <Text as="h3" variant="title" id={`equipment-signal-title-${projection.signalId}`}>
            {t(`${guidanceKey}.title`)}
          </Text>
          <Text as="p" tone="secondary" className="mt-2">{t(`${guidanceKey}.body`)}</Text>
        </div>
        <Button
          className="shrink-0"
          size="sm"
          variant="outline"
          loading={dismissing}
          onClick={() => { void dismiss(); }}
        >
          {t("equipment.dismiss")}
        </Button>
      </div>

      <details className="mt-4 rounded-[var(--r-lg)] bg-[var(--bg-2)] p-[var(--space-3)]">
        <summary className="cursor-pointer text-[length:var(--fs-sm)] font-semibold text-[var(--ink-1)]">
          {t("equipment.evidenceTitle", { count: projection.evidence.length })}
        </summary>
        <ul className="mt-3 space-y-3" aria-label={t("equipment.evidenceListLabel")}>
          {projection.evidence.map((evidence) => (
            <li key={evidence.evidenceId} className="break-words border-t border-[var(--line-soft)] pt-3 first:border-t-0 first:pt-0">
              <p className="font-mono text-[length:var(--fs-sm)] font-semibold text-[var(--ink-0)]">
                {evidence.field}: {String(evidence.value)} {evidence.unit}
              </p>
              <p className="mt-1 font-mono text-[length:var(--fs-xs)] text-[var(--ink-2)]">
                {evidence.startSec}–{evidence.endSec} s · {evidence.startKm}–{evidence.endKm} km
              </p>
              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[length:var(--fs-xs)] text-[var(--ink-3)] sm:grid-cols-2">
                <div><dt className="inline font-semibold">evidenceId: </dt><dd className="inline font-mono">{evidence.evidenceId}</dd></div>
                <div><dt className="inline font-semibold">sourceActivityId: </dt><dd className="inline font-mono">{evidence.sourceActivityId}</dd></div>
                <div><dt className="inline font-semibold">sourceRevision: </dt><dd className="inline font-mono">{evidence.sourceRevision}</dd></div>
                <div><dt className="inline font-semibold">detectorVersion: </dt><dd className="inline font-mono">{evidence.detectorVersion}</dd></div>
                <div className="sm:col-span-2"><dt className="inline font-semibold">asOf: </dt><dd className="inline font-mono">{evidence.asOf}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      </details>

      {dismissError && (
        <p className="mt-3 text-[length:var(--fs-sm)] text-[var(--color-error)]" role="alert" aria-live="polite">
          {t("equipment.dismissError")}
        </p>
      )}
      <Text as="p" variant="caption" tone="tertiary" className="mt-3">
        {t("equipment.disclaimer")}
      </Text>
    </Card>
  );
}
