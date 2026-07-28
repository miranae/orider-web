import { createRoot } from "react-dom/client";
import i18n from "../../../src/i18n";
import koCourse from "../../../src/i18n/resources/ko/course.json";
import "../../../src/index.css";
import "../../../src/theme/generated.css";
import "../../../src/theme/components/components.css";
import "../../../src/features/coach/coach-question.css";
import { CoachPmcInsightCard } from "../../../src/features/coach/CoachPmcInsightCard";
import { CoachRiderInsightCard } from "../../../src/features/coach/CoachRiderInsightCard";
import { CoachPrescription } from "../../../src/features/coach/CoachPrescription";
import { CourseRidePlanSection } from "../../../src/features/courses/CourseRidePlanSection";
import { parseCoachPrescription } from "../../../src/services/coachPrescriptionContract";
import progressFixture from "../../../src/features/coach/__fixtures__/p2-web-fixture.json";

if (import.meta.env.MODE !== "evidence") throw new Error("four-axis evidence harness is disabled outside evidence mode");
i18n.addResourceBundle("ko", "course", koCourse, true, true); await i18n.changeLanguage("ko");
const user = { uid: "evidence-test-identity" } as never;
const noOp = () => undefined;

function Harness() {
  const selected = new URLSearchParams(window.location.search).get("surface");
  if (!selected || !["pmc", "rider", "progress", "ride"].includes(selected)) throw new Error("invalid evidence surface");
  return <main data-evidence-harness="four-axis-actual-components">
    <button type="button" data-evidence-start={selected}>Evidence traversal start</button>
    {selected === "pmc" && <div data-evidence-surface="pmc"><CoachPmcInsightCard user={user} discipline="bike" onQuestionSelect={noOp} /></div>}
    {selected === "rider" && <div data-evidence-surface="rider"><CoachRiderInsightCard user={user} discipline="bike" onQuestionSelect={noOp} /></div>}
    {selected === "progress" && <div data-evidence-surface="progress"><CoachPrescription initial={parseCoachPrescription(progressFixture)}
      parentRequestId="018f47a2-3c4d-7abc-8def-000000000201" locale="ko-KR" onReanalyze={noOp}
      onQuestionSelect={noOp} /></div>}
    {selected === "ride" && <div data-evidence-surface="ride"><CourseRidePlanSection courseId="evidence-course" isOwner user={user}
      onSignIn={noOp} /></div>}
  </main>;
}

createRoot(document.getElementById("root")!).render(<Harness />);
