import { useTranslation } from "react-i18next";
import type { RunNextTrainingSession } from "../../hooks/useRunNextTraining";
import Modal from "../Modal";
import { RunTrainingFacts } from "./RunNextTrainingCard";

/** 단일 닫기 동작만 있는 읽기 전용 미리보기. 예약·완료·편집 명령은 없다. */
export default function RunPlanPreview({ session, onClose }: { session: RunNextTrainingSession; onClose: () => void }) {
  const { t } = useTranslation("activity");
  return <Modal open onClose={onClose} title={t("analysis.run.nextPlan.preview")}>
    <RunTrainingFacts session={session} />
  </Modal>;
}
