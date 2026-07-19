import { useTranslation } from "react-i18next";
import { LocalizedLink } from "../../components/LocalizedLink";
import type { CoachConsentPolicy, CoachDataCategory } from "../../services/coachConsentClient";
import { Card, Text } from "../../theme/components";

const categoryKeys: Record<CoachDataCategory, string> = {
  user_question: "coach.category.userQuestion",
  training_summary: "coach.category.trainingSummary",
  fitness_metrics: "coach.category.fitnessMetrics",
  active_goal: "coach.category.activeGoal",
  workout_plan: "coach.category.workoutPlan",
  verified_answer: "coach.category.verifiedAnswer",
  answer_evidence: "coach.category.answerEvidence",
  thread_metadata: "coach.category.threadMetadata",
};

function PolicyLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (href.startsWith("/")) return <LocalizedLink to={href}>{children}</LocalizedLink>;
  return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
}

function FullPolicyDisclosure({ policy, stale }: { policy: CoachConsentPolicy; stale: boolean }) {
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

export function CoachPolicyDisclosure({ policy, stale = false, mode = "full" }: {
  policy: CoachConsentPolicy;
  stale?: boolean;
  mode?: "full" | "compact";
}) {
  const { t, i18n } = useTranslation("settings");
  if (mode === "full") return <FullPolicyDisclosure policy={policy} stale={stale} />;
  const countryKey = policy.internationalProcessing.country.trim().toLowerCase();
  const localizedCountry = i18n.language.startsWith("ko")
    ? ({ "united states": t("coach.country.us"), "united states of america": t("coach.country.us"), usa: t("coach.country.us"), us: t("coach.country.us"),
        japan: t("coach.country.jp") }[countryKey] ?? policy.internationalProcessing.country)
    : policy.internationalProcessing.country;
  const distinctRecipient = policy.internationalProcessing.recipient.trim().toLocaleLowerCase()
    !== policy.processor.name.trim().toLocaleLowerCase();
  return (
    <div className="coach-policy-compact">
      <div className="coach-policy-compact__summaries">
        <Card variant="inset" padding="compact">
          <Text as="h3" variant="label">{t("coach.summaryDataTitle")}</Text>
          <ul className="coach-policy-compact__list">
            {policy.dataCategories.map((category) => <li key={category}><Text variant="bodySmall">{t(categoryKeys[category])}</Text></li>)}
          </ul>
        </Card>
        <Card variant="inset" padding="compact">
          <Text as="h3" variant="label">{t("coach.summaryExternalTitle", { country: localizedCountry })}</Text>
          <Text as="p" variant="bodySmall">{policy.processor.name} · {policy.processor.service}</Text>
          {distinctRecipient && <Text as="p" variant="caption" tone="tertiary">
            {policy.internationalProcessing.recipient} · {localizedCountry}
          </Text>}
        </Card>
        <Card variant="inset" padding="compact">
          <Text as="h3" variant="label">{t("coach.summaryStorageTitle")}</Text>
          <Text as="p" variant="bodySmall">{policy.retention}</Text>
          <Text as="p" variant="caption" tone="tertiary">{policy.withdrawal.method} · {policy.withdrawal.effect}</Text>
        </Card>
      </div>
      {policy.changeSummary && (stale || policy.changeSummary.summary) && (
        <Text as="p" variant="bodySmall" tone="warning">
          <strong>{t("coach.changeSummaryLabel")}</strong> {policy.changeSummary.effectiveAt} · {policy.changeSummary.summary}
        </Text>
      )}
      <details className="coach-policy-compact__details">
        <summary><Text variant="label">{t("coach.fullDetailsSummary")}</Text></summary>
        <div className="coach-policy-compact__full">
          <FullPolicyDisclosure policy={policy} stale={stale} />
        </div>
      </details>
    </div>
  );
}
