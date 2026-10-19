import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import CrossDisciplineLoadCard from "../../components/dashboard/CrossDisciplineLoadCard";
import { FitnessView } from "../FitnessPage";
import { useCoachFitnessModel } from "./CoachFitnessLayout";
import { useAuth } from "../../contexts/AuthContext";
import { LocalizedLink } from "../../components/LocalizedLink";

const PaneThresholds = lazy(() => import("../../components/settings/PaneThresholds").then(module => ({ default: module.PaneThresholds })));

export default function CoachConditionPage() {
  const model = useCoachFitnessModel();
  const { user } = useAuth();
  const { t } = useTranslation("settings");
  const { hash, key } = useLocation();
  const empty = !model.loading && model.activities.length === 0 && model.fitnessData.length === 0 && !model.currentPoint;
  const [mounted, setMounted] = useState(hash === "#thresholds");
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if ((hash !== "#thresholds" && !empty) || !details.current) return;
    details.current.open = true;
    setMounted(true);
    details.current.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [hash, key, user?.uid, empty]);
  const thresholdsSlot = user && !user.isAnonymous ? <details id="thresholds" ref={details}
    className="rounded-[var(--r-lg)] border border-[var(--line-soft)] p-3"
    onToggle={event => { if (event.currentTarget.open) setMounted(true); }}>
    <summary className="cursor-pointer py-3">{t("training.coachThresholds")}</summary>
    {mounted && <Suspense fallback={<div role="status">{t("common:button.loading")}</div>}><PaneThresholds /></Suspense>}
    <LocalizedLink data-testid="K1-5-8" to="/settings/device">{t("training.deviceStatus")}</LocalizedLink>
  </details> : null;
  return <FitnessView model={model} part="condition" thresholdsSlot={thresholdsSlot} conditionSupplementSlot={model.isMobile && user && !user.isAnonymous && model.discipline === "run" ? <CrossDisciplineLoadCard fitness={model.userFitness} discipline="run" /> : null} />;
}
