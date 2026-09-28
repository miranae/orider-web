import type { TFunction } from "i18next";

/** 측정/추정과, 미산출 활동을 제외한 부분합계는 별개 상태다. */
export interface TrainingLoadPoint {
  tss: number | null;
  tssEstimated: boolean;
  tssUnknownCount: number;
}

export function formatTrainingLoad(point: TrainingLoadPoint, t: TFunction<"dashboard">): string {
  const labels = [point.tss === null ? t("charts.weeklyChart.tssUnknown")
    : t("charts.weeklyChart.tssValue", { value: point.tss })];
  if (point.tssUnknownCount > 0) labels.push(t("charts.weeklyChart.tssPartial", { count: point.tssUnknownCount }));
  if (point.tssEstimated) labels.push(t("charts.weeklyChart.tssEstimated"));
  return labels.join(" · ");
}
