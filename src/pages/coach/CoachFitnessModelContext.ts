import { createContext, useContext } from "react";
import { useOutletContext } from "react-router-dom";
import type { FitnessModel } from "../../hooks/useFitnessModel";

export const CoachFitnessModelContext = createContext<FitnessModel | null>(null);
export function useCoachFitnessModel() {
  const shared = useContext(CoachFitnessModelContext);
  const outlet = useOutletContext<FitnessModel>();
  return shared ?? outlet;
}

