import type { CyclingDynamicsMetrics } from "@shared/types/activity-metrics";

export type CyclingDynamicsCardKind =
  | "balance"
  | "torqueEffectiveness"
  | "pedalSmoothness"
  | "platformCenterOffset"
  | "powerPhaseLeft"
  | "powerPhaseRight"
  | "coverage";

export interface CyclingDynamicsCardDescriptor {
  kind: CyclingDynamicsCardKind;
  value: string;
  unit?: string;
  detailValue?: string;
}

interface DynamicsPresentationInput {
  cyclingDynamics?: CyclingDynamicsMetrics | null;
  /** 구형 activity_metrics 폴백. avg는 우측 비율이다. */
  lrBalance?: { avg: number; asymmetryPct: number } | null;
}

function finite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sidePair(left: number | undefined, right: number | undefined, digits = 1): string | null {
  if (!finite(left) && !finite(right)) return null;
  const format = (value: number | undefined) => finite(value) ? value.toFixed(digits) : "—";
  return `${format(left)} / ${format(right)}`;
}

function phaseValue(phase: { startDeg: number; endDeg: number }): string {
  return `${phase.startDeg.toFixed(0)}°–${phase.endDeg.toFixed(0)}°`;
}

function phaseDetail(phase: { arcDeg: number; peakStartDeg?: number; peakEndDeg?: number }): string {
  const arc = `${phase.arcDeg.toFixed(0)}°`;
  return finite(phase.peakStartDeg) && finite(phase.peakEndDeg)
    ? `${arc}|${phase.peakStartDeg.toFixed(0)}°–${phase.peakEndDeg.toFixed(0)}°`
    : arc;
}

export function buildCyclingDynamicsCards({ cyclingDynamics, lrBalance }: DynamicsPresentationInput): CyclingDynamicsCardDescriptor[] {
  const cards: CyclingDynamicsCardDescriptor[] = [];
  const balance = cyclingDynamics?.balance ?? (lrBalance && finite(lrBalance.avg)
    ? { leftAvgPct: 100 - lrBalance.avg, rightAvgPct: lrBalance.avg, asymmetryPct: lrBalance.asymmetryPct }
    : undefined);

  if (balance) {
    cards.push({
      kind: "balance",
      value: `${balance.leftAvgPct.toFixed(1)} / ${balance.rightAvgPct.toFixed(1)}`,
      unit: "L/R %",
      detailValue: balance.asymmetryPct.toFixed(1),
    });
  }

  const torque = cyclingDynamics?.torqueEffectiveness;
  const torqueValue = torque && sidePair(torque.leftAvgPct, torque.rightAvgPct);
  if (torqueValue) {
    cards.push({ kind: "torqueEffectiveness", value: torqueValue, unit: "L/R %" });
  } else if (finite(torque?.combinedAvgPct)) {
    // 앱 세션 요약 폴백(session_summary) — 좌우 분리값이 없어 합산 하나만 (#2344)
    cards.push({ kind: "torqueEffectiveness", value: torque.combinedAvgPct.toFixed(1), unit: "%" });
  }

  const smoothness = cyclingDynamics?.pedalSmoothness;
  const smoothnessValue = smoothness && sidePair(smoothness.leftAvgPct, smoothness.rightAvgPct);
  if (smoothnessValue) {
    cards.push({ kind: "pedalSmoothness", value: smoothnessValue, unit: "L/R %", detailValue: finite(smoothness?.combinedAvgPct) ? smoothness.combinedAvgPct.toFixed(1) : undefined });
  } else if (finite(smoothness?.combinedAvgPct)) {
    cards.push({ kind: "pedalSmoothness", value: smoothness.combinedAvgPct.toFixed(1), unit: "%" });
  }

  const pco = cyclingDynamics?.platformCenterOffset;
  const pcoValue = pco && sidePair(pco.leftAvgMm, pco.rightAvgMm);
  if (pcoValue) cards.push({ kind: "platformCenterOffset", value: pcoValue, unit: "L/R mm" });

  if (cyclingDynamics?.powerPhase?.left) {
    cards.push({ kind: "powerPhaseLeft", value: phaseValue(cyclingDynamics.powerPhase.left), unit: "L", detailValue: phaseDetail(cyclingDynamics.powerPhase.left) });
  }
  if (cyclingDynamics?.powerPhase?.right) {
    cards.push({ kind: "powerPhaseRight", value: phaseValue(cyclingDynamics.powerPhase.right), unit: "R", detailValue: phaseDetail(cyclingDynamics.powerPhase.right) });
  }

  if (cyclingDynamics && Number.isFinite(cyclingDynamics.coverage)) {
    cards.push({
      kind: "coverage",
      value: `${(cyclingDynamics.coverage * 100).toFixed(0)}`,
      unit: "%",
      detailValue: `${cyclingDynamics.validSampleCount}/${cyclingDynamics.sampleCount}|${cyclingDynamics.source}`,
    });
  }

  return cards;
}
