import { useTranslation } from "react-i18next";
import { LocalizedLink as Link } from "../components/LocalizedLink";
import { Card, Text, buttonClass } from "../theme/components";

export const ORGANIZER_BENEFITS = ["live", "results", "group"] as const;

export default function EventOrganizerPage() {
  const { t } = useTranslation("event");
  return <main style={{ maxWidth: 1040, margin: "0 auto", padding: "var(--space-7) 24px" }}>
    <Text as="div" variant="eyebrow">{t("organizerLanding.eyebrow")}</Text>
    <Text as="h1" variant="pageTitle" style={{ marginTop: "var(--space-2)", maxWidth: 720 }}>{t("organizerLanding.title")}</Text>
    <p style={{ color: "var(--ink-2)", marginTop: "var(--space-3)", maxWidth: 680 }}>{t("organizerLanding.description")}</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-3)", margin: "var(--space-6) 0" }}>
      {ORGANIZER_BENEFITS.map((benefit) => <Card key={benefit} padding="none" style={{ padding: "var(--space-5)" }}><Text as="h2" variant="title">{t(`organizerLanding.${benefit}.title`)}</Text><p style={{ color: "var(--ink-3)", marginTop: "var(--space-2)" }}>{t(`organizerLanding.${benefit}.description`)}</p></Card>)}
    </div>
    <Card padding="none" style={{ padding: "var(--space-5)", borderColor: "color-mix(in oklch, var(--lime) 35%, var(--line-soft))" }}>
      <Text as="h2" variant="title">{t("organizerLanding.compare.title")}</Text>
      <p style={{ color: "var(--ink-2)", margin: "var(--space-2) 0 var(--space-4)" }}>{t("organizerLanding.compare.description")}</p>
      <div className="flex flex-wrap" style={{ gap: "var(--space-2)" }}><Link to="/login" className={buttonClass({ variant: "primary" })}>{t("organizerLanding.cta")}</Link><Link to="/events" className={buttonClass({ variant: "secondary" })}>{t("organizerLanding.events")}</Link></div>
    </Card>
  </main>;
}
