import { isSportUiEnabled } from "../../config/sportFeatures";
import { CoachQuestionLauncher } from "../../features/coach/CoachQuestionLauncher";
import { useAuth } from "../../contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { Outlet, useOutletContext, useSearchParams, useLocation, Navigate } from "react-router-dom";
import { useFitnessModel, type FitnessModel } from "../../hooks/useFitnessModel";

export function useCoachFitnessModel() { return useOutletContext<FitnessModel>(); }

export default function CoachFitnessLayout() {
  const { user, signIn } = useAuth();
  const { t } = useTranslation("training");
  const [params] = useSearchParams();
  const location = useLocation();
  const today = location.pathname.endsWith("/today");
  const condition = location.pathname.endsWith("/condition");
  const requestedSport = params.get("sport");
  const sport = requestedSport === "run" || requestedSport === "bike" || requestedSport === "swim" && isSportUiEnabled(requestedSport) || requestedSport === "tri" && !today
    ? requestedSport : "bike";
  const model = useFitnessModel(sport, { decisionId: params.get("decisionId") });
  if (requestedSport != null && requestedSport !== sport) {
    const next = new URLSearchParams(params);
    next.set("sport", "bike");
    return <Navigate replace to={{ pathname: location.pathname, search: `?${next}`, hash: location.hash }} />;
  }
  return <><Outlet context={model} />{!location.pathname.endsWith("/chat") && <div data-testid="K6-F" className={condition ? "site-shell coach-question-launcher coach-question-launcher--condition" : "coach-question-launcher fixed bottom-20 right-4"}><div data-testid={today ? "K2-5" : undefined}><div data-testid={today ? "K2-5-2" : undefined}><CoachQuestionLauncher user={user} discipline={model.discipline === "tri" ? "bike" : model.discipline} onSignIn={() => void signIn()} triggerBlock={false} triggerLabel={t("goalHub.askCoach")} /></div></div></div>}</>;
}
