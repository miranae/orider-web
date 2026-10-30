import { useTranslation } from "react-i18next";
import type { SufficiencyBlock, SufficiencySet } from "@shared/types/sufficiency";
import type { PmcHistoryPoint } from "../fitness/pmcHistory";
import { Chip, Disclosure, Text } from "../../theme/components";
import { displayedSufficiencyState } from "../../services/sufficiencyContract";
import { SufficiencyInline } from "./SufficiencyBlock";

/** 갱신 진행은 이력 상태를, 품질 평가는 자체 저장 기준 시점을 사용한다. */
export default function LoadQualityEvidence({ set, block, points, testId }: {
  set: SufficiencySet; block: SufficiencyBlock; points: readonly PmcHistoryPoint[]; testId: string;
}) {
  const { t } = useTranslation("fitness");
  const status = ["failed", "stale", "pending"].find(value => points.some(point => point.calculationStatus === value));
  const sourceKey = status ? `history.source.${status}`
    : points.length && points.every(point => point.calculationStatus === "server") ? "history.canonical"
      : points.length && points.every(point => point.calculationStatus === "derived") ? "history.derived"
        : points.some(point => point.calculationStatus) ? "history.estimated" : "history.fallback";
  const state = displayedSufficiencyState(set, block, Date.now());
  return <div className="load-quality-evidence">
    <Text as="h3" variant="subtitle">{t("sufficiency.loadQuality.title")}</Text>
    <Text as="p" variant="bodySmall" role="status">{t("sufficiency.loadQuality.refresh", { status: t(sourceKey) })}</Text>
    {["low_evidence", "processing", "delayed"].includes(state) && <Disclosure title={t("sufficiency.loadQuality.details")} description={state === "low_evidence" ? <Chip variant="warning">{t("sufficiency.chip.lowEvidence")}</Chip> : t(`sufficiency.state.${state}`)}>
      <SufficiencyInline set={set} block={block} testId={testId} />
    </Disclosure>}
  </div>;
}
