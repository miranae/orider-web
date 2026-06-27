import { useTranslation } from "react-i18next";
import { Card } from "../theme/components";

export default function StravaTermsPage() {
  const { t } = useTranslation("legal");
  return (
    <div className="max-w-2xl mx-auto pb-20 space-y-8">
      <div>
        <h1 className="text-[length:var(--fs-2xl)] font-bold tracking-tight text-[var(--ink-0)]">{t("stravaTerms.pageTitle")}</h1>
        <p className="text-[length:var(--fs-sm)] text-[var(--ink-2)] mt-1">{t("stravaTerms.pageSubtitle")}</p>
      </div>

      <Card padding="none" className="divide-y divide-[var(--line-soft)]">
        <Section title={t("stravaTerms.article1.title")}>
          <p>{t("stravaTerms.article1.body")}</p>
        </Section>

        <Section title={t("stravaTerms.article2.title")}>
          <ul className="list-disc list-inside space-y-1.5">
            <li>{t("stravaTerms.article2.item1")}</li>
            <li>{t("stravaTerms.article2.item2")}</li>
          </ul>
        </Section>

        <Section title={t("stravaTerms.article3.title")}>
          <p className="mb-2">{t("stravaTerms.article3.intro")}</p>
          <ul className="list-disc list-inside space-y-1.5">
            <li>{t("stravaTerms.article3.item1")}</li>
            <li>{t("stravaTerms.article3.item2")}</li>
            <li>{t("stravaTerms.article3.item3")}</li>
            <li>{t("stravaTerms.article3.item4")}</li>
          </ul>
          <p className="mt-2">{t("stravaTerms.article3.footer")}</p>
        </Section>

        <Section title={t("stravaTerms.article4.title")}>
          <ul className="list-disc list-inside space-y-1.5">
            <li>{t("stravaTerms.article4.item1")}</li>
            <li>{t("stravaTerms.article4.item2")}</li>
            <li>{t("stravaTerms.article4.item3")}</li>
          </ul>
        </Section>

        <Section title={t("stravaTerms.article5.title")}>
          <ul className="list-disc list-inside space-y-1.5">
            <li>{t("stravaTerms.article5.item1")}</li>
            <li>{t("stravaTerms.article5.item2")}</li>
            <li>{t("stravaTerms.article5.item3")}</li>
          </ul>
        </Section>

        <Section title={t("stravaTerms.article6.title")}>
          <p>{t("stravaTerms.article6.body")}</p>
        </Section>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-5 sm:p-6">
      <h2 className="text-[length:var(--fs-sm)] font-bold text-[var(--ink-0)] mb-3">{title}</h2>
      <div className="text-[length:var(--fs-sm)] text-[var(--ink-2)] leading-relaxed">
        {children}
      </div>
    </div>
  );
}
