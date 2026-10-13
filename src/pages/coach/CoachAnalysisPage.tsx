import CoachSignInButton from "./CoachSignInButton";
import DisciplineTabs from "../../components/redesign/DisciplineTabs";
import { EmptyState } from "../../components/redesign";
import { Text } from "../../theme/components";
import { FitnessView } from "../FitnessPage";
import { useCoachFitnessModel } from "./CoachFitnessLayout";
export default function CoachAnalysisPage() {
  const model = useCoachFitnessModel();
  if (!model.user) return <div className="site-shell"><Text as="h1" variant="pageTitle">{model.t("analysis.header.title")}</Text><EmptyState title={model.t("analysis.guest")} /><CoachSignInButton /></div>;
  if (model.discipline === "tri") return <div className="site-shell"><Text as="h1" variant="pageTitle">{model.t("analysis.header.title")}</Text><DisciplineTabs includeTri /><EmptyState title={model.t("analysis.chooseSport")} /></div>;
  return <FitnessView model={model} part="analysis" />;
}
