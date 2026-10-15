import { CoachQuestionLauncher } from "../../features/coach/CoachQuestionLauncher";
import { useAuth } from "../../contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { Outlet, useOutletContext, useSearchParams, useLocation, Navigate } from "react-router-dom";
import { useFitnessModel, type FitnessModel } from "../../hooks/useFitnessModel";

export function useCoachFitnessModel() { return useOutletContext<FitnessModel>(); }

export default function CoachFitnessLayout() {
  const { user, signInWithGoogle } = useAuth();
  const { t } = useTranslation("training");
  const [params] = useSearchParams();
  const location = useLocation();
  const today = location.pathname.endsWith("/today");
  const sport = today && params.get("sport") === "tri" ? "bike" : params.get("sport");
  const model = useFitnessModel(sport, { decisionId: params.get("decisionId") });
  if (today && params.get("sport") === "tri") {
    const next = new URLSearchParams(params);
    next.set("sport", "bike");
    return <Navigate replace to={{ pathname: location.pathname, search: `?${next}`, hash: location.hash }} />;
  }
  return <><Outlet context={model} />{!location.pathname.endsWith("/chat") && <div data-testid="K6-F" className="fixed bottom-20 right-4"><div data-testid={today ? "K2-5" : undefined}><div data-testid={today ? "K2-5-2" : undefined}><CoachQuestionLauncher user={user} discipline={model.discipline === "tri" ? "bike" : model.discipline} onSignIn={() => void signInWithGoogle()} triggerBlock={false} triggerLabel={t("goalHub.askCoach")} /></div></div></div>}</>;
}
