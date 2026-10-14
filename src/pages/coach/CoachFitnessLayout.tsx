import { Outlet, useOutletContext, useSearchParams, useLocation, Navigate } from "react-router-dom";
import { useFitnessModel, type FitnessModel } from "../../hooks/useFitnessModel";

export function useCoachFitnessModel() { return useOutletContext<FitnessModel>(); }

export default function CoachFitnessLayout() {
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
  return <Outlet context={model} />;
}
