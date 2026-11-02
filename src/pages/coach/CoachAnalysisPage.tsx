import CoachActivitySummary from "./CoachActivitySummary";
import CoachSignInButton from "./CoachSignInButton";
import { EmptyState } from "../../components/redesign";
import { Text } from "../../theme/components";
import { FitnessView } from "../FitnessPage";
import { useCoachFitnessModel } from "./CoachFitnessModelContext";
export default function CoachAnalysisPage() {
  const model = useCoachFitnessModel();
  if (!model.user) return <div className="site-shell"><Text data-testid="K5-0-1" as="h1" variant="pageTitle">{model.t("analysis.header.title")}</Text><EmptyState title={model.t("analysis.guest")} /><CoachSignInButton /></div>;
  // 분석에는 통합 탭이 없다 — CoachFitnessLayout 이 tri 를 사이클로 바꿔 다시 연다.
  if (model.discipline === "tri") return null;
  return <FitnessView model={model} part="analysis" analysisSummarySlot={!model.user.isAnonymous ? <CoachActivitySummary key={model.discipline} discipline={model.discipline} /> : null} />;
}
