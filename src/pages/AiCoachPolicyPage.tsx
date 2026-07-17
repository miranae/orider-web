import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CoachPolicyDisclosure } from "../features/coach/CoachPolicyDisclosure";
import { getCoachConsentPolicy, type CoachConsentPolicy } from "../services/coachConsentClient";
import { Card, Text } from "../theme/components";

export default function AiCoachPolicyPage() {
  const { t } = useTranslation("settings");
  const [policy, setPolicy] = useState<CoachConsentPolicy | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void getCoachConsentPolicy().then((loaded) => { if (active) setPolicy(loaded); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  return (
    <main style={{ maxWidth: "var(--content-narrow)", margin: "0 auto", padding: "var(--space-6) var(--space-4)" }}>
      <Text as="h1" variant="title">{policy?.title ?? t("coach.policyPageTitle")}</Text>
      {!policy && !failed && <p>{t("coach.checking")}</p>}
      {failed && <p role="alert">{t("coach.loadFailed")}</p>}
      {policy && <Card style={{ marginTop: "var(--space-4)" }}><CoachPolicyDisclosure policy={policy} /></Card>}
    </main>
  );
}
