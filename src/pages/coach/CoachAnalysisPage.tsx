import CoachActivitySummary from "./CoachActivitySummary";
import CoachSignInButton from "./CoachSignInButton";
import DisciplineTabs from "../../components/redesign/DisciplineTabs";
import { EmptyState } from "../../components/redesign";
import { Text } from "../../theme/components";
import { FitnessView } from "../FitnessPage";
import { useCoachFitnessModel } from "./CoachFitnessModelContext";
export default function CoachAnalysisPage() {
  const model = useCoachFitnessModel();
  if (!model.user) return <div className="site-shell"><Text data-testid="K5-0-1" as="h1" variant="pageTitle">{model.t("analysis.header.title")}</Text><EmptyState title={model.t("analysis.guest")} /><CoachSignInButton /></div>;
  if (model.discipline === "tri") return <div className="site-shell"><Text data-testid="K5-0-1" as="h1" variant="pageTitle">{model.t("analysis.header.title")}</Text><div data-testid="K5-0-2"><DisciplineTabs includeTri /></div><EmptyState title={model.t("analysis.chooseSport")} /></div>;
  return <FitnessView model={model} part="analysis" analysisSummarySlot={!model.user.isAnonymous ? <CoachActivitySummary key={model.discipline} discipline={model.discipline} /> : null} />;
}
