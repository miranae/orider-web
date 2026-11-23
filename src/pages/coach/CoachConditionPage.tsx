import { EmbeddedOrRouterRedirect } from "../../embedded/EmbeddedNavigationContext";
import { useLocalizedPath } from "../../hooks/useLocalizedNavigate";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { FitnessView } from "../FitnessPage";
import { useCoachFitnessModel } from "./CoachFitnessModelContext";

export default function CoachConditionPage() {
  const model = useCoachFitnessModel();
  const { lang = "ko" } = useParams();
  const { hash, search } = useLocation();
  const params = new URLSearchParams(search);
  const analysisPath = useLocalizedPath(`/coach/analysis${search}${hash === "#condition-metrics" ? "#analysis-comparison" : "#ftp-decision"}`);
  const analysisHashes = ["#condition-metrics", "#condition-ftp", "#ftp-decision"];
  if (hash === "#thresholds" || (analysisHashes.includes(hash) && !(hash === "#condition-metrics" && model.discipline === "tri")) || params.has("decisionId")) {
    const target = hash === "#thresholds" ? "/settings/training" : "/coach/analysis";
    const targetHash = hash === "#condition-metrics" ? "#analysis-comparison" : hash === "#thresholds" ? "#thresholds" : "#ftp-decision";
    return target === "/coach/analysis" ? <Navigate replace to={analysisPath} />
      : <EmbeddedOrRouterRedirect to={`/${lang}${target}${search}${targetHash}`} />;
  }
  return <FitnessView model={model} part="condition" hasThresholdSettings={false} />;
}
