import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { RunNextTrainingSession } from "../../hooks/useRunNextTraining";
import Modal from "../Modal";
import { buttonClass } from "../../theme/components";
import { RunTrainingFacts } from "./RunNextTrainingCard";

/** 단일 닫기 동작만 있는 읽기 전용 미리보기. 예약·완료·편집 명령은 없다. */
export default function RunPlanPreview({ session, onClose }: { session: RunNextTrainingSession; onClose: () => void }) {
  const { t } = useTranslation("activity");
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <Modal open onClose={onClose} title={t("analysis.run.nextPlan.preview")}>
    <div role="dialog" aria-modal="true" aria-label={t("analysis.run.nextPlan.preview")} onKeyDown={event => { if (event.key === "Tab") { event.preventDefault(); closeRef.current?.focus(); } }}>
      <RunTrainingFacts session={session} />
      <button ref={closeRef} type="button" onClick={onClose} className={buttonClass({ variant: "primary", size: "sm" })} style={{ marginTop: "var(--space-4)" }}>{t("analysis.run.nextPlan.close")}</button>
    </div>
  </Modal>;
}
