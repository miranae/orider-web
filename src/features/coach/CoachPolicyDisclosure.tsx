import { useTranslation } from "react-i18next";
import { LocalizedLink } from "../../components/LocalizedLink";
import type { CoachConsentPolicy, CoachDataCategory } from "../../services/coachConsentClient";

const categoryKeys: Record<CoachDataCategory, string> = {
  user_question: "coach.category.userQuestion",
  training_summary: "coach.category.trainingSummary",
  fitness_metrics: "coach.category.fitnessMetrics",
  active_goal: "coach.category.activeGoal",
  workout_plan: "coach.category.workoutPlan",
};

function PolicyLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (href.startsWith("/")) return <LocalizedLink to={href}>{children}</LocalizedLink>;
  return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
}

export function CoachPolicyDisclosure({ policy, stale = false }: { policy: CoachConsentPolicy; stale?: boolean }) {
  const { t } = useTranslation("settings");
  const categoryList = (items: CoachDataCategory[]) => (
    <ul>{items.map((category) => <li key={category}>{t(categoryKeys[category])}</li>)}</ul>
  );
  return (
    <div>
      <p>{t("coach.consentIntro")}</p>
      {categoryList(policy.dataCategories)}
      <dl>
        <dt>{t("coach.processorLabel")}</dt>
        <dd>{policy.processor.name} · {policy.processor.service} · <PolicyLink href={policy.processor.privacyPolicyUrl}>{t("coach.processorPrivacyLink")}</PolicyLink></dd>
        <dt>{t("coach.purposeLabel")}</dt><dd>{policy.purpose}</dd>
        <dt>{t("coach.internationalLabel")}</dt>
        <dd>
          {policy.internationalProcessing.recipient} · {policy.internationalProcessing.country}<br />
          {policy.internationalProcessing.purpose}<br />
          {categoryList(policy.internationalProcessing.dataCategories)}
          {policy.internationalProcessing.timingAndMethod}<br />
          {policy.internationalProcessing.retention}
        </dd>
        <dt>{t("coach.storageLabel")}</dt><dd>{policy.retention}</dd>
        <dt>{t("coach.revocationLabel")}</dt><dd>{policy.withdrawal.method} · {policy.withdrawal.effect}</dd>
      </dl>
      {policy.changeSummary && (stale || policy.changeSummary.summary) && (
        <p><strong>{t("coach.changeSummaryLabel")}</strong> {policy.changeSummary.effectiveAt} · {policy.changeSummary.summary}</p>
      )}
      <p><PolicyLink href={policy.policyDocumentUrl}>{t("coach.policyDocumentLink")}</PolicyLink></p>
      <p><PolicyLink href={policy.privacyPolicyUrl}>{t("coach.privacyLink")}</PolicyLink></p>
    </div>
  );
}
