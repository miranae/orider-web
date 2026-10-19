import { Section, buttonClass } from "../../theme/components";
import { lazy, Suspense, useEffect, useRef } from "react";
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
  const details = useRef<HTMLElement>(null);
  useEffect(() => {
    if (hash !== "#thresholds" || !details.current) return;
    details.current.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [hash, key, user?.uid]);
  const thresholdsSlot = user && !user.isAnonymous ? <section id="thresholds" ref={details}
    className="site-shell condition-thresholds-section"
    aria-label={t("training.coachThresholds")}>
    <Section title={t("training.coachThresholds")}>
    <Suspense fallback={<div role="status">{t("common:button.loading")}</div>}><PaneThresholds discipline={model.discipline} /></Suspense>
    <LocalizedLink className={buttonClass({ variant: "ghost" })} data-testid="K1-5-8" to="/settings/device">{t("training.deviceStatus")}</LocalizedLink>
    </Section>
  </section> : null;
  return <><FitnessView model={model} part="condition" hasThresholdSettings={Boolean(thresholdsSlot)} conditionSupplementSlot={model.isMobile && user && !user.isAnonymous && model.discipline === "run" ? <CrossDisciplineLoadCard fitness={model.userFitness} discipline="run" /> : null} />{thresholdsSlot}</>;
}
