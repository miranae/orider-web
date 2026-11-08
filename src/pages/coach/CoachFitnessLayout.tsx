import { isSportUiEnabled } from "../../config/sportFeatures";
import { CoachQuestionEntry } from "./CoachQuestionEntry";
import { Outlet, useSearchParams, useLocation, Navigate } from "react-router-dom";
import { useFitnessModel } from "../../hooks/useFitnessModel";

export { useCoachFitnessModel } from "./CoachFitnessModelContext";

export default function CoachFitnessLayout() {
  const [params] = useSearchParams();
  const location = useLocation();
  const today = location.pathname.endsWith("/today");
  // 오늘·분석은 종목별 화면이라 통합(tri)이 없다 — 통합으로 들어오면 사이클로 바꾼다.
  const perSport = today || location.pathname.endsWith("/analysis");
  const requestedSport = params.get("sport");
  const sport = requestedSport === "run" || requestedSport === "bike" || requestedSport === "swim" && isSportUiEnabled(requestedSport) || requestedSport === "tri" && !perSport
    ? requestedSport : "bike";
  const model = useFitnessModel(sport, { decisionId: params.get("decisionId") });
  if (requestedSport != null && requestedSport !== sport) {
    const next = new URLSearchParams(params);
    next.set("sport", "bike");
    return <Navigate replace to={{ pathname: location.pathname, search: `?${next}`, hash: location.hash }} />;
  }
  // 오늘 훈련은 화면 안에 "AI 코치에게 분석 요청" 을 둔다 — 떠 있는 버튼을 겹쳐 두지 않는다.
  return <><Outlet context={model} />{!today && <CoachQuestionEntry model={model} page={location.pathname.endsWith("/condition") ? "condition" : "analysis"} />}</>;
}
