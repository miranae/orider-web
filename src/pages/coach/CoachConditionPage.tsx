import { Section, buttonClass } from "../../theme/components";
import { lazy, Suspense, useEffect, useRef } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import CrossDisciplineLoadCard from "../../components/dashboard/CrossDisciplineLoadCard";
import { FitnessView } from "../FitnessPage";
import { useCoachFitnessModel } from "./CoachFitnessLayout";
import { useAuth } from "../../contexts/AuthContext";
import { LocalizedLink } from "../../components/LocalizedLink";

const PaneThresholds = lazy(() => import("../../components/settings/PaneThresholds").then(module => ({ default: module.PaneThresholds })));

export default function CoachConditionPage() {
  const model = useCoachFitnessModel();
  const { lang = "ko" } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation("settings");
  const { hash, key, search } = useLocation();
  const details = useRef<HTMLElement>(null);
  useEffect(() => {
    if (hash !== "#thresholds" || !details.current) return;
    details.current.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [hash, key, user?.uid]);
  const params = new URLSearchParams(search);
  const analysisHashes = ["#condition-metrics", "#condition-ftp", "#ftp-decision"];
  if (model.isMobile && (hash === "#thresholds" || (analysisHashes.includes(hash) && !(hash === "#condition-metrics" && model.discipline === "tri")) || params.has("decisionId"))) {
    const target = hash === "#thresholds" ? "/settings/training" : "/coach/analysis";
    const targetHash = hash === "#condition-metrics" ? "#analysis-comparison" : hash === "#thresholds" ? "#thresholds" : "#ftp-decision";
    return <Navigate replace to={{ pathname: `/${lang}${target}`, search, hash: targetHash }} />;
  }
  const thresholdsSlot = !model.isMobile && user && !user.isAnonymous ? <section id="thresholds" ref={details}
    className="site-shell condition-thresholds-section"
    aria-label={t("training.coachThresholds")}>
    <Section title={t("training.coachThresholds")}>
    <Suspense fallback={<div role="status">{t("common:button.loading")}</div>}><PaneThresholds discipline={model.discipline} /></Suspense>
    <LocalizedLink className={buttonClass({ variant: "ghost" })} data-testid="K1-5-8" to="/settings/device">{t("training.deviceStatus")}</LocalizedLink>
    </Section>
  </section> : null;
  return <><FitnessView model={model} part="condition" hasThresholdSettings={Boolean(thresholdsSlot)} conditionSupplementSlot={model.isMobile && user && !user.isAnonymous && model.discipline === "run" ? <CrossDisciplineLoadCard fitness={model.userFitness} discipline="run" /> : null} />{thresholdsSlot}</>;
}
