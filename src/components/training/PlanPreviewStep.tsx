import { useTranslation } from "react-i18next";
import type { EventType, FeasibilityLabel } from "@shared/types/goal";
import { Card, Text } from "../../theme/components";
import "./goal-preview.css";

export interface PlanPreviewStepProps {
  goal: {
    courseName: string;
    courseDist: number;
    courseElev: number;
    eventType: EventType;
    eventDate: string;       // YYYY-MM-DD
    targetDurationMin?: number;
    weeklySessions: 1 | 2 | 3 | 4 | 5 | 6;
  };
  feasibility: {
    label: FeasibilityLabel;
    requiredWkg?: number;
    sustainableWkg?: number;
    gapWkg?: number;
  };
  loading: boolean;
  /** 이전 호출부 호환용. 계획 생성 전 화면에는 예측값을 표시하지 않는다. */
  projectedCtl?: number;
}


export default function PlanPreviewStep({ goal, loading }: PlanPreviewStepProps) {
  const { t } = useTranslation("training");
  if (loading) return <Card role="status" padding="compact"><Text variant="bodySmall">{t("planPreview.loading")}</Text></Card>;
  const weeks = Math.max(1, Math.round((new Date(goal.eventDate).getTime() - Date.now()) / 604800000));
  return <Card className="goal-preview" padding="compact">
    <Text as="h2" variant="subtitle">{t("previewReview.title")}</Text>
    <Text as="p" variant="bodySmall" tone="secondary">{t("previewReview.notSaved")}</Text>
    <dl className="goal-preview__facts">
      {[
        [t("previewReview.event"), goal.courseName],
        [t("previewReview.distance"), `${goal.courseDist} km`],
        [t("previewReview.elevation"), `${goal.courseElev} m`],
        [t("previewReview.date"), goal.eventDate],
        [t("previewReview.frequency"), t("previewReview.sessions", { count: goal.weeklySessions })],
        [t("previewReview.remaining"), Number.isFinite(weeks) ? t("previewReview.weeks", { weeks }) : "—"],
        ...(goal.targetDurationMin != null ? [[t("previewReview.duration"), t("previewReview.minutes", { count: goal.targetDurationMin })]] : []),
      ].map(([label, value]) => <div key={label}><Text as="dt" variant="caption" tone="secondary">{label}</Text><Text as="dd" variant="bodyMedium" weight={600}>{value}</Text></div>)}
    </dl>
    <Text as="p" variant="bodySmall" tone="secondary">{t("previewReview.pendingPlan")}</Text>
  </Card>;
}
