import { FitnessView } from "../FitnessPage";
import { useCoachFitnessModel } from "./CoachFitnessLayout";
export default function CoachConditionPage() {
  return <FitnessView model={useCoachFitnessModel()} part="condition" />;
}
