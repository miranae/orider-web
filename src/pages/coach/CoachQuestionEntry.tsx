import { CoachQuestionLauncher } from "../../features/coach/CoachQuestionLauncher";
import { useAuth } from "../../contexts/AuthContext";
import { useTranslation } from "react-i18next";
import type { FitnessModel } from "../../hooks/useFitnessModel";

/** The same coaching entry accompanies the web and the authorized app fitness pages. */
export function CoachQuestionEntry({ model, page }: { model: FitnessModel; page: "condition" | "today" | "analysis" }) {
  const { user, signIn } = useAuth();
  const { t } = useTranslation("training");
  return <div data-testid="K6-F" className={page === "condition" ? "site-shell coach-question-launcher coach-question-launcher--condition" : "coach-question-launcher fixed bottom-20 right-4"}>
    <div data-testid={page === "today" ? "K2-5" : undefined}><div data-testid={page === "today" ? "K2-5-2" : undefined}>
      <CoachQuestionLauncher user={user} discipline={model.discipline === "tri" ? "bike" : model.discipline} onSignIn={() => void signIn()} triggerBlock={false} triggerLabel={t("goalHub.askCoach")} />
    </div></div>
  </div>;
}
